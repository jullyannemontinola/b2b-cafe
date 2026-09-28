// Integration tests against a real Supabase (local stack). Every check runs as a
// signed-in user through the publishable key, so RLS and the DB functions are
// what's being tested. The secret key is only used to create and remove the
// throwaway test companies.
//
//   npm test        (needs `npx supabase start` and .env.local)
import { after, before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const password = "test-password-123"
const run = Date.now().toString(36)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, secret, opts)

type Co = { id: string; userId: string; db: SupabaseClient; name: string }
const co: Record<string, Co> = {}
let admin: Co
let tableCount = 0

// Event slots: Manila local time, 30 minutes.
const at = (date: string, hhmm: string, minutes = 30) => {
  const start = new Date(`${date}T${hhmm}:00+08:00`)
  return { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() }
}
const D1 = "2026-11-10"
const D2 = "2026-11-11"

// Organizer account: admin with no company, as in production.
async function makeAdmin() {
  const email = `organizer-${run}@test.invalid`
  const { data: u, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const { error: ae } = await service.from("app_users").insert({ id: u.user.id, company_id: null, is_admin: true })
  if (ae) throw ae
  const db = createClient(url, publishable, opts)
  const { error: se } = await db.auth.signInWithPassword({ email, password })
  if (se) throw se
  admin = { id: "", userId: u.user.id, db, name: "organizer" }
}

async function makeCompany(key: string) {
  const name = `zz Test ${key} ${run}`
  const { data: c, error } = await service
    .from("companies")
    .insert({ name, contact_email: `${key}@test.invalid`, contact_name: "Test", business_type: "Testing", tier: "access" })
    .select("id")
    .single()
  if (error) throw error
  const email = `${key}-${run}@test.invalid`
  const { data: u, error: ue } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (ue) throw ue
  const { error: ae } = await service.from("app_users").insert({ id: u.user.id, company_id: c.id, is_admin: false })
  if (ae) throw ae
  const db = createClient(url, publishable, opts)
  const { error: se } = await db.auth.signInWithPassword({ email, password })
  if (se) throw se
  co[key] = { id: c.id, userId: u.user.id, db, name }
}

const propose = (from: Co, to: Co, s: { start: string; end: string }, msg: string | null = null) =>
  from.db.rpc("propose_meeting", { p_target: to.id, p_starts_at: s.start, p_ends_at: s.end, p_message: msg })
const counter = (by: Co, thread: string, v: number, s: { start: string; end: string }) =>
  by.db.rpc("counter_offer", { p_thread: thread, p_expected_version: v, p_starts_at: s.start, p_ends_at: s.end })
const accept = (by: Co, thread: string, v: number) =>
  by.db.rpc("accept_offer", { p_thread: thread, p_expected_version: v })

async function threadFor(from: Co, to: Co, s: { start: string; end: string }) {
  const { data, error } = await propose(from, to, s)
  assert.equal(error, null, error?.message)
  return data as string
}

async function unread(c: Co, thread: string) {
  const { data } = await c.db.from("threads").select("company_a_id, last_activity_at, a_last_read_at, b_last_read_at").eq("id", thread).single()
  const readAt = data!.company_a_id === c.id ? data!.a_last_read_at : data!.b_last_read_at
  return !readAt || new Date(data!.last_activity_at) > new Date(readAt)
}

before(async () => {
  // Test companies are non-Premium, so only Nov 11's active shared tables count.
  const { count } = await service.from("meeting_tables").select("*", { count: "exact", head: true }).eq("is_active", true).eq("kind", "shared").eq("event_date", D2)
  tableCount = count ?? 0
  assert.ok(tableCount >= 1, "seed meeting tables first (npm run seed)")
  // The slots used below must be empty of existing (demo) meetings.
  const { data: clash } = await service
    .from("meetings")
    .select("id")
    .gte("starts_at", at(D2, "13:00").start)
    .lt("starts_at", at(D2, "17:00").start)
  assert.equal(clash?.length ?? 0, 0, "Nov 11 13:00–17:00 must be free of meetings for these tests")

  const pad = (n: number) => String(n).padStart(2, "0")
  for (let i = 1; i <= 10; i++) await makeCompany(`t${pad(i)}`)
  // Dedicated pairs for the table race: enough to fill every table at one slot, plus one.
  for (let i = 1; i <= 2 * (tableCount + 1); i++) await makeCompany(`r${pad(i)}`)
  await makeAdmin()
})

after(async () => {
  const ids = Object.values(co).map((c) => c.id)
  const { data: threads } = await service.from("threads").select("id").or(`company_a_id.in.(${ids}),company_b_id.in.(${ids})`)
  const threadIds = (threads ?? []).map((t) => t.id)
  if (threadIds.length) {
    await service.from("meetings").delete().in("thread_id", threadIds)
    await service.from("threads").delete().in("id", threadIds)
  }
  for (const c of [...Object.values(co), admin]) await service.auth.admin.deleteUser(c.userId)
  await service.from("companies").delete().in("id", ids)
})

describe("access control", () => {
  test("1. unauthenticated users see no data and cannot call booking functions", async () => {
    const anon = createClient(url, publishable, opts)
    for (const table of ["companies", "app_users", "threads", "offers", "meetings", "meeting_participants"]) {
      const { data } = await anon.from(table).select("*")
      assert.equal(data?.length ?? 0, 0, `${table} leaked to anon`)
    }
    const { error } = await anon.rpc("propose_meeting", {
      p_target: co.t01.id, p_starts_at: at(D1, "10:00").start, p_ends_at: at(D1, "10:00").end,
    })
    assert.ok(error, "anon could call propose_meeting")
  })

  test("2. a third company cannot read or act on someone else's negotiation", async () => {
    const { t01: a, t02: b, t03: c } = co
    const thread = await threadFor(a, b, at(D1, "09:00"))
    assert.equal((await c.db.from("threads").select("id").eq("id", thread)).data?.length, 0)
    assert.equal((await c.db.from("offers").select("id").eq("thread_id", thread)).data?.length, 0)
    for (const res of [
      await accept(c, thread, 1),
      await counter(c, thread, 1, at(D1, "09:30")),
      await c.db.rpc("decline_offer", { p_thread: thread, p_expected_version: 1 }),
    ]) {
      assert.equal(res.error?.message, "not_found")
    }
    const { data } = await service.from("threads").select("status, current_version").eq("id", thread).single()
    assert.deepEqual(data, { status: "pending", current_version: 1 })
  })

  test("3. participants can browse every registered participant", async () => {
    const { data } = await co.t01.db.from("companies").select("id, name, contact_email")
    const { count } = await service.from("companies").select("*", { count: "exact", head: true })
    assert.ok(data!.some((c) => c.id === co.t02.id))
    assert.equal(data!.length, count, "a registered participant is hidden from the directory")
    // Directory reads never expose login identities.
    const { data: users } = await co.t01.db.from("app_users").select("id")
    assert.deepEqual(users!.map((u) => u.id), [co.t01.userId])
  })

  test("4. users cannot promote themselves, move company, or change another organization", async () => {
    const u = co.t01
    await u.db.from("app_users").update({ is_admin: true }).eq("id", u.userId)
    await u.db.from("app_users").update({ company_id: co.t02.id }).eq("id", u.userId)
    await u.db.from("companies").update({ tier: "premium" }).eq("id", co.t02.id)
    const ins = await u.db.from("threads").insert({ company_a_id: co.t01.id, company_b_id: co.t02.id })
    assert.ok(ins.error, "direct thread insert should be refused")
    const { data: me } = await service.from("app_users").select("is_admin, company_id").eq("id", u.userId).single()
    assert.deepEqual(me, { is_admin: false, company_id: u.id })
    const { data: other } = await service.from("companies").select("tier").eq("id", co.t02.id).single()
    assert.equal(other!.tier, "access")
  })

  test("13. admins see all companies and meetings; ordinary users do not", async () => {
    const { count: companies } = await service.from("companies").select("*", { count: "exact", head: true })
    const { count: adminCos } = await admin.db.from("companies").select("*", { count: "exact", head: true })
    assert.equal(adminCos, companies)
    const { count: all } = await service.from("meetings").select("*", { count: "exact", head: true })
    const { count: adminCount } = await admin.db.from("meetings").select("*", { count: "exact", head: true })
    assert.equal(adminCount, all)
    const { data: users } = await admin.db.from("app_users").select("id")
    assert.ok(users!.length > 1)

    const { data: mine } = await co.t05.db.from("meetings").select("id, threads(company_a_id, company_b_id)")
    for (const m of mine ?? []) {
      const t = m.threads as unknown as { company_a_id: string; company_b_id: string }
      assert.ok([t.company_a_id, t.company_b_id].includes(co.t05.id))
    }
  })
})

describe("negotiation rules", () => {
  test("5. A–B and B–A cannot create duplicate threads, even concurrently", async () => {
    const { t04: a, t05: b, t06: c, t07: d } = co
    await threadFor(a, b, at(D1, "11:00"))
    const again = await propose(b, a, at(D1, "11:30"))
    assert.equal(again.error?.message, "thread_exists")

    const results = await Promise.all([propose(c, d, at(D1, "12:00")), propose(d, c, at(D1, "12:30"))])
    assert.equal(results.filter((r) => !r.error).length, 1)
    assert.equal(results.filter((r) => r.error?.message === "thread_exists").length, 1)
    const [lo, hi] = [c.id, d.id].sort()
    const { count } = await service.from("threads").select("*", { count: "exact", head: true }).eq("company_a_id", lo).eq("company_b_id", hi)
    assert.equal(count, 1)
  })

  test("6. a proposer cannot accept their own offer", async () => {
    const thread = await threadFor(co.t01, co.t04, at(D1, "13:00"))
    assert.equal((await accept(co.t01, thread, 1)).error?.message, "not_your_turn")
  })

  test("7 & 12. counterproposal supersedes, switches turn, keeps history", async () => {
    const { t02: a, t06: b } = co
    const thread = await threadFor(a, b, at(D2, "13:30"))
    assert.equal((await counter(b, thread, 1, at(D2, "14:30"))).error, null)

    assert.equal((await accept(a, thread, 1)).error?.message, "stale_offer", "superseded offer accepted")
    assert.equal((await accept(b, thread, 2)).error?.message, "not_your_turn", "counter-proposer accepted own offer")
    assert.equal((await counter(b, thread, 2, at(D2, "15:30"))).error?.message, "not_your_turn")

    const { data: offers } = await a.db.from("offers").select("version, proposer_company_id, starts_at").eq("thread_id", thread).order("version")
    assert.deepEqual(offers!.map((o) => [o.version, o.proposer_company_id]), [[1, a.id], [2, b.id]])

    const ok = await accept(a, thread, 2)
    assert.equal(ok.error, null)
    const { data: m } = await a.db.from("meetings").select("starts_at").eq("thread_id", thread).single()
    assert.equal(new Date(m!.starts_at).toISOString(), at(D2, "14:30").start)
  })

  test("14. unread state is tracked separately for each participant", async () => {
    const { t08: a, t09: b } = co
    const thread = await threadFor(a, b, at(D2, "16:00"))
    assert.equal(await unread(a, thread), false, "proposer sees own proposal as unread")
    assert.equal(await unread(b, thread), true)
    await b.db.rpc("mark_thread_read", { p_thread: thread })
    assert.equal(await unread(b, thread), false)
    assert.equal(await unread(a, thread), false)
    await counter(b, thread, 1, at(D2, "16:30"))
    assert.equal(await unread(a, thread), true, "counterproposal should be unread for the other side")
    assert.equal(await unread(b, thread), false)
    await accept(a, thread, 2)
    assert.equal(await unread(b, thread), true, "final outcome should be unread for the proposer")
  })

  test("15. invalid dates and slots are rejected by the database", async () => {
    const { t03: a, t10: b } = co
    const bad = [
      at("2026-11-12", "10:00"), // not an event day
      at("2026-11-09", "10:00"),
      at(D2, "08:30"), // before hours
      at(D2, "17:00"), // starts at close
      at(D2, "16:45"), // off boundary, runs past close
      at(D2, "10:15"), // off boundary
      at(D2, "10:00", 60), // wrong duration
      { start: at(D2, "10:30").start, end: at(D2, "10:00").start }, // end before start
    ]
    for (const s of bad) {
      const { error } = await propose(a, b, s)
      assert.equal(error?.message, "invalid_slot", `accepted ${s.start}–${s.end}`)
    }
    const thread = await threadFor(a, b, at(D2, "09:00"))
    assert.equal((await counter(b, thread, 1, at(D2, "18:00"))).error?.message, "invalid_slot")
    assert.equal((await propose(a, a, at(D2, "09:30"))).error?.message, "self_proposal")
  })
})

describe("booking", () => {
  test("8. simultaneous acceptances cannot double-book a company", async () => {
    const { t01: x, t07: y, t08: z } = co
    const s = at(D2, "13:00")
    const t1 = await threadFor(y, x, s)
    const t2 = await threadFor(z, x, s)
    const results = await Promise.all([accept(x, t1, 1), accept(x, t2, 1)])
    assert.equal(results.filter((r) => !r.error).length, 1)
    assert.equal(results.filter((r) => r.error?.message === "company_conflict").length, 1)
    const { count } = await service.from("meeting_participants").select("*", { count: "exact", head: true }).eq("company_id", x.id).overlaps("slot", `[${s.start},${s.end})`)
    assert.equal(count, 1)
  })

  test("8 & 11. simultaneous acceptances fill each table once; the overflow is not booked", async () => {
    const s = at(D2, "15:00")
    const race = Object.keys(co).filter((k) => k.startsWith("r")).map((k) => co[k])
    const threads: [Co, string][] = []
    for (let i = 0; i < race.length; i += 2) threads.push([race[i + 1], await threadFor(race[i], race[i + 1], s)])

    const results = await Promise.all(threads.map(([responder, id]) => accept(responder, id, 1)))
    assert.equal(results.filter((r) => !r.error).length, tableCount)
    const failedIdx = results.flatMap((r, i) => (r.error ? [i] : []))
    assert.equal(failedIdx.length, 1)
    assert.equal(results[failedIdx[0]].error?.message, "no_table")

    const failedThread = threads[failedIdx[0]][1]
    const { data } = await service.from("threads").select("status").eq("id", failedThread).single()
    assert.equal(data!.status, "pending", "failed booking left thread confirmed")
    const { count } = await service.from("meetings").select("*", { count: "exact", head: true }).eq("thread_id", failedThread)
    assert.equal(count, 0, "orphan meeting created")

    const { data: booked } = await service.from("meetings").select("table_id").eq("starts_at", s.start)
    assert.equal(booked!.length, tableCount)
    assert.equal(new Set(booked!.map((m) => m.table_id)).size, tableCount, "a table was double-booked")
  })

  test("9. retrying a successful acceptance returns the same meeting", async () => {
    const { t09: a, t10: b } = co
    const thread = await threadFor(a, b, at(D2, "14:00"))
    const first = await accept(b, thread, 1)
    const [r1, r2] = await Promise.all([accept(b, thread, 1), accept(b, thread, 1)])
    assert.equal(first.error, null)
    assert.equal(r1.data, first.data)
    assert.equal(r2.data, first.data)
    const { count } = await service.from("meetings").select("*", { count: "exact", head: true }).eq("thread_id", thread)
    assert.equal(count, 1)
  })

  test("10. adjacent meetings (10:00–10:30 then 10:30–11:00) are both allowed", async () => {
    const { t04: p, t02: q, t03: r } = co
    const first = await threadFor(q, p, at(D2, "16:00"))
    const second = await threadFor(r, p, at(D2, "16:30"))
    assert.equal((await accept(p, first, 1)).error, null)
    assert.equal((await accept(p, second, 1)).error, null)
  })
})
