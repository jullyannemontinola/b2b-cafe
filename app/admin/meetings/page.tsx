import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { FilterSelect } from "@/components/filter-select"
import { EmptyState } from "@/components/app-shell"
import { RequestBadge, StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NAV } from "@/lib/copy"
import { formatDay, formatRange, getEventConfig, isPast, tzLabel } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: NAV.meetings }

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

  const { data: tables } = await supabase
    .from("meeting_tables")
    .select("id, label, event_date, kind, number, companies(name)")
    .order("event_date")
    .order("kind")
    .order("number")

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
  let threadRows: { id: string; status: "pending" | "confirmed" | "declined"; waitingOn: string | null; a: string; b: string; aTier: string | null; bTier: string | null; versions: number; latest: { starts_at: string; ends_at: string } | undefined; updated: string }[] = []

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
      .select("id, status, current_version, last_activity_at, company_a_id, company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier), offers(version, proposer_company_id, starts_at, ends_at)")
      .order("last_activity_at", { ascending: false })
    if (error) throw error
    threadRows = data
      .filter((t) => !status || t.status === status)
      .filter((t) => matchesName(t.company_a?.name, t.company_b?.name))
      .map((t) => {
        const latest = t.offers.find((o) => o.version === t.current_version)
        // The organization that didn't send the latest time is the one to respond.
        const waitingOn = t.status === "pending" && latest ? ((latest.proposer_company_id === t.company_a_id ? t.company_b?.name : t.company_a?.name) ?? "a participant") : null
        return { id: t.id, status: t.status, waitingOn, a: t.company_a?.name ?? "", b: t.company_b?.name ?? "", aTier: t.company_a?.tier ?? null, bTier: t.company_b?.tier ?? null, versions: t.current_version, latest, updated: t.last_activity_at }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl leading-tight">{NAV.meetings}</h1>
        <nav aria-label="Monitoring view" className="flex w-full gap-1 rounded-full bg-muted p-1 sm:w-fit">
          {tab("meetings", "Confirmed meetings")}
          {tab("negotiations", "Meeting requests")}
        </nav>
      </div>

      <form className="panel flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:p-5">
        {view === "negotiations" && <input type="hidden" name="view" value="negotiations" />}
        <Filter label="Event day" htmlFor="day" className="sm:w-44">
          <FilterSelect
            id="day"
            name="day"
            defaultValue={day}
            options={[{ value: "", label: "Both days" }, ...config.eventDates.map((d) => ({ value: d, label: formatDay(d, tz) }))]}
          />
        </Filter>
        {view === "meetings" && (
          <Filter label="Table" htmlFor="table" className="sm:w-64">
            <FilterSelect
              id="table"
              name="table"
              defaultValue={table}
              options={[
                { value: "", label: "All tables" },
                ...(tables ?? []).map((t) => ({
                  value: String(t.id),
                  label: `${formatDay(t.event_date, tz)} · ${t.label}${t.companies ? ` (${t.companies.name})` : ""}`,
                })),
              ]}
            />
          </Filter>
        )}
        <Filter label="Status" htmlFor="status" className="sm:w-56">
          <FilterSelect
            id="status"
            name="status"
            defaultValue={status}
            options={
              view === "meetings"
                ? [
                    { value: "", label: "Upcoming and completed" },
                    { value: "upcoming", label: "Upcoming" },
                    { value: "past", label: "Completed" },
                  ]
                : [
                    { value: "", label: "Any status" },
                    { value: "pending", label: "Awaiting response" },
                    { value: "confirmed", label: "Meeting confirmed" },
                    { value: "declined", label: "Request declined" },
                  ]
            }
          />
        </Filter>
        <Filter label="Organization" htmlFor="q" className="sm:min-w-52 sm:flex-1">
          <Input id="q" name="q" type="search" defaultValue={String(sp.q ?? "")} placeholder="Organization name" />
        </Filter>
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1 sm:flex-none">
            Apply filters
          </Button>
          {(day || table || status || q) && (
            <Button variant="ghost" className="h-11" nativeButton={false} render={<Link href={view === "meetings" ? "/admin/meetings" : "/admin/meetings?view=negotiations"} />}>
              Clear
            </Button>
          )}
        </div>
      </form>

      <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {count} {view === "meetings" ? (count === 1 ? "meeting" : "meetings") : count === 1 ? "meeting request" : "meeting requests"} · Times in {tzLabel(tz)} (UTC+8) · Read-only
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
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-150 hover:bg-secondary/40 sm:px-5 md:grid-cols-[minmax(0,1fr)_11rem_minmax(9rem,15rem)_auto]"
              >
                <span className="min-w-0 text-sm">
                  <Pair a={t.a} aTier={t.aTier} b={t.b} bTier={t.bTier} />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t.versions} {t.versions === 1 ? "proposed time" : "proposed times"}
                  </span>
                </span>
                <span className="tabular col-span-2 text-sm text-muted-foreground md:col-span-1">
                  {t.latest && `${formatDay(t.latest.starts_at, tz)} · ${formatRange(t.latest.starts_at, t.latest.ends_at, tz).split(" – ")[0]}`}
                </span>
                <RequestBadge status={t.status} waitingOn={t.waitingOn} revised={t.versions > 1} className="col-span-2 justify-self-start md:col-span-1" />
                <ChevronRightIcon aria-hidden className="hidden size-5 text-muted-foreground md:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Filter({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
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
