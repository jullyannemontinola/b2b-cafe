// Organizer/company separation, company registration and account provisioning.
// Runs against the local Supabase stack (Mailpit captures the setup emails).
//
//   npm test
import { after, before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { provisionAccount, type SendSetupEmail } from "../lib/provisioning.ts"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324"
const password = "test-password-123"
const run = Date.now().toString(36)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, secret, opts)
const redirectTo = "http://localhost:3000/auth/confirm"

const createdUsers: string[] = []
const createdCompanies: string[] = []
const uploaded: string[] = []
let admin: SupabaseClient
let adminId = ""
let companyA: { id: string; db: SupabaseClient }
let companyB: { id: string; db: SupabaseClient }

async function signIn(email: string, pw = password) {
  const db = createClient(url, publishable, opts)
  const { error } = await db.auth.signInWithPassword({ email, password: pw })
  if (error) throw error
  return db
}

async function seedCompany(key: string) {
  const { data: c, error } = await service
    .from("companies")
    .insert({ name: `zz Acct ${key} ${run}`, contact_email: `${key}@test.invalid`, contact_name: "T", business_type: "T", tier: "access" })
    .select("id")
    .single()
  if (error) throw error
  createdCompanies.push(c.id)
  const email = `${key}-${run}@test.invalid`
  const { data: u } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  createdUsers.push(u.user!.id)
  await service.from("app_users").insert({ id: u.user!.id, company_id: c.id, is_admin: false })
  return { id: c.id, db: await signIn(email) }
}

const register = (db: SupabaseClient, key: string, overrides: Record<string, string> = {}) =>
  db.rpc("admin_register_company", {
    p_name: `zz Reg ${key} ${run}`,
    p_contact_email: `biz-${key}-${run}@test.invalid`,
    p_contact_name: "Pat Cruz",
    p_contact_phone: "+63 900 000 0000",
    p_tier: "premium",
    p_business_type: "Testing",
    p_logo_url: "http://127.0.0.1:54321/storage/v1/object/public/company-logos/x.png",
    p_login_email: `login-${key}-${run}@test.invalid`,
    ...overrides,
  })

async function registered(key: string, overrides: Record<string, string> = {}) {
  const { data, error } = await register(admin, key, overrides)
  assert.equal(error, null, error?.message)
  createdCompanies.push(data)
  return data as string
}

async function account(companyId: string) {
  const { data } = await service.from("company_accounts").select("*").eq("company_id", companyId).single()
  if (data?.user_id && !createdUsers.includes(data.user_id)) createdUsers.push(data.user_id)
  return data!
}

async function latestEmailTo(address: string) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)).json()
    if (list.messages?.length) {
      const msg = await (await fetch(`${mailpit}/api/v1/message/${list.messages[0].ID}`)).json()
      return msg.HTML as string
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no email for ${address}`)
}

const at = (hhmm: string) => {
  const start = new Date(`2026-11-10T${hhmm}:00+08:00`)
  return { p_starts_at: start.toISOString(), p_ends_at: new Date(start.getTime() + 30 * 60_000).toISOString() }
}

before(async () => {
  const email = `organizer-${run}@test.invalid`
  const { data: u, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  createdUsers.push(u.user.id)
  adminId = u.user.id
  const { error: linkError } = await service.from("app_users").insert({ id: u.user.id, company_id: null, is_admin: true })
  if (linkError) throw linkError
  admin = await signIn(email)
  companyA = await seedCompany("a")
  companyB = await seedCompany("b")
})

after(async () => {
  const ids = createdCompanies
  const { data: threads } = await service.from("threads").select("id").or(`company_a_id.in.(${ids}),company_b_id.in.(${ids})`)
  if (threads?.length) await service.from("threads").delete().in("id", threads.map((t) => t.id))
  await service.from("company_accounts").delete().in("company_id", ids)
  for (const id of createdUsers) await service.auth.admin.deleteUser(id)
  await service.from("companies").delete().in("id", ids)
  if (uploaded.length) await service.storage.from("company-logos").remove(uploaded)
})

describe("organizer and company accounts", () => {
  test("1. an admin has no company and never appears in the directory", async () => {
    const { data: me } = await admin.from("app_users").select("company_id, is_admin").eq("id", adminId).single()
    assert.deepEqual(me, { company_id: null, is_admin: true })
    // The database refuses mixed account types.
    const { data: u } = await service.auth.admin.createUser({ email: `mixed-${run}@test.invalid`, email_confirm: true })
    createdUsers.push(u.user!.id)
    const mixed = await service.from("app_users").insert({ id: u.user!.id, company_id: companyA.id, is_admin: true })
    assert.equal(mixed.error?.code, "23514", "admin with a company was accepted")
    const orphan = await service.from("app_users").insert({ id: u.user!.id, company_id: null, is_admin: false })
    assert.equal(orphan.error?.code, "23514", "company user without a company was accepted")
    // Every directory row is a company record; organizers have none.
    const { data: dir } = await companyA.db.from("companies").select("id")
    const { data: adminLinks } = await service.from("app_users").select("company_id").eq("is_admin", true).not("company_id", "is", null)
    assert.equal(adminLinks!.length, 0)
    assert.ok(dir!.length > 0)
  })

  test("2. an admin cannot propose, counter, accept, decline or mark read", async () => {
    const { data: thread, error } = await companyA.db.rpc("propose_meeting", { p_target: companyB.id, ...at("09:00") })
    assert.equal(error, null, error?.message)
    const attempts = [
      await admin.rpc("propose_meeting", { p_target: companyB.id, ...at("09:30") }),
      await admin.rpc("accept_offer", { p_thread: thread, p_expected_version: 1 }),
      await admin.rpc("counter_offer", { p_thread: thread, p_expected_version: 1, ...at("10:00") }),
      await admin.rpc("decline_offer", { p_thread: thread, p_expected_version: 1 }),
    ]
    for (const r of attempts) assert.equal(r.error?.message, "not_authorized")
    const { data: t } = await service.from("threads").select("status, current_version").eq("id", thread).single()
    assert.deepEqual(t, { status: "pending", current_version: 1 })
    // Admins can still read it for monitoring.
    const { data: seen } = await admin.from("threads").select("id").eq("id", thread)
    assert.equal(seen!.length, 1)
  })

  test("3 & 4. company users cannot read admin data, provision, or change roles", async () => {
    const db = companyA.db
    assert.equal((await db.from("company_accounts").select("*")).data?.length ?? 0, 0)
    assert.equal((await register(db, "sneaky")).error?.message, "not_authorized")
    assert.ok((await db.rpc("auth_user_id_by_email", { p_email: "x@test.invalid" })).error, "lookup should be service-only")
    await db.from("companies").update({ tier: "premium", is_active: false }).eq("id", companyB.id)
    const { data: b } = await service.from("companies").select("tier, is_active").eq("id", companyB.id).single()
    assert.deepEqual(b, { tier: "access", is_active: true })
    await db.from("app_users").update({ is_admin: true, company_id: null }).neq("id", "00000000-0000-0000-0000-000000000000")
    const { data: users } = await service.from("app_users").select("is_admin, company_id").eq("company_id", companyA.id)
    assert.deepEqual(users, [{ is_admin: false, company_id: companyA.id }])
    // Admins can't rewrite account status directly either; only provisioning does.
    const id = await registered("tamper")
    await admin.from("company_accounts").update({ status: "active" }).eq("company_id", id)
    assert.equal((await account(id)).status, "pending")
  })
})

describe("registration and provisioning", () => {
  test("5. a new company sets its password from the email link and signs in", async () => {
    const id = await registered("happy")
    const result = await provisionAccount(service, id, redirectTo)
    assert.deepEqual(result, { status: "invite_sent", error: null })
    const acct = await account(id)
    assert.equal(acct.status, "invite_sent")

    const html = await latestEmailTo(acct.login_email)
    const link = new URL(html.match(/href="([^"]+)"/)![1].replaceAll("&amp;", "&"))
    assert.equal(link.pathname, "/auth/confirm")
    const client = createClient(url, publishable, opts)
    const { error: verifyError } = await client.auth.verifyOtp({
      type: link.searchParams.get("type") as "invite",
      token_hash: link.searchParams.get("token_hash")!,
    })
    assert.equal(verifyError, null, verifyError?.message)
    assert.equal((await client.auth.updateUser({ password: "chosen-by-company-1" })).error, null)
    await client.rpc("complete_account_setup")
    assert.equal((await account(id)).status, "active")

    // The same link can't be used twice.
    const reuse = await createClient(url, publishable, opts).auth.verifyOtp({ type: "invite", token_hash: link.searchParams.get("token_hash")! })
    assert.ok(reuse.error, "setup link was reusable")

    const signedIn = await signIn(acct.login_email, "chosen-by-company-1")
    const { data: me } = await signedIn.from("app_users").select("company_id, is_admin").single()
    assert.deepEqual(me, { company_id: id, is_admin: false })
    assert.ok(((await signedIn.from("companies").select("id")).data?.length ?? 0) > 0, "new company can't see the directory")
  })

  test("6. duplicate submissions don't create duplicate companies or logins", async () => {
    const [r1, r2] = await Promise.all([register(admin, "dup"), register(admin, "dup")])
    const ok = [r1, r2].filter((r) => !r.error)
    for (const r of ok) createdCompanies.push(r.data as string)
    assert.equal(ok.length, 1)
    // Whichever check the loser hits first, it's rejected as a duplicate.
    assert.ok(["company_exists", "login_email_in_use"].includes([r1, r2].find((r) => r.error)!.error!.message))
    const id = ok[0].data as string
    assert.equal((await register(admin, "dup2", { p_login_email: `login-dup-${run}@test.invalid` })).error?.message, "login_email_in_use")

    // Double-clicking retry: only one Auth user ever exists for the company.
    await Promise.all([provisionAccount(service, id, redirectTo), provisionAccount(service, id, redirectTo)])
    const acct = await account(id)
    const users = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email === acct.login_email)
    assert.equal(users.length, 1)
    assert.equal(acct.user_id, users[0].id)
    const { count } = await service.from("companies").select("*", { count: "exact", head: true }).eq("name", `zz Reg dup ${run}`)
    assert.equal(count, 1)
  })

  test("7. an email failure is recorded and retry recovers it", async () => {
    const id = await registered("fail")
    const failing: SendSetupEmail = async () => ({ error: "SMTP connection refused" })
    const first = await provisionAccount(service, id, redirectTo, failing)
    assert.equal(first.status, "invite_failed")
    let acct = await account(id)
    assert.equal(acct.status, "invite_failed")
    assert.match(acct.last_error!, /SMTP connection refused/)
    assert.equal(acct.invite_sent_at, null)
    assert.ok(acct.user_id, "login should exist even though the email failed")
    const { data: link } = await service.from("app_users").select("company_id").eq("id", acct.user_id!).single()
    assert.equal(link!.company_id, id)

    const retry = await provisionAccount(service, id, redirectTo)
    assert.equal(retry.status, "invite_sent")
    acct = await account(id)
    assert.equal(acct.last_error, null)
    assert.ok(acct.invite_sent_at)
  })

  test("7b. an unrelated existing login is never attached or deleted", async () => {
    const taken = `taken-${run}@test.invalid`
    const { data: other } = await service.auth.admin.createUser({ email: taken, password, email_confirm: true })
    createdUsers.push(other.user!.id)
    assert.equal((await register(admin, "taken", { p_login_email: taken })).error?.message, "login_email_in_use")

    // Same situation arising after registration (user created elsewhere in between).
    const id = await registered("race")
    const acct = await account(id)
    const { data: interloper } = await service.auth.admin.createUser({ email: acct.login_email, password, email_confirm: true })
    createdUsers.push(interloper.user!.id)
    const result = await provisionAccount(service, id, redirectTo)
    assert.equal(result.status, "pending")
    assert.match(result.error!, /already exists/)
    assert.equal((await account(id)).user_id, null)
    assert.equal((await service.from("app_users").select("id").eq("id", interloper.user!.id)).data!.length, 0)
    assert.ok((await service.auth.admin.getUserById(interloper.user!.id)).data.user, "existing user was deleted")
  })
})

describe("logo storage", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  test("8. only admins can upload, and only allowed image types within 5 MB", async () => {
    const path = `test-${run}.png`
    const ok = await admin.storage.from("company-logos").upload(path, png, { contentType: "image/png" })
    assert.equal(ok.error, null, ok.error?.message)
    uploaded.push(path)
    const res = await fetch(admin.storage.from("company-logos").getPublicUrl(path).data.publicUrl)
    assert.equal(res.status, 200, "logo should be publicly readable for the directory")

    const byCompany = await companyA.db.storage.from("company-logos").upload(`evil-${run}.png`, png, { contentType: "image/png" })
    assert.ok(byCompany.error, "company user uploaded a logo")
    const overwrite = await companyA.db.storage.from("company-logos").upload(path, png, { contentType: "image/png", upsert: true })
    assert.ok(overwrite.error, "company user overwrote a logo")
    const removed = await companyA.db.storage.from("company-logos").remove([path])
    assert.equal(removed.data?.length ?? 0, 0, "company user deleted a logo")

    const wrongType = await admin.storage.from("company-logos").upload(`t-${run}.svg`, new Blob(["<svg/>"]), { contentType: "image/svg+xml" })
    assert.ok(wrongType.error, "SVG accepted")
    const big = await admin.storage.from("company-logos").upload(`big-${run}.png`, new Uint8Array(5 * 1024 * 1024 + 1), { contentType: "image/png" })
    assert.ok(big.error, "file over 5 MB accepted")
  })
})

describe("deactivation", () => {
  test("9. a deactivated company with a live session can't schedule", async () => {
    // Reuse the A→B thread from test 2 (B is the responder).
    const { data: existing } = await service
      .from("threads")
      .select("id, current_version")
      .or(`and(company_a_id.eq.${companyA.id},company_b_id.eq.${companyB.id}),and(company_a_id.eq.${companyB.id},company_b_id.eq.${companyA.id})`)
      .single()
    const threadId = existing!.id

    await service.from("companies").update({ is_active: false }).eq("id", companyB.id)
    try {
      const tries = [
        await companyB.db.rpc("accept_offer", { p_thread: threadId, p_expected_version: existing!.current_version }),
        await companyB.db.rpc("propose_meeting", { p_target: companyA.id, ...at("12:00") }),
      ]
      for (const r of tries) assert.equal(r.error?.message, "not_authorized")
      assert.equal((await companyB.db.from("companies").select("id")).data?.length ?? 0, 0, "inactive company still sees the directory")
      const { data: dir } = await companyA.db.from("companies").select("id")
      assert.ok(!dir!.some((c) => c.id === companyB.id), "inactive company still listed")
      // Nothing was cancelled: the thread still exists for monitoring.
      assert.equal((await admin.from("threads").select("id").eq("id", threadId)).data!.length, 1)
    } finally {
      await service.from("companies").update({ is_active: true }).eq("id", companyB.id)
    }
  })

  test("11. dashboard counts come from stored records and exclude organizers", async () => {
    const [svc, adm] = await Promise.all([
      Promise.all([
        service.from("companies").select("*", { count: "exact", head: true }),
        service.from("threads").select("*", { count: "exact", head: true }).eq("status", "pending"),
        service.from("meetings").select("*", { count: "exact", head: true }),
      ]),
      Promise.all([
        admin.from("companies").select("*", { count: "exact", head: true }),
        admin.from("threads").select("*", { count: "exact", head: true }).eq("status", "pending"),
        admin.from("meetings").select("*", { count: "exact", head: true }),
      ]),
    ])
    assert.deepEqual(adm.map((r) => r.count), svc.map((r) => r.count))
    // Company count equals company records only: organizer logins add nothing.
    const { count: organizerCompanies } = await service.from("app_users").select("*", { count: "exact", head: true }).eq("is_admin", true).not("company_id", "is", null)
    assert.equal(organizerCompanies, 0)
  })
})
