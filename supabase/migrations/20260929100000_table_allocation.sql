-- Per-day shared tables and automatic Premium dedicated tables.
--
-- Additive: no table, meeting or company row is deleted, meeting IDs and times
-- are unchanged, and participant-facing table labels are unchanged.
--
-- Rules (enforced in accept_offer and mirrored in slot_availability):
--   neither participant Premium  -> any free active SHARED table for that day
--   exactly one Premium          -> that organization's DEDICATED table
--   both Premium                 -> the original request recipient's dedicated table
-- A dedicated table never falls back to shared capacity or to another
-- organization's table. Active Premium organizations are assumed to take part
-- on every event day, so each gets one dedicated table per day.
--
-- Concurrency: booking, capacity changes, dedicated-table changes and venue
-- reassignment all take the same transaction-scoped advisory lock that
-- accept_offer already used, so a table can't be switched off while another
-- transaction books it. The exclusion constraints remain the final guarantee.

-- ---------------------------------------------------------------------------
-- 1. Tables become per day, shared or dedicated
-- ---------------------------------------------------------------------------

create type public.table_kind as enum ('shared', 'dedicated');

alter table public.meeting_tables
  add column event_date date,
  add column kind public.table_kind not null default 'shared',
  add column owner_company_id uuid references public.companies (id) on delete cascade,
  add column number int,
  drop constraint meeting_tables_label_key;  -- labels become unique per day (below)

-- Existing tables belong to the first event day; their numbers come from the label.
update public.meeting_tables
set event_date = (select event_dates[1] from public.event_config),
    number = coalesce(nullif(regexp_replace(label, '\D', '', 'g'), '')::int, id);

-- The same shared tables, with the same labels, for every other event day.
insert into public.meeting_tables (label, location, is_active, event_date, kind, number)
select t.label, t.location, t.is_active, d, 'shared', t.number
from public.meeting_tables t
cross join public.event_config c
cross join lateral unnest(c.event_dates[2:]) as d
where t.event_date = c.event_dates[1];

-- Change log for any meeting whose table row changes. Participants see an
-- entry only when the label they were shown actually changed.
create table public.meeting_venue_changes (
  id bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  from_table_id int not null references public.meeting_tables (id),
  to_table_id int not null references public.meeting_tables (id),
  from_label text not null,
  to_label text not null,
  reason text not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on public.meeting_venue_changes (meeting_id);

-- Meetings on a later day move to that day's table with the same label.
with moves as (
  select m.id as meeting_id, m.table_id as from_id, nt.id as to_id, t.label
  from public.meetings m
  join public.meeting_tables t on t.id = m.table_id
  cross join public.event_config c
  join public.meeting_tables nt
    on nt.event_date = (m.starts_at at time zone c.timezone)::date and nt.label = t.label and nt.kind = 'shared'
  where t.event_date <> (m.starts_at at time zone c.timezone)::date
), logged as (
  insert into public.meeting_venue_changes (meeting_id, from_table_id, to_table_id, from_label, to_label, reason)
  select meeting_id, from_id, to_id, label, label, 'Per-day table migration (label unchanged)' from moves
)
update public.meetings m set table_id = moves.to_id from moves where m.id = moves.meeting_id;

alter table public.meeting_tables
  alter column event_date set not null,
  alter column number set not null,
  add constraint meeting_tables_day_label unique (event_date, label),
  add constraint meeting_tables_day_kind_number unique (event_date, kind, number),
  add constraint meeting_tables_owner check ((kind = 'dedicated') = (owner_company_id is not null));

-- Exactly one dedicated table per organization per day, ever: reactivation
-- reuses the row, so repeated saves can't create more.
create unique index meeting_tables_one_dedicated
  on public.meeting_tables (owner_company_id, event_date) where kind = 'dedicated';

-- A meeting's table must belong to the meeting's day.
create function public.check_meeting_table_day() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.meeting_tables t, public.event_config c
    where t.id = new.table_id and t.event_date = (new.starts_at at time zone c.timezone)::date
  ) then
    raise exception 'table_wrong_day';
  end if;
  return new;
end $$;

create trigger check_meeting_table_day before insert or update of table_id, starts_at on public.meetings
  for each row execute function public.check_meeting_table_day();

-- ---------------------------------------------------------------------------
-- 2. Demo flag: seeded test fixtures, shown with a notice in the app
-- ---------------------------------------------------------------------------

alter table public.companies add column is_demo boolean not null default false;

update public.companies c set is_demo = true
from public.company_accounts a
where a.company_id = c.id and a.login_email::text like '%@b2bcafe.test';

-- ---------------------------------------------------------------------------
-- 3. Dedicated tables follow tier and participation
-- ---------------------------------------------------------------------------

-- Readable list of upcoming confirmed meetings on an organization's dedicated tables.
create function public.dedicated_bookings(p_company uuid) returns text
language sql stable set search_path = '' as $$
  select string_agg(
    to_char(m.starts_at at time zone c.timezone, 'Mon DD, HH12:MI AM') || ' · ' || t.label || ' · '
      || ca.name || ' and ' || cb.name,
    '; ' order by m.starts_at)
  from public.meetings m
  join public.meeting_tables t on t.id = m.table_id
  join public.threads th on th.id = m.thread_id
  join public.companies ca on ca.id = th.company_a_id
  join public.companies cb on cb.id = th.company_b_id
  cross join public.event_config c
  where t.kind = 'dedicated' and t.owner_company_id = p_company
    and m.status = 'confirmed' and m.ends_at > now()
$$;

-- Creates or re-activates one dedicated table per event day for an active
-- Premium organization; otherwise switches its unused tables off. Refuses
-- (rolling back the tier/participation change) when upcoming confirmed
-- meetings are on those tables.
create function public.apply_dedicated_tables(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_wants boolean;
  v_blocking text;
  v_location text;
  d date;
begin
  perform pg_advisory_xact_lock(hashtext('b2b_cafe_accept'));
  select is_active and tier = 'premium' into v_wants from public.companies where id = p_company;
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

create function public.companies_dedicated_tables() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_dedicated_tables(new.id);
  return new;
end $$;

create trigger dedicated_tables_on_insert after insert on public.companies
  for each row execute function public.companies_dedicated_tables();
create trigger dedicated_tables_on_update after update of tier, is_active on public.companies
  for each row when (old.tier is distinct from new.tier or old.is_active is distinct from new.is_active)
  execute function public.companies_dedicated_tables();

-- Existing active Premium organizations, in name order for stable labels.
do $$
declare r record;
begin
  for r in select id from public.companies where is_active and tier = 'premium' order by name loop
    perform public.apply_dedicated_tables(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Which table a meeting uses
-- ---------------------------------------------------------------------------

-- The Premium organization whose dedicated table hosts a meeting between a
-- and b, or null for shared tables. Both Premium: the original recipient.
create function public.meeting_host(p_a uuid, p_b uuid, p_first_proposer uuid) returns uuid
language sql stable set search_path = '' as $$
  select case
    when pa and pb then case when p_first_proposer = p_a then p_b else p_a end
    when pa then p_a
    when pb then p_b
  end
  from (select
    (select tier = 'premium' from public.companies where id = p_a) as pa,
    (select tier = 'premium' from public.companies where id = p_b) as pb) x
$$;

drop function public.slot_availability(uuid, date);

-- Advisory availability for the slot picker. p_thread (optional) keeps the
-- Premium-to-Premium host stable when suggesting another time.
create function public.slot_availability(p_target uuid, p_date date, p_thread uuid default null)
returns table (
  starts_at timestamptz, ends_at timestamptz, self_busy boolean, target_busy boolean,
  free_tables int, dedicated boolean, table_missing boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  v_first uuid := v_me;  -- a new request: the caller would be the first proposer
  v_host uuid;
  v_table int;
begin
  if v_me is null or not exists (select 1 from public.companies where id = p_target and is_active) then return; end if;
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

-- Atomic booking, replacing the prototype version: same checks, plus the
-- table rules above, all re-read inside the lock.
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
  if (select count(*) from public.companies
      where id in (t.company_a_id, t.company_b_id) and is_active) <> 2 then
    raise exception 'company_unavailable';
  end if;
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

-- ---------------------------------------------------------------------------
-- 5. Organizer: shared capacity per day (preview, then apply)
-- ---------------------------------------------------------------------------

-- Sets the number of active shared tables for one day. Increases re-activate
-- the lowest-numbered inactive tables first, then add new numbers. Decreases
-- switch off only tables with no confirmed meetings, highest numbers first.
-- Nothing is ever renumbered or deleted. If a decrease can't be done safely,
-- nothing changes and the blocking bookings are returned.
create function public.admin_set_shared_tables(p_date date, p_count int, p_apply boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_active int;
  v_max int;
  v_location text;
  v_activate int[] := '{}';
  v_create int[] := '{}';
  v_deactivate int[] := '{}';
  v_blocked jsonb := '[]';
  v_n int;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_count is null or p_count < 0 or p_count > 500 then raise exception 'invalid_count'; end if;
  if not exists (select 1 from public.event_config where p_date = any (event_dates)) then raise exception 'invalid_date'; end if;

  perform pg_advisory_xact_lock(hashtext('b2b_cafe_accept'));

  select count(*) into v_active from public.meeting_tables where event_date = p_date and kind = 'shared' and is_active;
  select coalesce(max(number), 0) into v_max from public.meeting_tables where event_date = p_date and kind = 'shared';

  if p_count > v_active then
    select coalesce(array_agg(number order by number), '{}') into v_activate
    from (select number from public.meeting_tables
          where event_date = p_date and kind = 'shared' and not is_active
          order by number limit p_count - v_active) x;
    v_n := p_count - v_active - coalesce(array_length(v_activate, 1), 0);
    if v_n > 0 then v_create := array(select v_max + i from generate_series(1, v_n) i); end if;
  elsif p_count < v_active then
    select coalesce(array_agg(number order by number desc), '{}') into v_deactivate
    from (select mt.number from public.meeting_tables mt
          where mt.event_date = p_date and mt.kind = 'shared' and mt.is_active
            and not exists (select 1 from public.meetings m where m.table_id = mt.id and m.status = 'confirmed')
          order by mt.number desc limit v_active - p_count) x;
    if coalesce(array_length(v_deactivate, 1), 0) < v_active - p_count then
      select coalesce(jsonb_agg(jsonb_build_object(
          'table', mt.label,
          'starts_at', m.starts_at,
          'ends_at', m.ends_at,
          'companies', ca.name || ' and ' || cb.name) order by mt.number, m.starts_at), '[]')
        into v_blocked
      from public.meetings m
      join public.meeting_tables mt on mt.id = m.table_id
      join public.threads th on th.id = m.thread_id
      join public.companies ca on ca.id = th.company_a_id
      join public.companies cb on cb.id = th.company_b_id
      where mt.event_date = p_date and mt.kind = 'shared' and mt.is_active and m.status = 'confirmed';
      return jsonb_build_object('ok', false, 'active', v_active, 'requested', p_count,
        'booked_tables', (select count(distinct m.table_id) from public.meetings m join public.meeting_tables mt on mt.id = m.table_id
                          where mt.event_date = p_date and mt.kind = 'shared' and mt.is_active and m.status = 'confirmed'),
        'blocked', v_blocked);
    end if;
  end if;

  if p_apply then
    update public.meeting_tables set is_active = true
    where event_date = p_date and kind = 'shared' and number = any (v_activate);
    update public.meeting_tables set is_active = false
    where event_date = p_date and kind = 'shared' and number = any (v_deactivate);
    v_location := coalesce((select location from public.meeting_tables where kind = 'shared' order by id limit 1), 'B2B Café');
    insert into public.meeting_tables (label, location, event_date, kind, number)
    select 'Table ' || n, v_location, p_date, 'shared', n from unnest(v_create) n;
  end if;

  return jsonb_build_object('ok', true, 'applied', p_apply, 'active', v_active, 'requested', p_count,
    'activate', (select coalesce(jsonb_agg('Table ' || n), '[]') from unnest(v_activate) n),
    'create', (select coalesce(jsonb_agg('Table ' || n), '[]') from unnest(v_create) n),
    'deactivate', (select coalesce(jsonb_agg('Table ' || n), '[]') from unnest(v_deactivate) n));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Organizer: reviewed venue reconciliation for existing meetings
-- ---------------------------------------------------------------------------

-- Upcoming confirmed meetings whose table doesn't follow the current rules
-- (for example, booked on a shared table before dedicated tables existed).
-- Preview lists every change; apply moves them all or none, logs each one,
-- and marks the request as updated so both organizations see it.
create function public.admin_reconcile_venues(p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_plan jsonb;
  v_bad int;
  r record;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtext('b2b_cafe_accept'));

  create temporary table plan on commit drop as
  select m.id as meeting_id, m.thread_id, m.starts_at, m.ends_at,
         ca.name || ' and ' || cb.name as companies,
         cur.id as from_id, cur.label as from_label,
         tgt.id as to_id, tgt.label as to_label,
         tgt.id is not null and exists (
           select 1 from public.meetings x
           where x.table_id = tgt.id and x.status = 'confirmed' and x.id <> m.id and x.slot && m.slot) as conflict
  from public.meetings m
  join public.threads th on th.id = m.thread_id
  join public.companies ca on ca.id = th.company_a_id
  join public.companies cb on cb.id = th.company_b_id
  join public.meeting_tables cur on cur.id = m.table_id
  cross join public.event_config c
  cross join lateral (select public.meeting_host(th.company_a_id, th.company_b_id,
    (select proposer_company_id from public.offers where thread_id = th.id and version = 1)) as host) h
  left join public.meeting_tables tgt
    on tgt.kind = 'dedicated' and tgt.owner_company_id = h.host and tgt.is_active
   and tgt.event_date = (m.starts_at at time zone c.timezone)::date
  where m.status = 'confirmed' and m.ends_at > now()
    and h.host is not null and m.table_id is distinct from tgt.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'meeting_id', meeting_id, 'starts_at', starts_at, 'ends_at', ends_at, 'companies', companies,
      'from', from_label, 'to', to_label, 'conflict', conflict) order by starts_at), '[]'),
    count(*) filter (where to_id is null or conflict)
    into v_plan, v_bad
  from plan;

  if not p_apply then return jsonb_build_object('ok', v_bad = 0, 'applied', false, 'changes', v_plan); end if;
  if v_bad > 0 then return jsonb_build_object('ok', false, 'applied', false, 'changes', v_plan); end if;

  for r in select * from plan loop
    update public.meetings set table_id = r.to_id where id = r.meeting_id;
    insert into public.meeting_venue_changes (meeting_id, from_table_id, to_table_id, from_label, to_label, reason, changed_by)
    values (r.meeting_id, r.from_id, r.to_id, r.from_label, r.to_label, 'Moved to the Premium organization''s dedicated table', auth.uid());
    update public.threads set last_activity_at = now() where id = r.thread_id;
  end loop;
  return jsonb_build_object('ok', true, 'applied', true, 'changes', v_plan);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Access
-- ---------------------------------------------------------------------------

alter table public.meeting_venue_changes enable row level security;

create policy "meeting_venue_changes: participants and admins" on public.meeting_venue_changes
  for select to authenticated
  using (
    exists (
      select 1 from public.meetings m
      join public.threads t on t.id = m.thread_id
      where m.id = meeting_venue_changes.meeting_id
        and (select public.current_company_id()) in (t.company_a_id, t.company_b_id)
    )
    or (select public.is_admin())
  );

revoke all on public.meeting_venue_changes from anon;
revoke insert, update, delete, truncate on public.meeting_venue_changes from authenticated;
grant select on public.meeting_venue_changes to authenticated;
-- meeting_tables stays read-only for clients (revoked in the init migration);
-- organizers change it only through admin_set_shared_tables.

revoke execute on function public.check_meeting_table_day() from public, anon, authenticated;
revoke execute on function public.dedicated_bookings(uuid) from public, anon, authenticated;
revoke execute on function public.apply_dedicated_tables(uuid) from public, anon, authenticated;
revoke execute on function public.companies_dedicated_tables() from public, anon, authenticated;
revoke execute on function public.meeting_host(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.slot_availability(uuid, date, uuid) from public, anon;
revoke execute on function public.admin_set_shared_tables(date, int, boolean) from public, anon;
revoke execute on function public.admin_reconcile_venues(boolean) from public, anon;
grant execute on function public.slot_availability(uuid, date, uuid) to authenticated;
grant execute on function public.admin_set_shared_tables(date, int, boolean) to authenticated;
grant execute on function public.admin_reconcile_venues(boolean) to authenticated;
