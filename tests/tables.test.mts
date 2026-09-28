// Per-day shared tables and Premium dedicated tables, against the local stack.
// Uses throwaway companies and Nov 11 09:00–12:00, and restores Nov 11's
// shared-table count afterwards.
//
//   npm test
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
const D1 = "2026-11-10"
const D2 = "2026-11-11"
const at = (date: string, hhmm: string) => {
  const start = new Date(`${date}T${hhmm}:00+08:00`)
  return { start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() }
}

type Co = { id: string; userId: string; db: SupabaseClient }
const co: Record<string, Co> = {}
const users: string[] = []
let admin: SupabaseClient
let d2Shared = 0

async function user(email: string) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  users.push(data.user.id)
  return data.user.id
}
async function signIn(email: string) {
  const db = createClient(url, publishable, opts)
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw error
  return db
}
async function company(key: string, tier: "premium" | "access") {
  const { data: c, error } = await service
    .from("companies")
    .insert({ name: `zz Tables ${key} ${run}`, contact_email: `${key}@test.invalid`, contact_name: "T", business_type: "T", tier })
    .select("id")
    .single()
  if (error) throw error
  const email = `tbl-${key}-${run}@test.invalid`
  const userId = await user(email)
  await service.from("app_users").insert({ id: userId, company_id: c.id, is_admin: false })
  co[key] = { id: c.id, userId, db: await signIn(email) }
  return co[key]
}

const propose = (from: Co, to: Co, s: { start: string; end: string }) =>
  from.db.rpc("propose_meeting", { p_target: to.id, p_starts_at: s.start, p_ends_at: s.end })
const accept = (by: Co, thread: string, v: number) => by.db.rpc("accept_offer", { p_thread: thread, p_expected_version: v })
async function thread(from: Co, to: Co, s: { start: string; end: string }) {
  const { data, error } = await propose(from, to, s)
  assert.equal(error, null, error?.message)
  return data as string
}
async function tableOf(meetingId: string) {
  const { data } = await service.from("meetings").select("meeting_tables(id, kind, owner_company_id, event_date)").eq("id", meetingId).single()
  return data!.meeting_tables as unknown as { id: number; kind: string; owner_company_id: string | null; event_date: string }
}
const dedicated = (companyId: string) =>
  service.from("meeting_tables").select("id, event_date, is_active").eq("kind", "dedicated").eq("owner_company_id", companyId)
const activeShared = async (date: string) =>
  (await service.from("meeting_tables").select("*", { count: "exact", head: true }).eq("kind", "shared").eq("event_date", date).eq("is_active", true)).count ?? 0

before(async () => {
  const { data: clash } = await service.from("meetings").select("id").gte("starts_at", at(D2, "09:00").start).lt("starts_at", at(D2, "12:00").start)
  assert.equal(clash?.length ?? 0, 0, "Nov 11 09:00–12:00 must be free of meetings for these tests")
  const { data: clash1 } = await service.from("meetings").select("id").gte("starts_at", at(D1, "09:00").start).lt("starts_at", at(D1, "12:00").start)
  assert.equal(clash1?.length ?? 0, 0, "Nov 10 09:00–12:00 must be free of meetings for these tests")
  const { data: clash2 } = await service.from("meetings").select("id").eq("starts_at", at(D2, "12:00").start)
  assert.equal(clash2?.length ?? 0, 0, "Nov 11 12:00 must be free of meetings for these tests")
  d2Shared = await activeShared(D2)
  const email = `tbl-organizer-${run}@test.invalid`
  const id = await user(email)
  await service.from("app_users").insert({ id, company_id: null, is_admin: true })
  admin = await signIn(email)
  for (const k of ["p1", "p2"]) await company(k, "premium")
  for (const k of ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]) await company(k, "access")
})

after(async () => {
  await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: d2Shared, p_apply: true })
  const ids = Object.values(co).map((c) => c.id)
  const { data: threads } = await service.from("threads").select("id").or(`company_a_id.in.(${ids}),company_b_id.in.(${ids})`)
  const threadIds = (threads ?? []).map((t) => t.id)
  if (threadIds.length) {
    await service.from("meetings").delete().in("thread_id", threadIds)
    await service.from("threads").delete().in("id", threadIds)
  }
  for (const id of users) await service.auth.admin.deleteUser(id)
  await service.from("companies").delete().in("id", ids)
})

describe("automatic Premium table assignment", () => {
  // These use p2 only, so the tier-change tests on p1 below stay valid.
  const ownerOf = async (meetingId: string) => (await tableOf(meetingId)).owner_company_id

  test("1 & 11. Premium requests a lower-tier organization; on confirmation the Premium table is assigned and every view shows the same label", async () => {
    const t = await thread(co.p2, co.a3, at(D1, "09:00"))
    const { data, error } = await accept(co.a3, t, 1)
    assert.equal(error, null, error?.message)
    const table = await tableOf(data as string)
    assert.equal(table.kind, "dedicated")
    assert.equal(table.owner_company_id, co.p2.id)
    assert.equal(table.event_date, D1)
    // Request details / My schedule read the thread's meeting; organizers read meetings directly.
    const labels = await Promise.all(
      [co.a3.db, co.p2.db].map(async (db) => {
        const { data } = await db.from("threads").select("meetings(meeting_tables(label))").eq("id", t).single()
        return (data?.meetings as unknown as { meeting_tables: { label: string } } | null)?.meeting_tables.label
      }),
    )
    const { data: row } = await admin.from("meetings").select("meeting_tables(label)").eq("id", data as string).single()
    const organizer = (row?.meeting_tables as unknown as { label: string } | null)?.label
    assert.ok(organizer?.startsWith("Premium table"), organizer)
    assert.deepEqual(labels, [organizer, organizer])
  })

  test("2 & 3. lower-tier requests Premium; counterproposals switch the responder but not the table owner", async () => {
    const t = await thread(co.a4, co.p2, at(D1, "09:30")) // p2 responds
    const c = await co.p2.db.rpc("counter_offer", { p_thread: t, p_expected_version: 1, p_starts_at: at(D1, "10:00").start, p_ends_at: at(D1, "10:00").end })
    assert.equal(c.error, null, c.error?.message)
    assert.equal((await accept(co.p2, t, 2)).error?.message, "not_your_turn") // now a4 responds
    const { data: av } = await co.a4.db.rpc("slot_availability", { p_target: co.p2.id, p_date: D1, p_thread: t })
    assert.ok(av!.every((s: { dedicated: boolean }) => s.dedicated))
    const { data, error } = await accept(co.a4, t, 2)
    assert.equal(error, null, error?.message)
    assert.equal(await ownerOf(data as string), co.p2.id)
  })

  test("4. zero shared tables doesn't stop a Premium-to-lower-tier meeting", async () => {
    assert.equal((await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: 0, p_apply: true })).data.ok, true)
    try {
      assert.equal(await activeShared(D2), 0)
      const prem = await thread(co.a5, co.p2, at(D2, "12:00"))
      const { data, error } = await accept(co.p2, prem, 1)
      assert.equal(error, null, error?.message)
      assert.equal(await ownerOf(data as string), co.p2.id)
      // The same moment between two lower-tier organizations has nowhere to go.
      const plain = await thread(co.a1, co.a2, at(D2, "12:00"))
      assert.equal((await accept(co.a2, plain, 1)).error?.message, "no_table")
    } finally {
      await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: d2Shared, p_apply: true })
    }
  })

  test("5. an occupied company or dedicated table prevents confirmation", async () => {
    // Occupy p2's Nov 10 table at 11:00 with a meeting p2 isn't in (as legacy data could).
    const { data: tbl } = await service.from("meeting_tables").select("id").eq("kind", "dedicated").eq("owner_company_id", co.p2.id).eq("event_date", D1).single()
    const other = await thread(co.a1, co.a3, at(D1, "11:00"))
    const { data: offer } = (await service.from("offers").select("id").eq("thread_id", other).single()) as { data: { id: string } | null }
    const s = at(D1, "11:00")
    const { data: m, error: me } = await service.from("meetings").insert({ thread_id: other, offer_id: offer!.id, table_id: tbl!.id, starts_at: s.start, ends_at: s.end }).select("id").single()
    assert.equal(me, null, me?.message)
    await service.from("meeting_participants").insert([co.a1.id, co.a3.id].map((company_id) => ({ meeting_id: m!.id, company_id, slot: `[${s.start},${s.end})` })))
    await service.from("threads").update({ status: "confirmed" }).eq("id", other)

    const { data: av } = await co.a6.db.rpc("slot_availability", { p_target: co.p2.id, p_date: D1 })
    const slot = av!.find((x: { starts_at: string }) => new Date(x.starts_at).toISOString() === s.start)!
    assert.equal(slot.free_tables, 0)
    const t = await thread(co.a6, co.p2, s)
    assert.equal((await accept(co.p2, t, 1)).error?.message, "dedicated_table_busy")
    // And a busy organization: p2 already meets a3 at 09:00.
    const busy = await thread(co.a1, co.p2, at(D1, "09:00"))
    assert.equal((await accept(co.p2, busy, 1)).error?.message, "company_conflict")
  })

  test("6. simultaneous confirmations can't double-book the Premium organization or its table", async () => {
    const s = at(D1, "11:30")
    const t1 = await thread(co.a7, co.p2, s)
    const t2 = await thread(co.a8, co.p2, s)
    const results = await Promise.all([accept(co.p2, t1, 1), accept(co.p2, t2, 1)])
    assert.equal(results.filter((r) => !r.error).length, 1)
    assert.equal(results.find((r) => r.error)?.error?.message, "company_conflict")
    const { count } = await service.from("meetings").select("*", { count: "exact", head: true }).eq("starts_at", s.start)
    assert.equal(count, 1)
  })

  test("7 & 8. each day's shared tables are set independently and persist", async () => {
    const d1 = await activeShared(D1)
    const d2 = await activeShared(D2)
    try {
      assert.equal((await admin.rpc("admin_set_shared_tables", { p_date: D1, p_count: d1 + 1, p_apply: true })).data.ok, true)
      assert.equal(await activeShared(D2), d2, "changing Nov 10 changed Nov 11")
      assert.equal((await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: d2 + 2, p_apply: true })).data.ok, true)
      assert.equal(await activeShared(D1), d1 + 1, "changing Nov 11 changed Nov 10")
      // A new organizer session reads the saved values.
      const email = `tbl-organizer2-${run}@test.invalid`
      const id = await user(email)
      await service.from("app_users").insert({ id, company_id: null, is_admin: true })
      const fresh = await signIn(email)
      for (const [date, want] of [[D1, d1 + 1], [D2, d2 + 2]] as const) {
        const { count } = await fresh.from("meeting_tables").select("*", { count: "exact", head: true }).eq("kind", "shared").eq("event_date", date).eq("is_active", true)
        assert.equal(count, want)
      }
    } finally {
      await admin.rpc("admin_set_shared_tables", { p_date: D1, p_count: d1, p_apply: true })
      await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: d2, p_apply: true })
    }
  })

  test("12b. public sign-up is disabled: registering happens outside the platform", async () => {
    const anon = createClient(url, publishable, opts)
    const { data, error } = await anon.auth.signUp({ email: `walk-in-${run}@test.invalid`, password })
    assert.ok(error, "public sign-up succeeded")
    assert.equal(data.user, null)
  })
})

describe("dedicated tables", () => {
  test("5. each active Premium organization has exactly one dedicated table per day, idempotently", async () => {
    const { p1 } = co
    // Downgrade and upgrade twice: still one row per day, re-activated.
    for (let i = 0; i < 2; i++) {
      assert.equal((await service.from("companies").update({ tier: "access" }).eq("id", p1.id)).error, null)
      assert.ok((await dedicated(p1.id)).data!.every((t) => !t.is_active), "downgrade left a dedicated table active")
      assert.equal((await service.from("companies").update({ tier: "premium" }).eq("id", p1.id)).error, null)
    }
    const { data } = await dedicated(p1.id)
    assert.deepEqual(data!.map((t) => t.event_date).sort(), [D1, D2])
    assert.ok(data!.every((t) => t.is_active))
    // Access companies get none.
    assert.equal((await dedicated(co.a1.id)).data!.length, 0)
  })

  test("6. dedicated tables are excluded from shared availability counts", async () => {
    const { data, error } = await co.a1.db.rpc("slot_availability", { p_target: co.a2.id, p_date: D2 })
    assert.equal(error, null, error?.message)
    const slot = data!.find((s: { starts_at: string }) => new Date(s.starts_at).toISOString() === at(D2, "09:00").start)!
    assert.equal(slot.dedicated, false)
    assert.equal(slot.free_tables, await activeShared(D2))
    const { data: prem } = await co.a1.db.rpc("slot_availability", { p_target: co.p1.id, p_date: D2 })
    const ps = prem!.find((s: { starts_at: string }) => new Date(s.starts_at).toISOString() === at(D2, "09:00").start)!
    assert.equal(ps.dedicated, true)
    assert.equal(ps.free_tables, 1)
  })

  test("7. a Premium-to-non-Premium meeting uses the Premium organization's table", async () => {
    const t = await thread(co.a1, co.p1, at(D2, "09:00"))
    const { data, error } = await accept(co.p1, t, 1)
    assert.equal(error, null, error?.message)
    const table = await tableOf(data as string)
    assert.equal(table.kind, "dedicated")
    assert.equal(table.owner_company_id, co.p1.id)
    assert.equal(table.event_date, D2)
  })

  test("8. Premium-to-Premium uses the original recipient's table through counterproposals, and blocks both", async () => {
    const { p1, p2 } = co
    const t = await thread(p1, p2, at(D2, "09:30")) // p2 is the recipient and host
    assert.equal((await p2.db.rpc("counter_offer", { p_thread: t, p_expected_version: 1, p_starts_at: at(D2, "10:00").start, p_ends_at: at(D2, "10:00").end })).error, null)
    // Availability for the counter keeps p2 as host.
    const { data: av } = await p1.db.rpc("slot_availability", { p_target: p2.id, p_date: D2, p_thread: t })
    assert.ok(av!.every((s: { dedicated: boolean }) => s.dedicated))
    const { data, error } = await accept(p1, t, 2)
    assert.equal(error, null, error?.message)
    const table = await tableOf(data as string)
    assert.equal(table.owner_company_id, p2.id)
    const { count } = await service.from("meeting_participants").select("*", { count: "exact", head: true }).eq("meeting_id", data as string)
    assert.equal(count, 2)
    // p1's own table stays free, but p1 is busy: another meeting at 10:00 is refused.
    const other = await thread(co.a2, p1, at(D2, "10:00"))
    assert.equal((await accept(p1, other, 1)).error?.message, "company_conflict")
  })

  test("11. simultaneous acceptance and capacity reduction: exactly one wins, nothing lands on a switched-off table", async () => {
    // One shared table on Nov 11 (none booked yet): accepting needs it, reducing to 0 removes it.
    assert.equal((await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: 1, p_apply: true })).data.ok, true)
    const t = await thread(co.a5, co.a2, at(D2, "11:30"))
    const [acc, cap] = await Promise.all([
      accept(co.a2, t, 1),
      admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: 0, p_apply: true }),
    ])
    assert.equal(cap.error, null, cap.error?.message)
    assert.notEqual(acc.error === null, cap.data.ok === true, `acc=${acc.error?.message} cap=${JSON.stringify(cap.data)}`)
    if (acc.error) assert.equal(acc.error.message, "no_table")
    const { data: bad } = await service
      .from("meetings")
      .select("id, meeting_tables!inner(is_active)")
      .eq("meeting_tables.is_active", false)
    assert.equal(bad!.length, 0, "a confirmed meeting sits on a deactivated table")
  })

  test("9. non-Premium meetings never use a dedicated table", async () => {
    // Shrink Nov 11 to one shared table, fill it, then a second pair gets no_table
    // even though dedicated tables are free.
    const r = await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: 1, p_apply: true })
    assert.equal(r.error, null, r.error?.message)
    assert.equal(r.data.ok, true, JSON.stringify(r.data))
    const t1 = await thread(co.a3, co.a4, at(D2, "11:00"))
    const t2 = await thread(co.a5, co.a6, at(D2, "11:00"))
    assert.equal((await accept(co.a4, t1, 1)).error, null)
    assert.equal((await accept(co.a6, t2, 1)).error?.message, "no_table")
    await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: d2Shared, p_apply: true })
  })
})

describe("capacity and tier changes", () => {
  test("4. shared capacity can differ by day, and increases never renumber", async () => {
    const before1 = await activeShared(D1)
    const r = await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: before1 + 2, p_apply: true })
    assert.equal(r.data.ok, true)
    assert.equal(await activeShared(D2), before1 + 2)
    assert.equal(await activeShared(D1), before1)
    const { data } = await service.from("meeting_tables").select("label, number").eq("kind", "shared").eq("event_date", D2)
    assert.ok(data!.every((t) => t.label === `Table ${t.number}`))
    assert.equal(new Set(data!.map((t) => t.number)).size, data!.length)
    // Invalid values are refused.
    for (const bad of [-1, 1.5]) assert.ok((await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: bad })).error)
    assert.equal((await admin.rpc("admin_set_shared_tables", { p_date: "2026-11-12", p_count: 1 })).error?.message, "invalid_date")
    await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: d2Shared, p_apply: true })
  })

  test("10. a reduction that would remove a booked table changes nothing and lists the booking", async () => {
    // test 9 left one confirmed shared meeting on Nov 11.
    const beforeCount = await activeShared(D2)
    const r = await admin.rpc("admin_set_shared_tables", { p_date: D2, p_count: 0, p_apply: true })
    assert.equal(r.error, null)
    assert.equal(r.data.ok, false)
    assert.ok(r.data.blocked.length >= 1)
    assert.equal(await activeShared(D2), beforeCount, "a partial change was applied")
  })

  test("downgrading a Premium host with an upcoming booking is refused", async () => {
    const { error } = await admin.from("companies").update({ tier: "access" }).eq("id", co.p1.id)
    assert.equal(error?.message, "dedicated_table_in_use")
    assert.match(error?.details ?? "", /Premium table/)
    const { data } = await service.from("companies").select("tier").eq("id", co.p1.id).single()
    assert.deepEqual(data, { tier: "premium" })
  })

})

describe("permissions", () => {
  test("12. participants cannot change table configuration or reconcile venues", async () => {
    const p = co.a1.db
    assert.equal((await p.rpc("admin_set_shared_tables", { p_date: D2, p_count: 9, p_apply: true })).error?.message, "not_authorized")
    assert.equal((await p.rpc("admin_reconcile_venues", { p_apply: true })).error?.message, "not_authorized")
    const { data: t } = await service.from("meeting_tables").select("id").eq("kind", "dedicated").eq("owner_company_id", co.p1.id).limit(1).single()
    await p.from("meeting_tables").update({ owner_company_id: co.a1.id, is_active: false }).eq("id", t!.id)
    await p.from("meeting_tables").insert({ label: "x", location: "x", event_date: D2, number: 999 })
    const { data } = await service.from("meeting_tables").select("owner_company_id, is_active").eq("id", t!.id).single()
    assert.deepEqual(data, { owner_company_id: co.p1.id, is_active: true })
    assert.equal((await service.from("meeting_tables").select("id").eq("number", 999)).data!.length, 0)
  })

  test("the reconciliation preview is read-only and lists only rule mismatches", async () => {
    const { data, error } = await admin.rpc("admin_reconcile_venues", { p_apply: false })
    assert.equal(error, null, error?.message)
    assert.equal(data.applied, false)
    // None of this suite's meetings are mismatched.
    const ours = Object.values(co).map((c) => c.id)
    assert.ok(!data.changes.some((c: { companies: string }) => c.companies.includes(run)), JSON.stringify(data.changes))
    assert.ok(ours.length > 0)
  })
})
