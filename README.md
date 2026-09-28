# B2B Café — scheduling prototype

Private meeting scheduling for approved companies at B2B Café (10–11 November 2026, Megatrade Halls, SM Megamall). Organizers register externally approved companies. Companies set up their own login, browse each other, negotiate 30-minute meetings, and get a table when the other side accepts.

Stack: Next.js 16 (App Router, TypeScript), Supabase (Postgres, Auth, RLS, Storage), Tailwind CSS 4, shadcn/ui (Base UI), deployable on Vercel.

## Two kinds of account

| | Organizer (admin) | Company user |
|---|---|---|
| Database | `app_users.is_admin = true`, `company_id = null` | `is_admin = false`, `company_id` = exactly one company |
| Lands on | `/admin` (Dashboard, Participants, Meetings, Tables, Help) | `/companies` (Participants, Meeting requests, My schedule, Help) |
| Can | Register companies, provision logins, edit profiles, set shared tables, read every company, negotiation and meeting | Browse companies, propose, counter, accept, decline |
| Cannot | Appear in the directory, hold a tier, propose, accept, counter, decline, or occupy a table | Read admin data, provision accounts, or change any role or company |

The database enforces both columns together with a check constraint. Participant functions derive the caller's company from `current_company_id()`, which is empty for organizers, so they reject organizer accounts on their own. Each route group has its own server-side guard, and RLS applies underneath.

## What it does

- **Directory, profiles and scheduling:** search active companies; the scheduler shows Morning/Afternoon slot groups with a reason on every unavailable slot.
- **Negotiation:** one thread per company pair, with propose, counter, accept and decline. The full offer history is kept.
- **Booking:** acceptance books both companies and the lowest free table in one transaction.
- **Agenda and inbox:** unread badges for new offers and outcomes.
- **Organizer overview:** live counts, companies by tier, meetings per day against table capacity, and upcoming meetings.
- **Company management:** search and filter (awaiting setup); add an approved company with a logo upload; edit its profile; retry or resend setup.
- **Meeting monitoring:** filter by day, company, table and status; a negotiations view; a read-only thread history.

## Interface terms

Screens use event language; the database keeps its original names. `lib/copy.ts` holds the shared labels, event facts and `requestStatus()`, which words a request's status for the viewer (“Your response needed”, “Awaiting [organization]”, “Alternative time suggested”, “Meeting confirmed”, “Request declined”).

| Database / route | Interface |
|---|---|
| `companies`, `/companies` | Participants, organization |
| `threads`, `/inbox` | Meeting requests |
| `offers` (propose / counter) | Request a meeting / Suggest another time |
| `accept_offer` / `decline_offer` | Confirm meeting / Decline request |
| `/agenda` | My schedule |
| admin | Organizer |

Help lives at `/help` and `/admin/help` (`components/help-page.tsx`). Contextual help uses `HelpButton` (`components/help.tsx`), a popover that leaves the page mounted so drafts and selected times survive.

## Local setup

Requirements: Node 24+, Docker Desktop running.

```bash
npm install
npx supabase start          # Postgres, Auth, Storage, Mailpit; applies supabase/migrations
cp .env.example .env.local  # fill in values from `npx supabase status`
npm run seed                # organizer + fictional companies + 4 tables
npm run dev                 # http://localhost:3000
```

Applying new migrations to an existing local database without wiping it: `npx supabase migration up --local`.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | Publishable (anon) key. All page and participant requests use the signed-in user's session under RLS. |
| `NEXT_PUBLIC_SITE_URL` | app (optional) | Base URL for setup-email links; defaults to the request origin |
| `SUPABASE_SECRET_KEY` | **server only** | Auth administration during company provisioning (behind an admin check), plus seed and tests. Imported only through `lib/supabase/service.ts`, which is marked `server-only`. |
| `SEED_PASSWORD` | scripts only | Password for seeded demo accounts |
| `ORGANIZER_CONTACT_EMAIL` | server (optional) | Support address shown on the Help page. **Not configured:** the official event page publishes no direct organizer contact, so Help links to the event page until the organizers confirm an address. |

### Commands

| Command | What it does |
|---|---|
| `npm run seed` | Create the organizer, demo companies and tables. Re-runnable; never duplicates and never changes existing passwords. |
| `npm test` | Integration tests against the local stack |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks |

## Demo data

The seed's demo organizations use real IT employer names (from a public employer ranking) purely as test fixtures. They are **not** event participants, and their tiers are arbitrary. Their profiles are marked as sample content, contact people are fictional, and every address uses the reserved `.test` domain, so no email can reach a real company. They have no logos, so the app shows a colour placeholder with initials. Demo records are flagged `is_demo`, and while any exist the app shows a one-line notice that names are test data.

`npm run seed` finds demo organizations by their login email and updates them in place, so IDs, logins, requests and meetings are kept and re-runs never duplicate. It doesn't touch any other organization.

## Demo accounts

Seeded accounts use `SEED_PASSWORD`:

- **Organizer:** `organizer@b2bcafe.test`.
- **Participants** (login = organization name): `oracle-philippines@` (Premium), `globe-telecom-ph@` (Premium), `dxc-technology-ph@`, `accenture-ph@`, `integrated-computer-systems@`, `infor-philippines@` and `ibm-philippines@b2bcafe.test`. The seed renames the earlier demo logins (`kalinaw@`, `tanglaw@`, …) in place, keeping the same accounts and passwords.

The Oracle Philippines demo login (originally `kalinaw@`) was the admin in the first prototype. The migration converts that login into an ordinary company account and keeps all its data; the separate organizer account replaces it.

## Registering a company (organizer)

1. **Record the company.** Admin → Companies → **Add approved company**. Fill in company details, contact person and login email (it defaults to the business email). Upload a PNG, JPEG or WebP logo of 5 MB or less.
2. **Validation and duplicate checks.** The server checks every field, plus the logo's type, size and actual file signature. One database function then inserts the company and its account record together. A duplicate company name or login email is refused, so double submits can't create twice. An email that already belongs to any login is refused, so an unrelated user is never attached.
3. **Provisioning** (`lib/provisioning.ts`, server only):
   - Creates the Auth user with no password and records `account_created`.
   - Links the user as a company user.
   - Sends the setup email.
   - Records `invite_sent` only if Supabase accepts the send; otherwise `invite_failed` with the error.
   - Every step can be re-run with **Retry account setup** or **Resend setup email**. Nothing is ever deleted as cleanup.
4. **Recipient sets their password.** The email link goes to `/auth/confirm`, which verifies the one-time token on the server, then to `/setup-password`, where the recipient chooses a password and the account becomes `active`. Expired or reused links show a clear explanation.

Account status (`pending`, `account_created`, `invite_sent`, `invite_failed`, `active`) is the only access state. Every registered organization is an approved participant; it can sign in and schedule once its account is active. Participant deactivation was removed in `20260930100000_remove_participation_status.sql`: that migration made every organization a regular participant, keeping its account, profile and meetings, rewrote the functions and policy that checked the flag, and then dropped `companies.is_active`.

Locally, setup emails are captured by Mailpit at http://127.0.0.1:54324.

## Tables

Migration `20260929100000_table_allocation.sql` (additive).

- **Per day.** Every `meeting_tables` row belongs to one event day and is `shared` or `dedicated`. Labels (`Table 3`, `Premium table 2`) are unique per day, and numbers are never reused or renumbered. Tables are switched off (`is_active = false`), never deleted.
- **Shared tables.** Organizers set the count per day in **Organizer → Tables**, which calls `admin_set_shared_tables(day, count, apply)`. Increases re-activate the lowest switched-off numbers first. Reductions switch off only tables without confirmed meetings; otherwise nothing changes and the blocking meetings are returned. The UI previews every reduction before it's applied. The count is organizer-declared capacity, not a check that the venue fits it.
- **Dedicated tables.** A trigger on `companies` gives each Premium organization one dedicated table per event day. It fires when one is added or upgraded. A partial unique index `(owner_company_id, event_date)` makes this idempotent. Downgrading switches unused dedicated tables off, and is refused (`dedicated_table_in_use`, with the meetings listed) while the organization hosts upcoming confirmed meetings.
- **Assumption:** Premium organizations attend both event days. There's no per-day attendance setting.

Which table a meeting gets (`accept_offer`, mirrored by `slot_availability`):

| Participants | Table |
|---|---|
| Neither Premium | Lowest-numbered free active shared table for that day |
| One Premium | That organization's dedicated table for that day |
| Both Premium | The dedicated table of the **original request's recipient** (the organization that didn't send version 1), unchanged by counterproposals. Both organizations are marked busy. |

There is no fallback to shared capacity or to another organization's dedicated table. A missing or booked dedicated table fails with `no_dedicated_table` or `dedicated_table_busy`. Tiers are read at confirmation time, so pending requests follow the current rules. A trigger on `meetings` rejects a table from another day.

**Concurrency.** Booking, capacity changes, dedicated-table changes and venue reassignment all take the same transaction-scoped advisory lock. A table therefore can't be switched off while another transaction books it, and the exclusion constraints on companies and tables remain the final guarantee.

**Existing data and reconciliation.** The migration:
1. Keeps the original tables as the first day's shared tables and copies them, with the same labels, for later days.
2. Moves any later-day meeting to the same-labelled table for its day, logging each move in `meeting_venue_changes`. Labels are unchanged, so participants see no difference.
3. Creates dedicated tables for the active Premium organizations.

It does **not** move confirmed meetings that involve a Premium organization but sit on a shared table. **Organizer → Tables** lists them ("needs a table review") with the proposed dedicated table. `admin_reconcile_venues(apply)` moves all of them or none, logs each change, and marks the request as updated. Participants then see "Table changed by the organizers from … to …" on the meeting.

## How booking stays correct

Unchanged from the first prototype:

- Every rule lives in Postgres functions: `supabase/migrations/20260927140000_init.sql`.
- `accept_offer` takes an advisory lock and locks the thread.
- It re-checks the participants, whose turn it is, the offer version, both companies' activity and the event schedule.
- It picks the lowest free table and writes the meeting atomically.
- Exclusion constraints guarantee no company or table is ever double-booked.

The organizer migration is `20260928090000_organizer_accounts.sql` (additive). Logos live in the `company-logos` Storage bucket. Anyone can read logos; only admins can upload, replace or delete them, and the bucket itself enforces type and size.

## Tests

`npm test` runs `tests/booking.test.mts` and `tests/accounts.test.mts`. The tests sign real users in with the publishable key, so RLS and the database functions are what's tested. They create throwaway records and remove them afterwards.

They cover:
- booking races, stale offers, retries and table capacity
- organizer/company separation
- registration duplicates, including concurrent submissions
- the full email-link setup and sign-in, using the Mailpit message
- a simulated email failure followed by retry, and refusal to attach an unrelated existing login
- Storage permissions, type and size limits
- dashboard counts

## Deploying to Vercel

1. Create a Supabase project. Run `npx supabase link --project-ref <ref>`, then `npx supabase db push` (applies both migrations and creates the logo bucket).
2. **Authentication settings** in the Supabase dashboard:
   - Turn off *Allow new users to sign up*.
   - Set **Site URL** to your Vercel URL and add `https://<your-domain>/**` to **Redirect URLs**.
   - Under *Email Templates*, paste `supabase/templates/invite.html` into **Invite user** and `supabase/templates/recovery.html` into **Reset password**. The templates link to `/auth/confirm?token_hash=…`.
   - Configure **custom SMTP**. Supabase's built-in mailer is rate-limited and meant for testing only, and real invitations won't reliably arrive without it.
3. Seed an organizer from your machine: point `.env.local` at the hosted project and run `npm run seed`. Or create one organizer user in the dashboard and insert `app_users (id, company_id, is_admin) = (<user id>, null, true)`.
4. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` and `SUPABASE_SECRET_KEY`. The secret is needed for provisioning, is server-only, and is never exposed to the browser.

## Prototype assumptions and limitations

- Operating hours (09:00–17:00 Manila) and the seeded four shared tables per day are placeholders (SRS decision D01).
- Contact details are visible to all active companies (D08).
- Logos are publicly readable by URL (paths are random); writes are organizer-only.
- Login emails can't be changed after registration; there is no identity-change flow yet.
- Organizers can't book, cancel or reschedule on a company's behalf. There is no audit log, meeting-notification email, tier ranking, quota or printing.
- Pending offers made impossible by another booking aren't flagged until someone tries to accept them.
- One global lock serialises acceptances, which is fine at event scale.
