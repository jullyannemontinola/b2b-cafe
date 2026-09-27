import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, CalendarDaysIcon, InfoIcon, ListIcon } from "lucide-react"
import { AgendaCalendar, type CalendarEvent } from "@/components/agenda-calendar"
import { PageHeader } from "@/components/app-shell"
import { CompanyLogo } from "@/components/company-logo"
import { StatusBadge, UnreadDot } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { formatDay, formatRange, getEventConfig, isPast, localParts, tzLabel } from "@/lib/event"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { isUnread } from "@/lib/threads"
import { cn } from "@/lib/utils"
import { PendingToggle } from "./agenda-controls"

export const metadata: Metadata = { title: "Agenda" }

const AGENDA_COLUMNS =
  "id, status, current_version, last_activity_at, a_last_read_at, b_last_read_at, company_a_id, company_b_id, offers(version, proposer_company_id, starts_at, ends_at), meetings(id, starts_at, ends_at, meeting_tables(label, location))"
const PROFILE_COLUMNS =
  "id, name, business_type, tier, logo_url, description, products_services, partnership_interests, website, contact_name, contact_email, contact_phone"

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const sp = await searchParams
  const viewer = await requireCompany()
  const config = await getEventConfig()
  const tz = config.timezone
  const view = sp.view === "calendar" ? "calendar" : "list"
  const showPending = sp.pending === "1"
  const day = config.eventDates.includes(String(sp.day)) ? String(sp.day) : ""
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("threads")
    .select(AGENDA_COLUMNS)
    .or(`company_a_id.eq.${viewer.companyId},company_b_id.eq.${viewer.companyId}`)
    .in("status", ["pending", "confirmed"])
  if (error) throw error

  // Counterpart profiles through the same RLS as the directory (active companies only).
  const counterpartIds = [...new Set(data.map((t) => (t.company_a_id === viewer.companyId ? t.company_b_id : t.company_a_id)))]
  const { data: profiles } = counterpartIds.length
    ? await supabase.from("companies").select(PROFILE_COLUMNS).in("id", counterpartIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const rows = data.map((t) => {
    const counterpartId = t.company_a_id === viewer.companyId ? t.company_b_id : t.company_a_id
    // Only the latest offer of a thread is ever "pending"; superseded ones never show.
    const latest = t.offers.find((o) => o.version === t.current_version)!
    return {
      t,
      counterpart: profileById.get(counterpartId) ?? null,
      latest,
      unread: isUnread(t, viewer.companyId),
      incoming: latest.proposer_company_id !== viewer.companyId,
    }
  })
  const dayOf = (iso: string) => localParts(iso, tz).date
  const inDay = (iso: string) => !day || dayOf(iso) === day

  const confirmed = rows
    .filter((r) => r.t.status === "confirmed" && r.t.meetings)
    .sort((a, b) => a.t.meetings!.starts_at.localeCompare(b.t.meetings!.starts_at))
  const pending = rows.filter((r) => r.t.status === "pending").sort((a, b) => a.latest.starts_at.localeCompare(b.latest.starts_at))

  const params = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const merged = { view: view === "calendar" ? "calendar" : null, day: day || null, pending: showPending ? "1" : null, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `/agenda${p.size ? `?${p}` : ""}`
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Agenda" description={`Your meetings at B2B Café. All times in ${tzLabel(tz)} (UTC+08:00).`}>
        <nav aria-label="Agenda view" className="flex gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["list", "List", ListIcon],
              ["calendar", "Calendar", CalendarDaysIcon],
            ] as const
          ).map(([v, label, Icon]) => (
            <Link
              key={v}
              href={params({ view: v === "calendar" ? "calendar" : null })}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                view === v ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Event day" className={cn("flex gap-1 rounded-full bg-muted p-1", view === "calendar" && "md:hidden")}>
          {(view === "list" ? ["", ...config.eventDates] : config.eventDates).map((d) => {
            const active = view === "calendar" ? (day || config.eventDates[0]) === d : day === d
            return (
              <Link
                key={d || "all"}
                href={params({ day: d || null })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150",
                  active ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d ? formatDay(d, tz) : "All days"}
              </Link>
            )
          })}
        </nav>
        {view === "calendar" && <PendingToggle on={showPending} />}
      </div>

      {view === "calendar" ? (
        <CalendarView
          config={config}
          selectedDay={day || config.eventDates[0]}
          showPending={showPending}
          events={[
            ...confirmed.map((r): CalendarEvent => {
              const m = r.t.meetings!
              const s = localParts(m.starts_at, tz)
              return {
                id: m.id,
                kind: "confirmed",
                date: s.date,
                startMin: s.minutes,
                endMin: localParts(m.ends_at, tz).minutes,
                dayLabel: formatDay(m.starts_at, tz),
                timeLabel: formatRange(m.starts_at, m.ends_at, tz),
                threadId: r.t.id,
                counterpart: r.counterpart,
                table: m.meeting_tables,
                meetingId: m.id,
              }
            }),
            ...(showPending
              ? pending.map((r): CalendarEvent => {
                  const s = localParts(r.latest.starts_at, tz)
                  return {
                    id: `${r.t.id}-v${r.latest.version}`,
                    kind: r.incoming ? "incoming" : "outgoing",
                    date: s.date,
                    startMin: s.minutes,
                    endMin: localParts(r.latest.ends_at, tz).minutes,
                    dayLabel: formatDay(r.latest.starts_at, tz),
                    timeLabel: formatRange(r.latest.starts_at, r.latest.ends_at, tz),
                    threadId: r.t.id,
                    counterpart: r.counterpart,
                  }
                })
              : []),
          ]}
        />
      ) : (
        <ListView tz={tz} day={day} confirmed={confirmed.filter((r) => inDay(r.t.meetings!.starts_at))} pending={pending.filter((r) => inDay(r.latest.starts_at))} />
      )}
    </div>
  )
}

type Row = {
  t: { id: string; meetings: { id: string; starts_at: string; ends_at: string; meeting_tables: { label: string; location: string } | null } | null }
  counterpart: { id: string; name: string; tier: string; logo_url: string | null } | null
  latest: { starts_at: string; ends_at: string }
  unread: boolean
  incoming: boolean
}

function CalendarView({
  config,
  selectedDay,
  showPending,
  events,
}: {
  config: Awaited<ReturnType<typeof getEventConfig>>
  selectedDay: string
  showPending: boolean
  events: CalendarEvent[]
}) {
  const confirmedCount = events.filter((e) => e.kind === "confirmed").length
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-6 rounded-md bg-primary" /> Confirmed meeting (table booked)
        </li>
        {showPending && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3.5 w-6 rounded-md border-2 border-dashed border-pending/60 bg-pending-surface" /> Pending proposal (not reserved)
          </li>
        )}
      </ul>
      {confirmedCount === 0 && !(showPending && events.length) && (
        <p className="rounded-2xl bg-secondary/70 px-4 py-3 text-sm font-medium text-secondary-foreground">
          No confirmed meetings yet. Accepted proposals appear here as blue blocks{showPending ? "" : "; turn on pending proposals to see offers still being negotiated"}.
        </p>
      )}
      <AgendaCalendar
        days={config.eventDates.map((d) => ({ date: d, label: formatDay(d, config.timezone) }))}
        selectedDay={selectedDay}
        dayStart={config.dayStartMinutes}
        dayEnd={config.dayEndMinutes}
        slotMinutes={config.slotMinutes}
        timezoneLabel="PHT UTC+8"
        events={events}
      />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <InfoIcon className="mt-px size-3.5 shrink-0" />
        Empty time only means you have nothing booked. The other company’s availability and table capacity are checked when you propose and again when a proposal is accepted.
      </p>
    </div>
  )
}

function ListView({ tz, day, confirmed, pending }: { tz: string; day: string; confirmed: Row[]; pending: Row[] }) {
  const upcoming = confirmed.filter((r) => !isPast(r.t.meetings!.ends_at))
  const past = confirmed.filter((r) => isPast(r.t.meetings!.ends_at)).reverse()
  const scope = day ? ` on ${formatDay(day, tz)}` : ""
  return (
    <div className="space-y-10">
      <section aria-labelledby="upcoming" className="space-y-4">
        <SectionTitle id="upcoming" count={upcoming.length}>Upcoming meetings</SectionTitle>
        {upcoming.length === 0 ? (
          <Empty>
            No confirmed meetings{scope} yet. Meetings appear here once a proposal is accepted.
            <Button variant="soft" size="sm" className="mt-4" nativeButton={false} render={<Link href="/companies" />}>
              Find companies <ArrowRightIcon />
            </Button>
          </Empty>
        ) : (
          <MeetingList rows={upcoming} tz={tz} />
        )}
      </section>

      <section aria-labelledby="pending" className="space-y-4">
        <SectionTitle id="pending" count={pending.length}>Pending negotiations</SectionTitle>
        <p className="-mt-2 text-sm text-muted-foreground">Not booked yet. These times aren’t reserved until accepted.</p>
        {pending.length === 0 ? (
          <Empty>No open proposals{scope}.</Empty>
        ) : (
          <ul className="space-y-2">
            {pending.map(({ t, counterpart, latest, unread, incoming }) => (
              <li key={t.id}>
                <Link
                  href={`/inbox/${t.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 border-dashed border-pending/30 bg-card px-4 py-3.5 transition-colors duration-150 hover:bg-pending-surface/50 sm:px-5"
                >
                  <span className="tabular w-full text-sm text-muted-foreground sm:w-48">
                    {formatDay(latest.starts_at, tz)} · {formatRange(latest.starts_at, latest.ends_at, tz)}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-bold">{counterpart?.name ?? "Unavailable company"}</span>
                    {counterpart && <TierBadge tier={counterpart.tier} size="sm" />}
                  </span>
                  {unread && <UnreadDot />}
                  <StatusBadge status="pending" label={incoming ? "Your response" : "Awaiting them"} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past" className="space-y-4">
        <SectionTitle id="past" count={past.length}>Past meetings</SectionTitle>
        {past.length === 0 ? <Empty>No past meetings{scope}.</Empty> : <MeetingList rows={past} tz={tz} past />}
      </section>
    </div>
  )
}

function MeetingList({ rows, tz, past }: { rows: Row[]; tz: string; past?: boolean }) {
  return (
    <ul className="panel divide-y divide-border overflow-hidden">
      {rows.map(({ t, counterpart }) => {
        const m = t.meetings!
        return (
          <li key={t.id}>
            <Link
              href={`/inbox/${t.id}`}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors duration-150 hover:bg-secondary/40 sm:px-5",
                past && "text-muted-foreground",
              )}
            >
              <span className={cn("tabular flex w-20 flex-col items-center rounded-2xl px-2 py-2 text-center", past ? "bg-muted" : "bg-secondary text-secondary-foreground")}>
                <span className="block text-[11px] font-bold uppercase">{formatDay(m.starts_at, tz)}</span>
                <span className="block text-sm font-extrabold">{formatRange(m.starts_at, m.ends_at, tz).split(" – ")[0]}</span>
              </span>
              <span className="min-w-0 space-y-1">
                <span className="flex min-w-0 items-center gap-2">
                  <CompanyLogo name={counterpart?.name ?? "?"} logoUrl={counterpart?.logo_url ?? null} className="hidden size-7 rounded-lg sm:flex" />
                  <span className="truncate font-bold">{counterpart?.name ?? "Unavailable company"}</span>
                  {counterpart && <TierBadge tier={counterpart.tier} size="sm" />}
                </span>
                <span className="tabular block text-sm text-muted-foreground">
                  {formatRange(m.starts_at, m.ends_at, tz)} · {m.meeting_tables?.label}
                </span>
              </span>
              <StatusBadge status={past ? "past" : "confirmed"} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function SectionTitle({ id, count, children }: { id: string; count: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg">
      {children}
      <span className="tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">
        {count}
      </span>
    </h2>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start rounded-3xl border border-dashed border-input bg-card/60 px-5 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}
