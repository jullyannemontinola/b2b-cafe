// Development-only seed. Creates an organizer (admin) account, fictional
// companies with their logins, and meeting tables. Safe to re-run: existing
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
const companies: {
  login: string
  name: string
  contact_email: string
  contact_name: string
  contact_phone: string
  business_type: string
  tier: Tier
  logo_url: string
  description: string
  is_active?: boolean
}[] = [
  {
    login: "kalinaw@b2bcafe.test",
    name: "Kalinaw Analytics",
    contact_email: "partnerships@kalinaw.test",
    contact_name: "Andrea Villanueva",
    contact_phone: "+63 900 000 0101",
    business_type: "AI & data analytics",
    tier: "premium",
    logo_url: "/logos/kalinaw.svg",
    description:
      "Computer-vision and forecasting models for retail and logistics operators.\n\nLooking for: sensor and camera hardware partners, pilot sites in Metro Manila.",
  },
  {
    login: "tanglaw@b2bcafe.test",
    name: "Tanglaw Robotics",
    contact_email: "hello@tanglaw.test",
    contact_name: "Paolo Reyes",
    contact_phone: "+63 900 000 0102",
    business_type: "Industrial robotics",
    tier: "premium",
    logo_url: "/logos/tanglaw.svg",
    description:
      "Autonomous inspection robots for factories and warehouses.\n\nLooking for: system integrators and manufacturing clients.",
  },
  {
    login: "bayanihan@b2bcafe.test",
    name: "Bayanihan Grid",
    contact_email: "team@bayanihangrid.test",
    contact_name: "Liza Mercado",
    contact_phone: "+63 900 000 0103",
    business_type: "Energy IoT",
    tier: "access",
    logo_url: "/logos/bayanihan.svg",
    description: "Smart metering and microgrid monitoring for island communities.",
  },
  {
    login: "sariwa@b2bcafe.test",
    name: "Sariwa Agritech",
    contact_email: "grow@sariwa.test",
    contact_name: "Ramon Dizon",
    contact_phone: "+63 900 000 0104",
    business_type: "Agriculture sensors",
    tier: "access",
    logo_url: "/logos/sariwa.svg",
    description: "Soil and cold-chain sensors that help farm cooperatives cut post-harvest losses.",
  },
  {
    login: "lakbay@b2bcafe.test",
    name: "Lakbay Logistics",
    contact_email: "ops@lakbay.test",
    contact_name: "Carla Santos",
    contact_phone: "+63 900 000 0105",
    business_type: "Fleet tracking",
    tier: "matching_pool",
    logo_url: "/logos/lakbay.svg",
    description: "GPS fleet tracking and route optimisation for last-mile couriers.",
  },
  {
    login: "pandayan@b2bcafe.test",
    name: "Pandayan Cloud Works",
    contact_email: "build@pandayan.test",
    contact_name: "Miguel Tan",
    contact_phone: "+63 900 000 0106",
    business_type: "Cloud infrastructure",
    tier: "matching_pool",
    logo_url: "/logos/pandayan.svg",
    description: "Managed Kubernetes and edge hosting for startups shipping IoT products.",
  },
  {
    login: "dormant@b2bcafe.test",
    name: "Dormant Devices Co.",
    contact_email: "info@dormant.test",
    contact_name: "Nina Cruz",
    contact_phone: "+63 900 000 0107",
    business_type: "Consumer electronics",
    tier: "matching_pool",
    logo_url: "/logos/dormant.svg",
    description: "Inactive sample company. It should not appear in the directory.",
    is_active: false,
  },
]

const tables = [
  { label: "Table 1", location: "B2B Café, Hall 1" },
  { label: "Table 2", location: "B2B Café, Hall 1" },
  { label: "Table 3", location: "B2B Café, Hall 1" },
  { label: "Table 4", location: "B2B Café, Hall 1" },
]

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

const { error: tableError } = await admin.from("meeting_tables").upsert(tables, { onConflict: "label" })
if (tableError) throw tableError

// Organizer account: an admin with no company.
const organizerEmail = "organizer@b2bcafe.test"
const organizerId = await ensureUser(organizerEmail)
{
  const { error } = await admin.from("app_users").upsert({ id: organizerId, company_id: null, is_admin: true }, { onConflict: "id" })
  if (error) throw error
  console.log(`admin    ${organizerEmail.padEnd(26)} (event organizer)`)
}

for (const { login, ...company } of companies) {
  const { data: row, error } = await admin
    .from("companies")
    .upsert({ is_active: true, ...company }, { onConflict: "name" })
    .select("id")
    .single()
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

  console.log(`company  ${login.padEnd(26)} ${company.name}`)
}

console.log(`\nSeeded 1 organizer, ${companies.length} companies and ${tables.length} tables. New accounts use SEED_PASSWORD.`)
