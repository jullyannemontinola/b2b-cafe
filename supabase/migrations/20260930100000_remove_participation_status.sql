-- Remove participant activation (companies.is_active). Every registered
-- organization is an approved participant; access is governed by its account
-- (company_accounts.status) alone.
--
-- Safe for existing data: previously deactivated organizations become regular
-- participants first (their accounts, profiles, requests and meetings are
-- untouched), then every function, policy and trigger that read the column is
-- replaced, and only then is the column dropped. Table switch-off
-- (meeting_tables.is_active) is a different feature and stays.

-- 1. Deactivated organizations become regular participants. The Premium
--    dedicated-table trigger fires for any that are Premium.
update public.companies set is_active = true where not is_active;

-- 2. Caller helper: any linked organization.
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.company_id from public.app_users u where u.id = auth.uid()
$$;

-- 3. Participants see every organization; organizers see all anyway.
drop policy "companies: active participants read active companies" on public.companies;
create policy "companies: participants and admins read" on public.companies
  for select to authenticated
  using ((select public.current_company_id()) is not null or (select public.is_admin()));

-- 4. Requests.
create or replace function public.propose_meeting(
  p_target uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_message text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  v_thread uuid;
begin
  if v_me is null then raise exception 'not_authorized'; end if;
  if p_target = v_me then raise exception 'self_proposal'; end if;
  if not exists (select 1 from public.companies where id = p_target) then
    raise exception 'company_unavailable';
  end if;
  if not public.is_valid_slot(p_starts_at, p_ends_at) then raise exception 'invalid_slot'; end if;
  if char_length(p_message) > 1000 then raise exception 'message_too_long'; end if;

  insert into public.threads (company_a_id, company_b_id, a_last_read_at, b_last_read_at)
  values (
    least(v_me, p_target), greatest(v_me, p_target),
    case when v_me < p_target then now() end,
    case when v_me > p_target then now() end
  )
  on conflict (company_a_id, company_b_id) do nothing
  returning id into v_thread;

  if v_thread is null then raise exception 'thread_exists'; end if;

  insert into public.offers (thread_id, version, proposer_company_id, starts_at, ends_at, message)
  values (v_thread, 1, v_me, p_starts_at, p_ends_at, nullif(trim(p_message), ''));

  return v_thread;
end $$;

create or replace function public.counter_offer(
  p_thread uuid, p_expected_version int, p_starts_at timestamptz, p_ends_at timestamptz,
  p_message text default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  t public.threads;
begin
  t := public.lock_turn(p_thread, p_expected_version, v_me);
  if not public.is_valid_slot(p_starts_at, p_ends_at) then raise exception 'invalid_slot'; end if;
  if char_length(p_message) > 1000 then raise exception 'message_too_long'; end if;

  insert into public.offers (thread_id, version, proposer_company_id, starts_at, ends_at, message)
  values (t.id, t.current_version + 1, v_me, p_starts_at, p_ends_at, nullif(trim(p_message), ''));

  update public.threads set
    current_version = current_version + 1,
    last_activity_at = now(),
    a_last_read_at = case when company_a_id = v_me then now() else a_last_read_at end,
    b_last_read_at = case when company_b_id = v_me then now() else b_last_read_at end
  where id = t.id;

  return t.current_version + 1;
end $$;

-- 5. Availability: unchanged except for the activation check.
create or replace function public.slot_availability(p_target uuid, p_date date, p_thread uuid default null)
returns table (
  starts_at timestamptz, ends_at timestamptz, self_busy boolean, target_busy boolean,
  free_tables int, dedicated boolean, table_missing boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  v_first uuid := v_me;
  v_host uuid;
  v_table int;
begin
  if v_me is null or not exists (select 1 from public.companies where id = p_target) then return; end if;
  if p_thread is not null then
    select o.proposer_company_id into v_first
    from public.threads t join public.offers o on o.thread_id = t.id and o.version = 1
    where t.id = p_thread and v_me in (t.company_a_id, t.company_b_id) and p_target in (t.company_a_id, t.company_b_id);
    v_first := coalesce(v_first, v_me);
  end if;
  v_host := public.meeting_host(v_me, p_target, v_first);
  if v_host is not null then
    select id into v_table from public.meeting_tables
    where kind = 'dedicated' and owner_company_id = v_host and event_date = p_date and is_active;
  end if;

  return query
  with slots as (
    select s, s + make_interval(mins => c.slot_minutes) as e
    from public.event_config c,
      generate_series(
        (p_date + c.day_start) at time zone c.timezone,
        ((p_date + c.day_end) at time zone c.timezone) - make_interval(mins => c.slot_minutes),
        make_interval(mins => c.slot_minutes)
      ) s
    where p_date = any (c.event_dates)
  )
  select
    sl.s, sl.e,
    exists (select 1 from public.meeting_participants p where p.company_id = v_me and p.slot && tstzrange(sl.s, sl.e, '[)')),
    exists (select 1 from public.meeting_participants p where p.company_id = p_target and p.slot && tstzrange(sl.s, sl.e, '[)')),
    case
      when v_host is null then (
        select count(*)::int from public.meeting_tables mt
        where mt.is_active and mt.kind = 'shared' and mt.event_date = p_date and not exists (
          select 1 from public.meetings m
          where m.table_id = mt.id and m.status = 'confirmed' and m.slot && tstzrange(sl.s, sl.e, '[)')))
      when v_table is null then 0
      else (case when exists (
          select 1 from public.meetings m
          where m.table_id = v_table and m.status = 'confirmed' and m.slot && tstzrange(sl.s, sl.e, '[)'))
        then 0 else 1 end)
    end,
    v_host is not null,
    v_host is not null and v_table is null
  from slots sl
  order by sl.s;
end $$;

-- 6. Booking: unchanged except for the activation check.
create or replace function public.accept_offer(p_thread uuid, p_expected_version int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  t public.threads;
  o public.offers;
  v_range tstzrange;
  v_day date;
  v_host uuid;
  v_table int;
  v_meeting uuid;
begin
  if v_me is null then raise exception 'not_authorized'; end if;

  -- ponytail: one global lock serialises acceptances, capacity changes and
  -- dedicated-table changes. Fine at event scale; per-day locks if throughput matters.
  perform pg_advisory_xact_lock(hashtext('b2b_cafe_accept'));

  select * into t from public.threads where id = p_thread for update;
  if not found or v_me not in (t.company_a_id, t.company_b_id) then raise exception 'not_found'; end if;

  select * into o from public.offers where thread_id = t.id and version = p_expected_version;
  if not found then raise exception 'stale_offer'; end if;

  -- Idempotent retry: this exact offer was already booked.
  if t.status = 'confirmed' then
    select id into v_meeting from public.meetings where thread_id = t.id and offer_id = o.id;
    if found then return v_meeting; end if;
  end if;

  if t.status <> 'pending' then raise exception 'thread_closed'; end if;
  if t.current_version <> p_expected_version then raise exception 'stale_offer'; end if;
  if o.proposer_company_id = v_me then raise exception 'not_your_turn'; end if;
  if not public.is_valid_slot(o.starts_at, o.ends_at) then raise exception 'invalid_slot'; end if;

  v_range := tstzrange(o.starts_at, o.ends_at, '[)');
  v_day := (o.starts_at at time zone (select timezone from public.event_config))::date;

  if exists (
    select 1 from public.meeting_participants p
    where p.company_id in (t.company_a_id, t.company_b_id) and p.slot && v_range
  ) then
    raise exception 'company_conflict';
  end if;

  -- Current tiers decide the table, not the tiers at request time.
  v_host := public.meeting_host(t.company_a_id, t.company_b_id,
    (select proposer_company_id from public.offers where thread_id = t.id and version = 1));

  if v_host is null then
    select mt.id into v_table
    from public.meeting_tables mt
    where mt.is_active and mt.kind = 'shared' and mt.event_date = v_day
      and not exists (
        select 1 from public.meetings m
        where m.table_id = mt.id and m.status = 'confirmed' and m.slot && v_range
      )
    order by mt.number
    limit 1;
    if v_table is null then raise exception 'no_table'; end if;
  else
    select mt.id into v_table from public.meeting_tables mt
    where mt.kind = 'dedicated' and mt.owner_company_id = v_host and mt.event_date = v_day and mt.is_active;
    if v_table is null then raise exception 'no_dedicated_table'; end if;
    if exists (
      select 1 from public.meetings m
      where m.table_id = v_table and m.status = 'confirmed' and m.slot && v_range
    ) then
      raise exception 'dedicated_table_busy';
    end if;
  end if;

  insert into public.meetings (thread_id, offer_id, table_id, starts_at, ends_at)
  values (t.id, o.id, v_table, o.starts_at, o.ends_at)
  returning id into v_meeting;

  insert into public.meeting_participants (meeting_id, company_id, slot)
  values (v_meeting, t.company_a_id, v_range), (v_meeting, t.company_b_id, v_range);

  update public.threads set
    status = 'confirmed',
    last_activity_at = now(),
    a_last_read_at = case when company_a_id = v_me then now() else a_last_read_at end,
    b_last_read_at = case when company_b_id = v_me then now() else b_last_read_at end
  where id = t.id;

  return v_meeting;
exception
  when exclusion_violation then raise exception 'booking_conflict';
end $$;

-- 7. Dedicated tables now follow the tier alone.
create or replace function public.apply_dedicated_tables(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_wants boolean;
  v_blocking text;
  v_location text;
  d date;
begin
  perform pg_advisory_xact_lock(hashtext('b2b_cafe_accept'));
  select tier = 'premium' into v_wants from public.companies where id = p_company;
  if v_wants is null then return; end if;

  if v_wants then
    v_location := coalesce((select location from public.meeting_tables where kind = 'shared' order by id limit 1), 'B2B Café');
    foreach d in array (select event_dates from public.event_config) loop
      insert into public.meeting_tables (label, location, event_date, kind, owner_company_id, number)
      select 'Premium table ' || n, v_location, d, 'dedicated', p_company, n
      from (select coalesce(max(number), 0) + 1 as n from public.meeting_tables where event_date = d and kind = 'dedicated') x
      on conflict (owner_company_id, event_date) where kind = 'dedicated' do update set is_active = true;
    end loop;
  else
    v_blocking := public.dedicated_bookings(p_company);
    if v_blocking is not null then
      raise exception 'dedicated_table_in_use' using detail = v_blocking;
    end if;
    update public.meeting_tables set is_active = false
    where owner_company_id = p_company and kind = 'dedicated' and is_active;
  end if;
end $$;

drop trigger dedicated_tables_on_update on public.companies;
create trigger dedicated_tables_on_update after update of tier on public.companies
  for each row when (old.tier is distinct from new.tier)
  execute function public.companies_dedicated_tables();

-- 8. Nothing reads the column any more.
alter table public.companies drop column is_active;
