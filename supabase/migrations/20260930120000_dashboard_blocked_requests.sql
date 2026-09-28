-- Organizer dashboard: open meeting requests whose latest proposed time could
-- not be confirmed right now. Read-only, and it applies the same rules as
-- accept_offer (company overlap, meeting_host table choice, day tables) so the
-- dashboard can't drift from booking.
create function public.admin_blocked_requests()
returns table (thread_id uuid, starts_at timestamptz, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  with latest as (
    select t.id, t.company_a_id, t.company_b_id, o.starts_at, o.ends_at,
           tstzrange(o.starts_at, o.ends_at, '[)') as slot,
           (o.starts_at at time zone c.timezone)::date as day,
           public.meeting_host(t.company_a_id, t.company_b_id,
             (select f.proposer_company_id from public.offers f where f.thread_id = t.id and f.version = 1)) as host
    from public.threads t
    join public.offers o on o.thread_id = t.id and o.version = t.current_version
    cross join public.event_config c
    where t.status = 'pending'
  ), checked as (
    select l.id, l.starts_at,
      case
        when l.starts_at <= now() then 'past'
        when exists (select 1 from public.meeting_participants p
                     where p.company_id in (l.company_a_id, l.company_b_id) and p.slot && l.slot) then 'company_busy'
        when l.host is not null and not exists (
          select 1 from public.meeting_tables mt
          where mt.kind = 'dedicated' and mt.owner_company_id = l.host and mt.event_date = l.day and mt.is_active) then 'no_dedicated_table'
        when l.host is not null and exists (
          select 1 from public.meeting_tables mt join public.meetings m on m.table_id = mt.id
          where mt.kind = 'dedicated' and mt.owner_company_id = l.host and mt.event_date = l.day and mt.is_active
            and m.status = 'confirmed' and m.slot && l.slot) then 'dedicated_table_busy'
        when l.host is null and not exists (
          select 1 from public.meeting_tables mt
          where mt.kind = 'shared' and mt.event_date = l.day and mt.is_active and not exists (
            select 1 from public.meetings m where m.table_id = mt.id and m.status = 'confirmed' and m.slot && l.slot)) then 'no_shared_table'
      end as reason
    from latest l
  )
  select id, checked.starts_at, checked.reason from checked where checked.reason is not null
  order by checked.starts_at;
end $$;

revoke execute on function public.admin_blocked_requests() from public, anon;
grant execute on function public.admin_blocked_requests() to authenticated;
