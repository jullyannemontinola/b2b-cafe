import { CalendarCheckIcon } from "lucide-react"
import { formatDay, formatRange, tzLabel } from "@/lib/event"
import { cn } from "@/lib/utils"
import { TierBadge } from "@/components/tier-badge"

export const THREAD_DETAIL_COLUMNS =
  "id, status, current_version, last_activity_at, a_last_read_at, b_last_read_at, company_a_id, company_b_id, company_a:companies!threads_company_a_id_fkey(id, name, logo_url, tier), company_b:companies!threads_company_b_id_fkey(id, name, logo_url, tier), offers(id, version, proposer_company_id, starts_at, ends_at, message, created_at), meetings(id, offer_id, starts_at, ends_at, meeting_tables(label, location))"

type Offer = { id: string; version: number; proposer_company_id: string; starts_at: string; ends_at: string; message: string | null }

export function ConfirmedMeeting({
  meeting,
  tz,
}: {
  meeting: { id: string; starts_at: string; ends_at: string; meeting_tables: { label: string; location: string } | null }
  tz: string
}) {
  return (
    <div className="space-y-5 rounded-3xl bg-confirmed-surface p-5 sm:p-7">
      <div className="flex items-center gap-2.5 text-confirmed">
        <span className="flex size-9 items-center justify-center rounded-xl bg-card">
          <CalendarCheckIcon className="size-5" />
        </span>
        <h2 className="text-xl">Meeting confirmed</h2>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <Fact label="Date">{formatDay(meeting.starts_at, tz)}, 2026</Fact>
        <Fact label={`Time (${tzLabel(tz)})`}>
          <span className="tabular">{formatRange(meeting.starts_at, meeting.ends_at, tz)}</span>
        </Fact>
        <Fact label="Table">{meeting.meeting_tables?.label}</Fact>
        <Fact label="Location">{meeting.meeting_tables?.location}</Fact>
      </dl>
      <p className="tabular text-xs font-semibold text-confirmed">Meeting ID {meeting.id.slice(0, 8).toUpperCase()}</p>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-bold">{children}</dd>
    </div>
  )
}

export function OfferHistory({
  offers,
  currentVersion,
  threadStatus,
  acceptedOfferId,
  nameOf,
  tierOf,
  tz,
}: {
  offers: Offer[]
  currentVersion: number
  threadStatus: string
  acceptedOfferId: string | null
  nameOf: (companyId: string) => string
  tierOf?: (companyId: string) => string | null // badge next to named companies
  tz: string
}) {
  const sorted = [...offers].sort((x, y) => y.version - x.version)
  return (
    <ol>
      {sorted.map((o, i) => {
        const tag =
          acceptedOfferId === o.id
            ? "Accepted"
            : o.version === currentVersion
              ? threadStatus === "declined"
                ? "Declined"
                : "Current offer"
              : "Superseded"
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
                {tierOf?.(o.proposer_company_id) && <TierBadge tier={tierOf(o.proposer_company_id)} size="sm" />}
                <span className="text-muted-foreground">{o.version === 1 ? "proposed" : "countered"}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", i === 0 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground")}>
                  {tag}
                </span>
              </p>
              <p className={cn("tabular text-sm font-semibold", o.version !== currentVersion && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                {formatDay(o.starts_at, tz)}, {formatRange(o.starts_at, o.ends_at, tz)}
              </p>
              {o.message && <p className="rounded-xl bg-muted/70 px-3 py-2 text-sm whitespace-pre-line text-muted-foreground">{o.message}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
