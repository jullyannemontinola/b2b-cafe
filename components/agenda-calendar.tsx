"use client"

import Link from "next/link"
import { ArrowRightIcon, CalendarCheckIcon, ClockIcon, MapPinIcon, MessagesSquareIcon, TableIcon } from "lucide-react"
import type { CounterpartData } from "@/components/company-sheet"
import { CompanyLogo } from "@/components/company-logo"
import { CompanyProfile } from "@/components/company-profile"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type CalendarEvent = {
  id: string
  kind: "confirmed" | "incoming" | "outgoing" // incoming = waiting on you
  date: string // local YYYY-MM-DD
  startMin: number
  endMin: number
  dayLabel: string
  timeLabel: string
  threadId: string
  counterpart: (CounterpartData & { id: string }) | { id: string; name: string; tier: string | null; logo_url: string | null } | null
  table?: { label: string; location: string } | null
  meetingId?: string
}

const ROW = 56 // px per slot

export function AgendaCalendar({
  days,
  selectedDay,
  dayStart,
  dayEnd,
  slotMinutes,
  timezoneLabel,
  events,
}: {
  days: { date: string; label: string }[]
  selectedDay: string
  dayStart: number
  dayEnd: number
  slotMinutes: number
  timezoneLabel: string
  events: CalendarEvent[]
}) {
  const rows = Math.max(1, Math.round((dayEnd - dayStart) / slotMinutes))
  const height = rows * ROW
  const hours = Array.from({ length: rows + 1 }, (_, i) => dayStart + i * slotMinutes)

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-[4.25rem_1fr] border-b border-border md:grid-cols-[4.25rem_repeat(var(--days),minmax(0,1fr))]" style={{ "--days": days.length } as React.CSSProperties}>
        <div className="flex items-end px-2 pb-2 text-[10px] leading-tight font-bold text-muted-foreground">{timezoneLabel}</div>
        {days.map((d) => (
          <div
            key={d.date}
            className={cn("border-l border-border px-4 py-3", d.date !== selectedDay && "hidden md:block")}
          >
            <p className="text-sm font-extrabold">{d.label}</p>
            <p className="text-xs text-muted-foreground">
              {events.filter((e) => e.date === d.date && e.kind === "confirmed").length} confirmed
            </p>
          </div>
        ))}
      </div>

      {/* py-3 leaves room for the first and last hour labels. */}
      <div className="grid grid-cols-[4.25rem_1fr] py-3 md:grid-cols-[4.25rem_repeat(var(--days),minmax(0,1fr))]" style={{ "--days": days.length } as React.CSSProperties}>
        {/* Time axis */}
        <div className="relative" style={{ height }} aria-hidden>
          {hours.map((m, i) =>
            m % 60 === 0 || i === 0 ? (
              <span key={m} className="tabular absolute right-2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground" style={{ top: i * ROW }}>
                {clock(m)}
              </span>
            ) : null,
          )}
        </div>

        {days.map((d) => {
          const dayEvents = layout(events.filter((e) => e.date === d.date))
          return (
            <div
              key={d.date}
              role="group"
              aria-label={d.label}
              className={cn("relative border-l border-border", d.date !== selectedDay && "hidden md:block")}
              style={{ height }}
            >
              {hours.slice(1).map((m, i) => (
                <div
                  key={m}
                  aria-hidden
                  className={cn("absolute inset-x-0 border-t", m % 60 === 0 ? "border-border" : "border-dashed border-border/60")}
                  style={{ top: (i + 1) * ROW }}
                />
              ))}
              {dayEvents.map(({ event, lane, lanes }) => {
                const top = ((event.startMin - dayStart) / slotMinutes) * ROW
                const h = ((event.endMin - event.startMin) / slotMinutes) * ROW
                const style = {
                  top: top + 2,
                  height: h - 4,
                  left: `calc(${(lane / lanes) * 100}% + 4px)`,
                  width: `calc(${100 / lanes}% - 8px)`,
                }
                return event.kind === "confirmed" ? (
                  <MeetingBlock key={event.id} event={event} style={style} />
                ) : (
                  <PendingBlock key={event.id} event={event} style={style} />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function clock(min: number) {
  const h = Math.floor(min / 60)
  return `${((h + 11) % 12) + 1}${min % 60 ? `:${String(min % 60).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`
}

// Side-by-side lanes for overlapping events. Confirmed meetings take lane 0 so
// a pending offer never covers a booking.
function layout(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || Number(a.kind !== "confirmed") - Number(b.kind !== "confirmed"))
  const out: { event: CalendarEvent; lane: number; lanes: number }[] = []
  let cluster: { event: CalendarEvent; lane: number }[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    out.push(...cluster.map((c) => ({ ...c, lanes })))
    cluster = []
  }
  for (const event of sorted) {
    if (event.startMin >= clusterEnd && cluster.length) flush()
    const busy = new Set(cluster.filter((c) => c.event.endMin > event.startMin).map((c) => c.lane))
    let lane = 0
    while (busy.has(lane)) lane++
    cluster.push({ event, lane })
    clusterEnd = Math.max(clusterEnd, event.endMin)
  }
  if (cluster.length) flush()
  return out
}

function MeetingBlock({ event, style }: { event: CalendarEvent; style: React.CSSProperties }) {
  const c = event.counterpart
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            style={style}
            aria-label={`Confirmed meeting with ${c?.name ?? "a company"}, ${event.dayLabel}, ${event.timeLabel}${event.table ? `, ${event.table.label}` : ""}. Open details.`}
            className="@container absolute z-10 flex flex-col justify-center overflow-hidden rounded-xl bg-primary px-2.5 py-1 text-left text-primary-foreground shadow-[0_6px_14px_-8px_rgb(21_84_240/0.9)] transition-[background-color,box-shadow] duration-150 hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] leading-tight font-bold">{c?.name ?? "Unavailable company"}</span>
          {c?.tier && <TierBadge tier={c.tier} size="sm" className="hidden h-5 @[15rem]:inline-flex" />}
        </span>
        <span className="tabular truncate text-[11px] text-primary-foreground/85">
          {event.timeLabel}
          {event.table && ` · ${event.table.label}`}
        </span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto rounded-l-[28px] border-border p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-bold text-confirmed">
            <CalendarCheckIcon className="size-4" /> Confirmed meeting
          </SheetTitle>
          <SheetDescription className="sr-only">Meeting details and company information</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-6 py-6">
          <div className="flex items-center gap-3">
            <CompanyLogo name={c?.name ?? "?"} logoUrl={c?.logo_url ?? null} className="size-12" />
            <div className="min-w-0 space-y-1">
              <p className="truncate text-lg font-bold">{c?.name ?? "Unavailable company"}</p>
              <TierBadge tier={c?.tier} size="sm" />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Fact icon={<CalendarCheckIcon />} label="Date">{event.dayLabel}, 2026</Fact>
            <Fact icon={<ClockIcon />} label="Time (Philippine time)">
              <span className="tabular">{event.timeLabel}</span>
            </Fact>
            <Fact icon={<TableIcon />} label="Table">{event.table?.label ?? "—"}</Fact>
            <Fact icon={<MapPinIcon />} label="Location">{event.table?.location ?? "—"}</Fact>
          </dl>
          {event.meetingId && <p className="tabular text-xs font-semibold text-muted-foreground">Meeting ID {event.meetingId.slice(0, 8).toUpperCase()}</p>}
          <Button variant="soft" className="w-full" nativeButton={false} render={<Link href={`/inbox/${event.threadId}`} />}>
            <MessagesSquareIcon /> Open negotiation history
          </Button>
          {c && "contact_email" in c && (
            <section aria-label="Company information" className="space-y-4 border-t border-border pt-6">
              <CompanyProfile company={c} headingLevel="h2" />
              <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={`/companies/${c.id}`} />}>
                Open full profile page <ArrowRightIcon />
              </Button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PendingBlock({ event, style }: { event: CalendarEvent; style: React.CSSProperties }) {
  const incoming = event.kind === "incoming"
  const name = event.counterpart?.name ?? "a company"
  return (
    <Link
      href={`/inbox/${event.threadId}`}
      style={style}
      aria-label={`Pending, not reserved: ${incoming ? `request from ${name} waiting for your reply` : `your offer to ${name}`}, ${event.dayLabel}, ${event.timeLabel}. Open negotiation.`}
      className="absolute z-20 flex flex-col justify-center overflow-hidden rounded-xl border-2 border-dashed border-pending/50 bg-pending-surface/90 px-2 py-1 text-pending transition-colors duration-150 hover:border-pending hover:bg-pending-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="truncate text-[11px] font-extrabold tracking-wide uppercase">{incoming ? "Pending · reply" : "Pending · sent"}</span>
      <span className="truncate text-[12px] leading-tight font-semibold">{event.counterpart?.name ?? "Unavailable company"}</span>
    </Link>
  )
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/70 px-3.5 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground [&>svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-bold">{children}</dd>
    </div>
  )
}
