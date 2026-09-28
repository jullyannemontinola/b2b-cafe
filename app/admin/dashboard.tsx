import Link from "next/link"
import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, ChevronRightIcon, ClockIcon } from "lucide-react"
import { reconcileVenues } from "@/app/admin/actions"
import { TierBadge, TIERS, tierMeta } from "@/components/tier-badge"
import { formatDay, formatRange, formatTime, getEventConfig, isPast, localParts, olderThanDays, tzLabel } from "@/lib/event"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const STALE_DAYS = 3 // a request with no response for this long needs a nudge
const BUSY_SHARE = 0.8 // shared tables this full on a day are flagged

const blockedReason: Record<string, string> = {
  past: "the proposed time has passed",
  company_busy: "one of them already has a confirmed meeting then",
  no_dedicated_table: "the Premium organization has no table that day",
  dedicated_table_busy: "the Premium table is already booked then",
  no_shared_table: "no shared table is free then",
}

// Every figure comes from stored rows; the capacity figures use the tables
// configured per day (shared + Premium dedicated) and the configured meeting
// times, the same inputs booking uses.
export async function Dashboard() {
  const config = await getEventConfig()
  const tz = config.timezone
  const supabase = await createClient()

  const [companies, accounts, requests, meetings, tables, blocked, venue] = await Promise.all([
    supabase.from("companies").select("id, name, tier").order("name"),
    supabase.from("company_accounts").select("company_id, status, invite_sent_at"),
    supabase
      .from("threads")
      .select("id, current_version, last_activity_at, company_a:companies!threads_company_a_id_fkey(name), company_b:companies!threads_company_b_id_fkey(name), offers(version, starts_at)")
      .eq("status", "pending"),
    supabase
      .from("meetings")
      .select(
        "id, starts_at, ends_at, thread_id, meeting_tables(label, kind), threads(company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier))",
      )
      .eq("status", "confirmed")
      .order("starts_at"),
    supabase.from("meeting_tables").select("event_date, kind").eq("is_active", true),
    supabase.rpc("admin_blocked_requests"),
    reconcileVenues(false),
  ])
  for (const r of [companies, accounts, requests, meetings, tables, blocked]) if (r.error) throw r.error

  const orgs = companies.data!
  const account = new Map(accounts.data!.map((a) => [a.company_id, a]))
  const ready = (id: string) => account.get(id)?.status === "active"
  const awaiting = orgs.filter((c) => !ready(c.id))
  const open = requests.data!
  const confirmed = meetings.data!
  const dayOf = (iso: string) => localParts(iso, tz).date

  // Tier distribution, split by readiness.
  const tierRows = TIERS.map((tier) => {
    const inTier = orgs.filter((c) => c.tier === tier)
    const readyCount = inTier.filter((c) => ready(c.id)).length
    return { tier, total: inTier.length, ready: readyCount, awaiting: inTier.length - readyCount }
  })
  const tierMax = Math.max(1, ...tierRows.map((t) => t.total))

  // Table use per day: booked 30-minute table slots against configured capacity.
  const timesPerDay = Math.max(0, Math.round((config.dayEndMinutes - config.dayStartMinutes) / config.slotMinutes))
  const days = config.eventDates.map((date) => {
    const onDay = confirmed.filter((m) => dayOf(m.starts_at) === date)
    const kinds = (["shared", "dedicated"] as const).map((kind) => {
      const tablesCount = tables.data!.filter((t) => t.event_date === date && t.kind === kind).length
      const booked = onDay.filter((m) => m.meeting_tables?.kind === kind).length
      return { kind, tables: tablesCount, booked, capacity: tablesCount * timesPerDay }
    })
    const requestsOnDay = open.filter((t) => {
      const latest = t.offers.find((o) => o.version === t.current_version)
      return latest && dayOf(latest.starts_at) === date
    }).length
    return { date, label: formatDay(date, tz), confirmed: onDay.length, requests: requestsOnDay, kinds }
  })

  // Needs attention: only things an organizer can act on.
  type Item = { tone: "serious" | "warning"; text: React.ReactNode; href: string; action: string }
  const items: Item[] = []
  const setupStuck = orgs.filter((c) => ["pending", "account_created", "invite_failed"].includes(account.get(c.id)?.status ?? "pending"))
  for (const c of setupStuck.slice(0, 3))
    items.push({
      tone: "serious",
      text: (
        <>
          <strong>{c.name}</strong>: {account.get(c.id)?.status === "invite_failed" ? "the setup email failed" : "the setup email wasn’t sent"}
        </>
      ),
      href: `/admin/companies/${c.id}`,
      action: "Retry setup",
    })
  if (setupStuck.length > 3)
    items.push({ tone: "serious", text: `${setupStuck.length - 3} more participants without a setup email`, href: "/admin/companies?account=awaiting", action: "View" })
  const unusedInvites = orgs.filter((c) => {
    const a = account.get(c.id)
    return a?.status === "invite_sent" && a.invite_sent_at && olderThanDays(a.invite_sent_at, STALE_DAYS)
  })
  if (unusedInvites.length)
    items.push({
      tone: "warning",
      text: `${unusedInvites.length} ${unusedInvites.length === 1 ? "invitation hasn’t" : "invitations haven’t"} been used for ${STALE_DAYS}+ days`,
      href: "/admin/companies?account=awaiting",
      action: "Review",
    })
  const names = new Map(open.map((t) => [t.id, `${t.company_a?.name ?? "?"} and ${t.company_b?.name ?? "?"}`]))
  for (const b of blocked.data!.slice(0, 3))
    items.push({
      tone: "serious",
      text: (
        <>
          <strong>{names.get(b.thread_id)}</strong>: {formatDay(b.starts_at, tz)}, {formatTime(b.starts_at, tz)} can’t be confirmed —{" "}
          {blockedReason[b.reason] ?? "it’s unavailable"}
        </>
      ),
      href: `/admin/threads/${b.thread_id}`,
      action: "View request",
    })
  if (blocked.data!.length > 3)
    items.push({ tone: "serious", text: `${blocked.data!.length - 3} more requests with a time that can’t be confirmed`, href: "/admin/meetings?view=negotiations&status=pending", action: "View" })
  const stale = open.filter((t) => olderThanDays(t.last_activity_at, STALE_DAYS))
  if (stale.length)
    items.push({
      tone: "warning",
      text: `${stale.length} ${stale.length === 1 ? "request has" : "requests have"} had no response for ${STALE_DAYS}+ days`,
      href: "/admin/meetings?view=negotiations&status=pending",
      action: "View",
    })
  for (const d of days) {
    const shared = d.kinds[0]
    if (shared.tables === 0)
      items.push({ tone: "warning", text: `${d.label} has no shared tables, so non-Premium participants can’t meet each other that day`, href: `/admin/tables?day=${d.date}`, action: "Set tables" })
    else if (shared.booked / shared.capacity >= BUSY_SHARE)
      items.push({ tone: "warning", text: `${d.label}: shared tables are ${pct(shared.booked, shared.capacity)} booked`, href: `/admin/tables?day=${d.date}`, action: "Add tables" })
  }
  if (venue.changes.length)
    items.push({
      tone: "warning",
      text: `${venue.changes.length} confirmed ${venue.changes.length === 1 ? "meeting needs" : "meetings need"} a table review`,
      href: "/admin/tables",
      action: "Review",
    })

  const upcoming = confirmed.filter((m) => !isPast(m.ends_at)).slice(0, 5)

  const kpis = [
    { label: "Approved participants", value: orgs.length, href: "/admin/companies" },
    { label: "Awaiting account setup", value: awaiting.length, href: "/admin/companies?account=awaiting" },
    { label: "Open meeting requests", value: open.length, href: "/admin/meetings?view=negotiations&status=pending" },
    { label: "Confirmed meetings", value: confirmed.length, href: "/admin/meetings" },
  ]

  return (
    <div className="space-y-6">
      <nav aria-label="Summary" className="panel grid grid-cols-2 overflow-hidden lg:grid-cols-4">
        {kpis.map((k, i) => (
          <Link
            key={k.label}
            href={k.href}
            className={cn(
              "group flex flex-col gap-1 p-4 transition-colors duration-150 hover:bg-secondary/40 focus-visible:bg-secondary/50 focus-visible:outline-none sm:p-5",
              i % 2 === 1 && "border-l border-border",
              i >= 2 && "border-t border-border lg:border-t-0",
              i === 2 && "lg:border-l",
            )}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground">
              {k.label}
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
            <span className="tabular text-3xl font-extrabold tracking-tight">{k.value}</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="attention">
        <h2 id="attention" className="sr-only">
          Needs attention
        </h2>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-confirmed/20 bg-confirmed-surface px-4 py-3 text-sm font-semibold text-confirmed">
            <CheckCircle2Icon aria-hidden className="size-4 shrink-0" /> All caught up. Nothing needs your attention.
          </p>
        ) : (
          <div className="rounded-2xl border border-pending/25 bg-pending-surface/60">
            <p className="flex items-center gap-2 px-4 pt-3 text-sm font-bold text-pending sm:px-5" aria-hidden>
              <AlertTriangleIcon className="size-4" /> Needs attention · {items.length}
            </p>
            <ul className="divide-y divide-pending/15">
              {items.map((it, i) => (
                <li key={i}>
                  <Link href={it.href} className="group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-pending-surface focus-visible:bg-pending-surface focus-visible:outline-none sm:px-5">
                    {it.tone === "serious" ? (
                      <AlertTriangleIcon aria-label="Action needed" className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <ClockIcon aria-label="Check" className="size-4 shrink-0 text-pending" />
                    )}
                    <span className="min-w-0 flex-1 text-foreground">{it.text}</span>
                    <span className="shrink-0 font-bold whitespace-nowrap text-primary group-hover:underline">{it.action}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="tiers" className="panel space-y-4 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tiers" className="text-lg">
              Participants by B2B tier
            </h2>
            <Link href="/admin/companies" className="text-sm font-bold text-primary hover:underline">
              Participants
            </Link>
          </div>
          <Legend items={[["bg-chart-1", "Ready to schedule"], ["bg-chart-2", "Awaiting account setup"]]} />
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No participants yet.{" "}
              <Link href="/admin/companies/new" className="font-semibold text-primary hover:underline">
                Add an approved participant
              </Link>
            </p>
          ) : (
            <ul className="space-y-4">
              {tierRows.map((t) => (
                <li key={t.tier} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <TierBadge tier={t.tier} size="sm" />
                    <span className="tabular text-muted-foreground">
                      <span className="font-bold text-foreground">{t.total}</span>
                      {t.total > 0 && (t.awaiting === 0 ? " · all ready" : ` · ${t.ready} ready, ${t.awaiting} awaiting`)}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${tierMeta[t.tier].section}: ${t.total} participants, ${t.ready} ready, ${t.awaiting} awaiting setup`}
                    className="flex h-3 gap-0.5"
                    style={{ width: `${(t.total / tierMax) * 100}%` }}
                  >
                    {t.ready > 0 && <span className="animate-bar h-full rounded-[4px] bg-chart-1" style={{ flexGrow: t.ready }} />}
                    {t.awaiting > 0 && <span className="animate-bar h-full rounded-[4px] bg-chart-2" style={{ flexGrow: t.awaiting }} />}
                    {t.total === 0 && <span className="h-full w-1 rounded-[4px] bg-chart-track" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="days" className="panel space-y-4 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="days" className="text-lg">
              Table use by day
            </h2>
            <Link href="/admin/tables" className="text-sm font-bold text-primary hover:underline">
              Tables
            </Link>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Booked 30-minute slots out of each day’s configured tables × {timesPerDay} meeting times ({tzLabel(tz)}).
          </p>
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d.date} className="space-y-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <Link href={`/admin/meetings?day=${d.date}`} className="font-bold hover:text-primary hover:underline">
                    {d.label}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    <span className="tabular font-semibold text-foreground">{d.confirmed}</span> confirmed ·{" "}
                    <span className="tabular font-semibold text-foreground">{d.requests}</span> {d.requests === 1 ? "request" : "requests"} pending
                  </span>
                </div>
                {d.kinds.map((k) => (
                  <Meter
                    key={k.kind}
                    label={`${k.kind === "shared" ? "Shared" : "Premium dedicated"} · ${k.tables} ${k.tables === 1 ? "table" : "tables"}`}
                    booked={k.booked}
                    capacity={k.capacity}
                    empty={k.kind === "shared" ? "No shared tables" : "No Premium tables"}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="upcoming" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="upcoming" className="text-lg">
            Next meetings
          </h2>
          <Link href="/admin/meetings?status=upcoming" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
            All meetings <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="panel px-5 py-4 text-sm text-muted-foreground">No upcoming confirmed meetings yet. They appear here once a participant confirms a request.</p>
        ) : (
          <ul className="panel divide-y divide-border overflow-hidden">
            {upcoming.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/threads/${m.thread_id}`}
                  className="grid gap-x-4 gap-y-1.5 px-4 py-3 transition-colors duration-150 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:grid-cols-[15rem_minmax(0,1fr)_auto] sm:items-center sm:px-5"
                >
                  <span className="tabular text-sm whitespace-nowrap">
                    <span className="font-bold">{formatDay(m.starts_at, tz)}</span>
                    <span className="text-muted-foreground"> · {formatRange(m.starts_at, m.ends_at, tz)}</span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <Org name={m.threads?.company_a?.name} tier={m.threads?.company_a?.tier} />
                    <span className="text-muted-foreground">and</span>
                    <Org name={m.threads?.company_b?.name} tier={m.threads?.company_b?.tier} />
                  </span>
                  <span className="text-sm font-bold sm:text-right">{m.meeting_tables?.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function pct(part: number, whole: number) {
  if (!whole) return "0%"
  const p = (part / whole) * 100
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`
}

// Booked share of a capacity: a single-hue meter with the exact figures
// beside it, so the numbers never depend on reading the bar.
function Meter({ label, booked, capacity, empty }: { label: string; booked: number; capacity: number; empty: string }) {
  const share = capacity ? Math.min(1, booked / capacity) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{capacity ? label : empty}</span>
        <span className="tabular text-muted-foreground">
          {capacity ? (
            <>
              <span className="font-bold text-foreground">{booked}</span> of {capacity} slots · {pct(booked, capacity)}
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div
        role="meter"
        aria-label={capacity ? `${label}: ${booked} of ${capacity} slots booked` : empty}
        aria-valuemin={0}
        aria-valuemax={capacity || 1}
        aria-valuenow={booked}
        className="h-2.5 overflow-hidden rounded-full bg-chart-track"
      >
        {booked > 0 && <div className="animate-bar h-full min-w-1.5 rounded-full bg-chart-1" style={{ width: `${share * 100}%` }} />}
      </div>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground" aria-label="Legend">
      {items.map(([swatch, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-[3px]", swatch)} />
          {label}
        </li>
      ))}
    </ul>
  )
}

function Org({ name, tier }: { name?: string; tier?: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-semibold">{name ?? "Unavailable organization"}</span>
      <TierBadge tier={tier} size="sm" />
    </span>
  )
}
