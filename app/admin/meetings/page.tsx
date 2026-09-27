import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon, SlidersHorizontalIcon } from "lucide-react"
import { EmptyState, PageHeader } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDay, formatRange, getEventConfig, isPast, tzLabel } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Meetings" }

const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

export default async function AdminMeetingsPage({ searchParams }: PageProps<"/admin/meetings">) {
  await requireAdmin()
  const sp = await searchParams
  const view = sp.view === "negotiations" ? "negotiations" : "meetings"
  const day = String(sp.day ?? "")
  const q = String(sp.q ?? "").trim().toLowerCase()
  const table = String(sp.table ?? "")
  const status = String(sp.status ?? "")
  const config = await getEventConfig()
  const tz = config.timezone
  const supabase = await createClient()
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso))
  const matchesName = (a?: string, b?: string) => !q || `${a} ${b}`.toLowerCase().includes(q)

  const { data: tables } = await supabase.from("meeting_tables").select("id, label").order("id")

  // ponytail: filters run in memory; fine for an event-sized dataset, move to SQL if it grows past a few thousand rows.
  let meetingRows: {
    id: string
    starts_at: string
    ends_at: string
    thread_id: string
    table: string
    a: string
    b: string
    aTier: string | null
    bTier: string | null
  }[] = []
  let threadRows: { id: string; status: "pending" | "confirmed" | "declined"; a: string; b: string; aTier: string | null; bTier: string | null; versions: number; latest: { starts_at: string; ends_at: string } | undefined; updated: string }[] = []

  if (view === "meetings") {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, starts_at, ends_at, thread_id, table_id, meeting_tables(label), threads(company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier))")
      .eq("status", "confirmed")
      .order("starts_at")
      .order("table_id")
    if (error) throw error
    meetingRows = data
      .filter((m) => !day || dayOf(m.starts_at) === day)
      .filter((m) => !table || String(m.table_id) === table)
      .filter((m) => !status || (status === "past" ? isPast(m.ends_at) : !isPast(m.ends_at)))
      .filter((m) => matchesName(m.threads?.company_a?.name, m.threads?.company_b?.name))
      .map((m) => ({
        id: m.id,
        starts_at: m.starts_at,
        ends_at: m.ends_at,
        thread_id: m.thread_id,
        table: m.meeting_tables?.label ?? "",
        a: m.threads?.company_a?.name ?? "",
        b: m.threads?.company_b?.name ?? "",
        aTier: m.threads?.company_a?.tier ?? null,
        bTier: m.threads?.company_b?.tier ?? null,
      }))
  } else {
    const { data, error } = await supabase
      .from("threads")
      .select("id, status, current_version, last_activity_at, company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier), offers(version, starts_at, ends_at)")
      .order("last_activity_at", { ascending: false })
    if (error) throw error
    threadRows = data
      .filter((t) => !status || t.status === status)
      .filter((t) => matchesName(t.company_a?.name, t.company_b?.name))
      .map((t) => {
        const latest = t.offers.find((o) => o.version === t.current_version)
        return { id: t.id, status: t.status, a: t.company_a?.name ?? "", b: t.company_b?.name ?? "", aTier: t.company_a?.tier ?? null, bTier: t.company_b?.tier ?? null, versions: t.current_version, latest, updated: t.last_activity_at }
      })
      .filter((t) => !day || (t.latest && dayOf(t.latest.starts_at) === day))
  }

  const tab = (v: string, label: string) => (
    <Link
      href={v === "meetings" ? "/admin/meetings" : "/admin/meetings?view=negotiations"}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 sm:flex-none",
        view === v ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  )
  const count = view === "meetings" ? meetingRows.length : threadRows.length

  return (
    <div className="space-y-6">
      <PageHeader title="Meetings" description={`Monitor confirmed meetings and negotiations. Read-only; times in ${tzLabel(tz)}.`} />

      <nav aria-label="Monitoring view" className="flex w-full gap-1 rounded-full bg-muted p-1 sm:w-fit">
        {tab("meetings", "Confirmed meetings")}
        {tab("negotiations", "Negotiations")}
      </nav>

      <form className="panel grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] lg:items-end">
        {view === "negotiations" && <input type="hidden" name="view" value="negotiations" />}
        <Filter label="Event day" htmlFor="day">
          <select id="day" name="day" defaultValue={day} className={selectClass}>
            <option value="">Both days</option>
            {config.eventDates.map((d) => (
              <option key={d} value={d}>
                {formatDay(d, tz)}
              </option>
            ))}
          </select>
        </Filter>
        {view === "meetings" ? (
          <Filter label="Table" htmlFor="table">
            <select id="table" name="table" defaultValue={table} className={selectClass}>
              <option value="">All tables</option>
              {tables?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Filter>
        ) : null}
        <Filter label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status} className={selectClass}>
            {view === "meetings" ? (
              <>
                <option value="">Upcoming and completed</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Completed</option>
              </>
            ) : (
              <>
                <option value="">Any status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="declined">Declined</option>
              </>
            )}
          </select>
        </Filter>
        <Filter label="Company" htmlFor="q">
          <Input id="q" name="q" type="search" defaultValue={String(sp.q ?? "")} placeholder="Company name" />
        </Filter>
        <Button type="submit" className="h-11">
          <SlidersHorizontalIcon /> Apply
        </Button>
      </form>

      <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {count} {view === "meetings" ? (count === 1 ? "meeting" : "meetings") : count === 1 ? "negotiation" : "negotiations"}
      </p>

      {count === 0 ? (
        <EmptyState title="Nothing matches these filters">Clear a filter or pick the other event day.</EmptyState>
      ) : view === "meetings" ? (
        <ul className="panel divide-y divide-border overflow-hidden">
          {meetingRows.map((m) => (
            <li key={m.id}>
              <Link
                href={`/admin/threads/${m.thread_id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors duration-150 hover:bg-secondary/40 sm:px-5 md:grid-cols-[15rem_minmax(0,1fr)_5rem_7rem_auto]"
              >
                <span className="tabular text-sm whitespace-nowrap">
                  <span className="font-bold">{formatDay(m.starts_at, tz)}</span>
                  <span className="text-muted-foreground"> · {formatRange(m.starts_at, m.ends_at, tz)}</span>
                </span>
                <span className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                  <Pair a={m.a} aTier={m.aTier} b={m.b} bTier={m.bTier} />
                </span>
                <span className="text-sm font-bold">{m.table}</span>
                <StatusBadge status={isPast(m.ends_at) ? "past" : "confirmed"} className="hidden md:inline-flex" />
                <ChevronRightIcon aria-hidden className="hidden size-5 text-muted-foreground md:block" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="panel divide-y divide-border overflow-hidden">
          {threadRows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/threads/${t.id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors duration-150 hover:bg-secondary/40 sm:px-5 md:grid-cols-[minmax(0,1fr)_14rem_7rem_auto]"
              >
                <span className="min-w-0 text-sm">
                  <Pair a={t.a} aTier={t.aTier} b={t.b} bTier={t.bTier} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t.versions} {t.versions === 1 ? "offer" : "offers"}
                  </span>
                </span>
                <StatusBadge status={t.status} />
                <span className="tabular col-span-2 text-sm text-muted-foreground md:col-span-1 md:row-start-1 md:col-start-2">
                  {t.latest && `${formatDay(t.latest.starts_at, tz)} · ${formatRange(t.latest.starts_at, t.latest.ends_at, tz).split(" – ")[0]}`}
                </span>
                <ChevronRightIcon aria-hidden className="hidden size-5 text-muted-foreground md:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Filter({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

// Each company keeps its own badge so tiers are never ambiguous in a pair.
function Pair({ a, aTier, b, bTier }: { a: string; aTier: string | null; b: string; bTier: string | null }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold">{a}</span>
        <TierBadge tier={aTier} size="sm" />
      </span>
      <span className="text-muted-foreground">and</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-semibold">{b}</span>
        <TierBadge tier={bTier} size="sm" />
      </span>
    </span>
  )
}
