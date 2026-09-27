-- Organizer (admin) accounts are separate from participating companies, and
-- admins can register externally approved companies and provision their logins.
-- Additive: no rows are deleted and existing meetings are untouched.

-- ---------------------------------------------------------------------------
-- 1. Two mutually exclusive account types
--    admin:   is_admin = true,  company_id is null
--    company: is_admin = false, company_id -> exactly one company
-- ---------------------------------------------------------------------------

alter table public.app_users alter column company_id drop not null;

-- The prototype's admin was also a company (Kalinaw Analytics, no threads or
-- meetings). Keep that login as an ordinary company account; the seed creates
-- a separate organizer account.
update public.app_users set is_admin = false where is_admin and company_id is not null;

alter table public.app_users add constraint app_users_account_type check (
  (is_admin and company_id is null) or (not is_admin and company_id is not null)
);

-- ---------------------------------------------------------------------------
-- 2. Optional profile fields
-- ---------------------------------------------------------------------------

alter table public.companies
  add column products_services text,
  add column partnership_interests text,
  add column website text check (website is null or website ~* '^https?://');

-- ---------------------------------------------------------------------------
-- 3. Platform account setup, tracked separately from participation (is_active).
--    Admin-only: login emails never reach participants.
--
--    pending          company recorded, no Auth user yet
--    account_created  Auth user exists and is linked, setup email not sent
--    invite_sent      the email provider accepted the setup email
--    invite_failed    sending failed; last_error says why, retry allowed
--    active           the recipient set a password
-- ---------------------------------------------------------------------------

create type public.account_status as enum ('pending', 'account_created', 'invite_sent', 'invite_failed', 'active');

create table public.company_accounts (
  company_id uuid primary key references public.companies (id),
  login_email extensions.citext not null unique
    check (login_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid unique references auth.users (id) on delete set null,
  status public.account_status not null default 'pending',
  invite_sent_at timestamptz,
  last_error text,
  activated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.company_accounts
  for each row execute function public.set_updated_at();

-- Existing company logins were created by the seed with passwords: already active.
insert into public.company_accounts (company_id, login_email, user_id, status, activated_at)
select u.company_id, au.email, u.id, 'active', coalesce(au.last_sign_in_at, au.created_at)
from public.app_users u
join auth.users au on au.id = u.id
where u.company_id is not null
on conflict (company_id) do nothing;

alter table public.company_accounts enable row level security;

create policy "company_accounts: admins read" on public.company_accounts
  for select to authenticated using ((select public.is_admin()));

grant select on public.company_accounts to authenticated;
revoke all on public.company_accounts from anon;

-- Admins edit company profiles and participation directly (RLS below);
-- companies themselves still cannot write anything.
grant update on public.companies to authenticated;

create policy "companies: admins update" on public.companies
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------------

-- Records an approved company and its (not yet provisioned) account in one
-- transaction. Unique name and login email stop duplicate submissions.
create function public.admin_register_company(
  p_name text,
  p_contact_email text,
  p_contact_name text,
  p_contact_phone text,
  p_tier public.company_tier,
  p_business_type text,
  p_logo_url text,
  p_login_email text,
  p_description text default null,
  p_products_services text default null,
  p_partnership_interests text default null,
  p_website text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_contact_name), '') = ''
     or coalesce(trim(p_contact_phone), '') = '' or coalesce(trim(p_business_type), '') = ''
     or coalesce(trim(p_logo_url), '') = '' then
    raise exception 'missing_fields';
  end if;
  if p_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_login_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if exists (select 1 from public.companies where lower(name) = lower(trim(p_name))) then
    raise exception 'company_exists';
  end if;
  -- Never adopt an Auth user this workflow didn't create.
  if exists (select 1 from public.company_accounts where login_email = p_login_email::extensions.citext)
     or exists (select 1 from auth.users where lower(email) = lower(trim(p_login_email))) then
    raise exception 'login_email_in_use';
  end if;

  insert into public.companies (
    name, contact_email, contact_name, contact_phone, tier, business_type, logo_url,
    description, products_services, partnership_interests, website
  ) values (
    trim(p_name), trim(p_contact_email), trim(p_contact_name), trim(p_contact_phone), p_tier,
    trim(p_business_type), p_logo_url, nullif(trim(p_description), ''), nullif(trim(p_products_services), ''),
    nullif(trim(p_partnership_interests), ''), nullif(trim(p_website), '')
  ) returning id into v_company;

  insert into public.company_accounts (company_id, login_email, created_by)
  values (v_company, lower(trim(p_login_email)), auth.uid());

  return v_company;
exception
  when unique_violation then raise exception 'company_exists';
end $$;

-- Called by the recipient after choosing a password.
create function public.complete_account_setup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.company_accounts
  set status = 'active', activated_at = coalesce(activated_at, now()), last_error = null
  where user_id = auth.uid();
end $$;

-- Server-only lookup used by provisioning to refuse unrelated existing users.
create function public.auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email))
$$;

revoke execute on function public.admin_register_company(text, text, text, text, public.company_tier, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.complete_account_setup() from public, anon;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_register_company(text, text, text, text, public.company_tier, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.complete_account_setup() to authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Logo storage: public read (logos are shown in the directory), admin-only
--    writes. Storage itself enforces type and the 5 MB limit.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "company-logos: admins insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-logos' and (select public.is_admin()));

create policy "company-logos: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'company-logos' and (select public.is_admin()))
  with check (bucket_id = 'company-logos' and (select public.is_admin()));

create policy "company-logos: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-logos' and (select public.is_admin()));

create policy "company-logos: admins list" on storage.objects
  for select to authenticated
  using (bucket_id = 'company-logos' and (select public.is_admin()));
