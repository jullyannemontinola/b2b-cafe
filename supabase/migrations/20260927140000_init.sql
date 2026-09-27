-- B2B Café prototype schema.
-- All writes to scheduling data go through the SECURITY DEFINER functions at the
-- bottom of this file; clients only ever SELECT, and RLS decides what they see.

create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

create type public.company_tier as enum ('premium', 'access', 'matching_pool');
create type public.thread_status as enum ('pending', 'confirmed', 'declined');
create type public.meeting_status as enum ('confirmed');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  contact_email extensions.citext not null,   -- business contact, not the login
  contact_name text not null,
  contact_phone text,
  business_type text not null,
  tier public.company_tier not null,
  logo_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null unique references public.companies (id),  -- one account per company
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meeting_tables (
  id int generated always as identity primary key,
  label text not null unique,
  location text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Single source of truth for the event schedule. The DB functions validate
-- against it and the UI reads it. Operating hours are a PROTOTYPE ASSUMPTION.
create table public.event_config (
  id boolean primary key default true check (id),
  timezone text not null,
  event_dates date[] not null,
  day_start time not null,
  day_end time not null check (day_end > day_start),
  slot_minutes int not null check (slot_minutes > 0),
  updated_at timestamptz not null default now()
);

insert into public.event_config (timezone, event_dates, day_start, day_end, slot_minutes)
values ('Asia/Manila', array['2026-11-10', '2026-11-11']::date[], '09:00', '17:00', 30);

-- One negotiation per unordered company pair: the pair is stored as (lower, higher).
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  company_a_id uuid not null references public.companies (id),
  company_b_id uuid not null references public.companies (id),
  status public.thread_status not null default 'pending',
  current_version int not null default 1,
  last_activity_at timestamptz not null default now(),
  a_last_read_at timestamptz,
  b_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (company_a_id < company_b_id),
  unique (company_a_id, company_b_id)
);
create index on public.threads (company_b_id);

-- Offer revisions are append-only; the current one is version = threads.current_version.
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  version int not null check (version > 0),
  proposer_company_id uuid not null references public.companies (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  message text check (char_length(message) <= 1000),
  created_at timestamptz not null default now(),
  unique (thread_id, version),
  check (ends_at > starts_at)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references public.threads (id),   -- one meeting per thread
  offer_id uuid not null unique references public.offers (id),
  table_id int not null references public.meeting_tables (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status public.meeting_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- A table hosts at most one meeting at a time ('[)' lets 10:00-10:30 and 10:30-11:00 coexist).
  constraint meetings_no_table_overlap
    exclude using gist (table_id with =, slot with &&) where (status = 'confirmed')
);

-- One row per attending company, so a single constraint covers a company
-- regardless of which side of the pair it sits on.
create table public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  company_id uuid not null references public.companies (id),
  slot tstzrange not null,
  primary key (meeting_id, company_id),
  constraint participants_no_company_overlap
    exclude using gist (company_id with =, slot with &&)
);

create trigger set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.app_users for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meeting_tables for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.event_config for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.threads for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meetings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Caller helpers. SECURITY DEFINER so they can read app_users without
-- re-entering its RLS policy (no recursion). They take no arguments and derive
-- everything from auth.uid(), so a caller cannot ask about anyone else.
-- ---------------------------------------------------------------------------

-- The caller's company, only while that company is active.
create function public.current_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.company_id
  from public.app_users u
  join public.companies c on c.id = u.company_id
  where u.id = auth.uid() and c.is_active
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.is_admin from public.app_users u where u.id = auth.uid()), false)
$$;

-- True when [p_start, p_end) is exactly one future slot inside event hours.
create function public.is_valid_slot(p_start timestamptz, p_end timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((
    select p_end - p_start = make_interval(mins => c.slot_minutes)
       and (p_start at time zone c.timezone)::date = any (c.event_dates)
       and (p_end at time zone c.timezone)::date = (p_start at time zone c.timezone)::date
       and (p_start at time zone c.timezone)::time >= c.day_start
       and (p_end at time zone c.timezone)::time <= c.day_end
       and extract(epoch from (p_start at time zone c.timezone)::time - c.day_start)::int
           % (c.slot_minutes * 60) = 0
       and p_start > now()
    from public.event_config c
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only access for clients.
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.app_users enable row level security;
alter table public.meeting_tables enable row level security;
alter table public.event_config enable row level security;
alter table public.threads enable row level security;
alter table public.offers enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;

-- Directory: any active participant sees active companies. Admins see all.
create policy "companies: active participants read active companies" on public.companies
  for select to authenticated
  using ((is_active and (select public.current_company_id()) is not null) or (select public.is_admin()));

create policy "app_users: read own record" on public.app_users
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "meeting_tables: signed-in read" on public.meeting_tables
  for select to authenticated using (true);

create policy "event_config: signed-in read" on public.event_config
  for select to authenticated using (true);

create policy "threads: participants and admins" on public.threads
  for select to authenticated
  using ((select public.current_company_id()) in (company_a_id, company_b_id) or (select public.is_admin()));

create policy "offers: participants and admins" on public.offers
  for select to authenticated
  using (
    exists (
      select 1 from public.threads t
      where t.id = offers.thread_id
        and (select public.current_company_id()) in (t.company_a_id, t.company_b_id)
    )
    or (select public.is_admin())
  );

create policy "meetings: participants and admins" on public.meetings
  for select to authenticated
  using (
    exists (
      select 1 from public.threads t
      where t.id = meetings.thread_id
        and (select public.current_company_id()) in (t.company_a_id, t.company_b_id)
    )
    or (select public.is_admin())
  );

create policy "meeting_participants: participants and admins" on public.meeting_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.meetings m
      join public.threads t on t.id = m.thread_id
      where m.id = meeting_participants.meeting_id
        and (select public.current_company_id()) in (t.company_a_id, t.company_b_id)
    )
    or (select public.is_admin())
  );

-- Belt and braces: no direct writes from clients even if a policy is added later.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- Negotiation functions. Errors are raised as short codes the app maps to copy.
-- ---------------------------------------------------------------------------

create function public.propose_meeting(
  p_target uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_message text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  v_thread uuid;
begin
  if v_me is null then raise exception 'not_authorized'; end if;
  if p_target = v_me then raise exception 'self_proposal'; end if;
  if not exists (select 1 from public.companies where id = p_target and is_active) then
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

-- Shared guard for counter/decline: lock the thread and check it is the caller's turn.
create function public.lock_turn(p_thread uuid, p_expected_version int, p_me uuid)
returns public.threads
language plpgsql set search_path = '' as $$
declare
  t public.threads;
begin
  if p_me is null then raise exception 'not_authorized'; end if;
  select * into t from public.threads where id = p_thread for update;
  if not found or p_me not in (t.company_a_id, t.company_b_id) then raise exception 'not_found'; end if;
  if t.status <> 'pending' then raise exception 'thread_closed'; end if;
  if t.current_version <> p_expected_version then raise exception 'stale_offer'; end if;
  if (select proposer_company_id from public.offers
      where thread_id = t.id and version = t.current_version) = p_me then
    raise exception 'not_your_turn';
  end if;
  return t;
end $$;

create function public.counter_offer(
  p_thread uuid, p_expected_version int, p_starts_at timestamptz, p_ends_at timestamptz,
  p_message text default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  t public.threads;
begin
  t := public.lock_turn(p_thread, p_expected_version, v_me);
  if (select count(*) from public.companies
      where id in (t.company_a_id, t.company_b_id) and is_active) <> 2 then
    raise exception 'company_unavailable';
  end if;
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

create function public.decline_offer(p_thread uuid, p_expected_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  t public.threads;
begin
  t := public.lock_turn(p_thread, p_expected_version, v_me);
  update public.threads set
    status = 'declined',
    last_activity_at = now(),
    a_last_read_at = case when company_a_id = v_me then now() else a_last_read_at end,
    b_last_read_at = case when company_b_id = v_me then now() else b_last_read_at end
  where id = t.id;
end $$;

-- Atomic booking. Everything below runs in the caller's single transaction;
-- any raise rolls back the whole thing, so there is never an orphan meeting or
-- a half-confirmed thread. The exclusion constraints are the final guarantee.
create function public.accept_offer(p_thread uuid, p_expected_version int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
  t public.threads;
  o public.offers;
  v_range tstzrange;
  v_table int;
  v_meeting uuid;
begin
  if v_me is null then raise exception 'not_authorized'; end if;

  -- ponytail: one global lock serialises all acceptances so "lowest free table"
  -- can't race between unrelated pairs. Fine at event scale; switch to per-slot
  -- locks if booking throughput ever matters.
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

  if exists (
    select 1 from public.meeting_participants p
    where p.company_id in (t.company_a_id, t.company_b_id) and p.slot && v_range
  ) then
    raise exception 'company_conflict';
  end if;

  select mt.id into v_table
  from public.meeting_tables mt
  where mt.is_active
    and not exists (
      select 1 from public.meetings m
      where m.table_id = mt.id and m.status = 'confirmed' and m.slot && v_range
    )
  order by mt.id
  limit 1;
  if v_table is null then raise exception 'no_table'; end if;

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

create function public.mark_thread_read(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public.current_company_id();
begin
  update public.threads set
    a_last_read_at = case when company_a_id = v_me then now() else a_last_read_at end,
    b_last_read_at = case when company_b_id = v_me then now() else b_last_read_at end
  where id = p_thread and v_me in (company_a_id, company_b_id);
end $$;

-- Advisory availability for the slot picker: busy flags and free-table count,
-- never names or details of other meetings.
create function public.slot_availability(p_target uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz, self_busy boolean, target_busy boolean, free_tables int)
language sql stable security definer set search_path = '' as $$
  with me as (select public.current_company_id() as id),
  slots as (
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
    exists (select 1 from public.meeting_participants p
            where p.company_id = me.id and p.slot && tstzrange(sl.s, sl.e, '[)')),
    exists (select 1 from public.meeting_participants p
            where p.company_id = p_target and p.slot && tstzrange(sl.s, sl.e, '[)')),
    (select count(*)::int from public.meeting_tables mt
     where mt.is_active and not exists (
       select 1 from public.meetings m
       where m.table_id = mt.id and m.status = 'confirmed' and m.slot && tstzrange(sl.s, sl.e, '[)')))
  from slots sl, me
  where me.id is not null
    and exists (select 1 from public.companies where id = p_target and is_active)
  order by sl.s
$$;

-- Execute rights: signed-in users only. lock_turn and set_updated_at are internal.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.current_company_id(),
  public.is_admin(),
  public.is_valid_slot(timestamptz, timestamptz),
  public.propose_meeting(uuid, timestamptz, timestamptz, text),
  public.counter_offer(uuid, int, timestamptz, timestamptz, text),
  public.decline_offer(uuid, int),
  public.accept_offer(uuid, int),
  public.mark_thread_read(uuid),
  public.slot_availability(uuid, date)
to authenticated;
