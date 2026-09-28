import { CalendarCheckIcon } from "lucide-react"
import { formatDay, formatRange, tzLabel } from "@/lib/event"
import { cn } from "@/lib/utils"

export const THREAD_DETAIL_COLUMNS =
  "id, status, current_version, last_activity_at, a_last_read_at, b_last_read_at, company_a_id, company_b_id, company_a:companies!threads_company_a_id_fkey(id, name, logo_url, tier), company_b:companies!threads_company_b_id_fkey(id, name, logo_url, tier), offers(id, version, proposer_company_id, starts_at, ends_at, message, created_at), meetings(id, offer_id, starts_at, ends_at, meeting_tables(label, location), meeting_venue_changes(from_label, to_label, changed_at))"

type Offer = { id: string; version: number; proposer_company_id: string; starts_at: string; ends_at: string; message: string | null }

export function ConfirmedMeeting({
  meeting,
  tz,
}: {
  meeting: {
    id: string
    starts_at: string
    ends_at: string
    meeting_tables: { label: string; location: string } | null
    meeting_venue_changes?: { from_label: string; to_label: string; changed_at: string }[]
  }
  tz: string
}) {
  // Only changes participants could notice: the label they were shown.
  const change = (meeting.meeting_venue_changes ?? [])
    .filter((c) => c.from_label !== c.to_label)
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0]
  return (
    <div className="space-y-4 rounded-2xl border border-confirmed/20 bg-confirmed-surface p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl text-confirmed">
        <CalendarCheckIcon aria-hidden className="size-5" /> Meeting confirmed
      </h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fact label="Date">{formatDay(meeting.starts_at, tz)}, 2026</Fact>
        <Fact label={`Time (${tzLabel(tz)}, UTC+8)`}>
          <span className="tabular">{formatRange(meeting.starts_at, meeting.ends_at, tz)}</span>
        </Fact>
        <Fact label="Table">{meeting.meeting_tables?.label}</Fact>
        <Fact label="Location">{meeting.meeting_tables?.location}</Fact>
      </dl>
      {change && (
        <p role="status" className="rounded-lg bg-card px-3 py-2 text-sm font-semibold text-pending">
          Table changed by the organizers from {change.from_label} to {change.to_label} on {formatDay(change.changed_at, tz)}. The time is
          unchanged.
        </p>
      )}
      <p className="tabular text-xs font-semibold text-confirmed">Meeting ID {meeting.id.slice(0, 8).toUpperCase()}</p>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-confirmed/80">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-foreground">{children}</dd>
    </div>
  )
}

export function OfferHistory({
  offers,
  currentVersion,
  threadStatus,
  acceptedOfferId,
  nameOf,
  tz,
}: {
  offers: Offer[]
  currentVersion: number
  threadStatus: string
  acceptedOfferId: string | null
  nameOf: (companyId: string) => string
  tz: string
}) {
  const sorted = [...offers].sort((x, y) => y.version - x.version)
  return (
    <ol>
      {sorted.map((o, i) => {
        const tag =
          acceptedOfferId === o.id
            ? "Confirmed"
            : o.version === currentVersion
              ? threadStatus === "declined"
                ? "Declined"
                : "Latest"
              : "Replaced"
        return (
          <li key={o.id} className="relative flex gap-3.5 pb-6 last:pb-0">
            {i < sorted.length - 1 && <span aria-hidden className="absolute top-5 left-[9px] h-full w-0.5 rounded-full bg-border" />}
            <span
              aria-hidden
              className={cn("relative mt-1 size-5 shrink-0 rounded-full border-4", i === 0 ? "border-secondary bg-primary" : "border-muted bg-input")}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-bold">{nameOf(o.proposer_company_id)}</span>
                <span className="text-muted-foreground">{o.version === 1 ? "requested" : "suggested another time"}</span>
                <span className={cn("text-xs font-bold", i === 0 ? "text-primary" : "text-muted-foreground")}>· {tag}</span>
              </p>
              <p className={cn("tabular text-sm font-semibold", o.version !== currentVersion && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                {formatDay(o.starts_at, tz)}, {formatRange(o.starts_at, o.ends_at, tz)}
              </p>
              {o.message && <p className="border-l-2 border-border pl-3 text-sm whitespace-pre-line text-muted-foreground">{o.message}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
