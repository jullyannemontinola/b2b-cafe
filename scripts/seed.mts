// Development-only seed. Creates an organizer (admin) account, demo
// organizations with their logins, and shared meeting tables. Safe to re-run: existing
// rows are updated, never duplicated, and existing passwords are left alone.
//
//   node --env-file=.env.local scripts/seed.mts
//
// Needs SUPABASE_SECRET_KEY (server-only) and SEED_PASSWORD. Never run in a build.
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const password = process.env.SEED_PASSWORD
if (!url || !secret || !password || password.length < 8) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and SEED_PASSWORD (8+ chars).")
  process.exit(1)
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

type Tier = "premium" | "access" | "matching_pool"

// Demo fixtures. Organization names are real IT employers (from a public
// employer ranking) used only as test data: they are not confirmed B2B Café
// participants, and tiers are arbitrary demo values. Contact people are
// fictional and every address uses the reserved .test domain, so nothing can
// ever be delivered. Logins match the organization names; accounts created
// under an earlier address are renamed in place (same user, same password).
const companies: {
  login: string // matches the organization name
  previousLogin?: string // earlier demo address, renamed in place by this script
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  tier: Tier
}[] = [
  { login: "oracle-philippines@b2bcafe.test", previousLogin: "kalinaw@b2bcafe.test", name: "Oracle Philippines", contact_name: "Andrea Villanueva", contact_email: "oracle-philippines@demo.b2bcafe.test", contact_phone: "+63 900 000 0101", tier: "premium" },
  { login: "globe-telecom-ph@b2bcafe.test", previousLogin: "tanglaw@b2bcafe.test", name: "Globe Telecom PH", contact_name: "Paolo Reyes", contact_email: "globe-telecom-ph@demo.b2bcafe.test", contact_phone: "+63 900 000 0102", tier: "premium" },
  { login: "dxc-technology-ph@b2bcafe.test", previousLogin: "bayanihan@b2bcafe.test", name: "DXC Technology PH", contact_name: "Liza Mercado", contact_email: "dxc-technology-ph@demo.b2bcafe.test", contact_phone: "+63 900 000 0103", tier: "access" },
  { login: "accenture-ph@b2bcafe.test", previousLogin: "sariwa@b2bcafe.test", name: "Accenture PH", contact_name: "Ramon Dizon", contact_email: "accenture-ph@demo.b2bcafe.test", contact_phone: "+63 900 000 0104", tier: "access" },
  { login: "integrated-computer-systems@b2bcafe.test", previousLogin: "lakbay@b2bcafe.test", name: "Integrated Computer Systems", contact_name: "Carla Santos", contact_email: "integrated-computer-systems@demo.b2bcafe.test", contact_phone: "+63 900 000 0105", tier: "matching_pool" },
  { login: "infor-philippines@b2bcafe.test", previousLogin: "pandayan@b2bcafe.test", name: "Infor Philippines", contact_name: "Miguel Tan", contact_email: "infor-philippines@demo.b2bcafe.test", contact_phone: "+63 900 000 0106", tier: "matching_pool" },
  { login: "ibm-philippines@b2bcafe.test", previousLogin: "dormant@b2bcafe.test", name: "IBM Philippines", contact_name: "Nina Cruz", contact_email: "ibm-philippines@demo.b2bcafe.test", contact_phone: "+63 900 000 0107", tier: "matching_pool" },
]

const sampleProfile = (name: string) => ({
  business_type: "Sample IT profile",
  description: `Sample profile for testing B2B Café. It doesn’t describe ${name}’s actual products, services or event participation.`,
  products_services: null,
  partnership_interests: null,
  website: null,
  logo_url: null, // colour placeholder with initials
  is_demo: true,
})

async function findUserId(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const hit = data.users.find((u) => u.email === email)
    if (hit) return hit.id
    if (data.users.length < 1000) return null
  }
}

async function ensureUser(email: string) {
  const existing = await findUserId(email)
  if (existing) return existing
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user.id
}

// Four shared tables per event day, only for days that have none yet, so an
// organizer's configuration is never overwritten. Premium dedicated tables are
// created by the database when Premium organizations are saved.
{
  const { data: config, error } = await admin.from("event_config").select("event_dates").single()
  if (error) throw error
  for (const date of config.event_dates) {
    const { count } = await admin.from("meeting_tables").select("*", { count: "exact", head: true }).eq("event_date", date).eq("kind", "shared")
    if (count) continue
    const rows = [1, 2, 3, 4].map((n) => ({ label: `Table ${n}`, number: n, location: "B2B Café", event_date: date, kind: "shared" as const }))
    const { error: tableError } = await admin.from("meeting_tables").insert(rows)
    if (tableError) throw tableError
  }
}

// Organizer account: an admin with no company.
const organizerEmail = "organizer@b2bcafe.test"
const organizerId = await ensureUser(organizerEmail)
{
  const { error } = await admin.from("app_users").upsert({ id: organizerId, company_id: null, is_admin: true }, { onConflict: "id" })
  if (error) throw error
  console.log(`admin    ${organizerEmail.padEnd(38)} (event organizer)`)
}

// Demo organizations are found by their login, so re-running (or renaming)
// updates the same record: IDs, linked users, requests and meetings are kept.
// Nothing outside these logins is touched.
for (const { login, previousLogin, ...company } of companies) {
  let { data: account } = await admin.from("company_accounts").select("company_id, user_id").eq("login_email", login).maybeSingle()
  if (!account && previousLogin) {
    // Rename an existing demo login in place: Auth user and account record.
    const { data: old } = await admin.from("company_accounts").select("company_id, user_id").eq("login_email", previousLogin).maybeSingle()
    if (old) {
      if (old.user_id) {
        const { error } = await admin.auth.admin.updateUserById(old.user_id, { email: login, email_confirm: true })
        if (error) throw error
      }
      const { error } = await admin.from("company_accounts").update({ login_email: login }).eq("company_id", old.company_id)
      if (error) throw error
      console.log(`renamed  ${previousLogin} → ${login}`)
      account = old
    }
  }
  const values = { ...company, ...sampleProfile(company.name) }
  const { data: row, error } = account
    ? await admin.from("companies").update(values).eq("id", account.company_id).select("id").single()
    : await admin.from("companies").insert(values).select("id").single()
  if (error) throw error

  const userId = await ensureUser(login)
  const { error: userError } = await admin
    .from("app_users")
    .upsert({ id: userId, company_id: row.id, is_admin: false }, { onConflict: "id" })
  if (userError) throw userError
  const { error: accountError } = await admin
    .from("company_accounts")
    .upsert({ company_id: row.id, login_email: login, user_id: userId, status: "active", activated_at: new Date().toISOString() }, { onConflict: "company_id", ignoreDuplicates: true })
  if (accountError) throw accountError

  console.log(`company  ${login.padEnd(38)} ${company.name}`)
}

console.log(`\nSeeded 1 organizer and ${companies.length} demo organizations. New accounts use SEED_PASSWORD.`)
