import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ClockIcon, ReplyIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { CounterpartSummary } from "@/components/company-sheet"
import { StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { ConfirmedMeeting, OfferHistory, THREAD_DETAIL_COLUMNS } from "@/components/thread-parts"
import { getSlotDays } from "@/lib/availability"
import { formatDay, formatRange, getEventConfig, tzLabel } from "@/lib/event"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { isUnread } from "@/lib/threads"
import { MarkRead, OfferActions } from "./offer-actions"

export const metadata: Metadata = { title: "Negotiation" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_COLUMNS =
  "id, name, business_type, tier, logo_url, description, products_services, partnership_interests, website, contact_name, contact_email, contact_phone"

export default async function ThreadPage({ params }: PageProps<"/inbox/[threadId]">) {
  const { threadId } = await params
  if (!UUID.test(threadId)) notFound()
  const viewer = await requireCompany()
  const config = await getEventConfig()
  const supabase = await createClient()

  // RLS returns the thread only to its two companies.
  const { data: t } = await supabase.from("threads").select(THREAD_DETAIL_COLUMNS).eq("id", threadId).maybeSingle()
  if (!t || (viewer.companyId !== t.company_a_id && viewer.companyId !== t.company_b_id)) notFound()

  const me = viewer.companyId
  const counterpartId = t.company_a_id === me ? t.company_b_id : t.company_a_id
  // Same participant-visible profile the directory shows; RLS hides inactive companies.
  const { data: profile } = await supabase.from("companies").select(PROFILE_COLUMNS).eq("id", counterpartId).maybeSingle()
  const counterpartName = profile?.name ?? "the other company"
  const nameOf = (id: string) => (id === me ? "You" : counterpartName)
  const tierOf = (id: string) => (id === me ? null : (profile?.tier ?? null))
  const latest = [...t.offers].sort((x, y) => y.version - x.version)[0]
  const meeting = t.meetings
  const myTurn = t.status === "pending" && latest.proposer_company_id !== me
  const tz = config.timezone
  const offerLabel = `${formatDay(latest.starts_at, tz)}, ${formatRange(latest.starts_at, latest.ends_at, tz)}`
  const slotData = myTurn && profile ? await getSlotDays(profile.id) : null

  return (
    <div className="space-y-6">
      <MarkRead threadId={t.id} unread={isUnread(t, me)} />
      <Link href="/inbox" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Inbox
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <CompanyLogo name={counterpartName} logoUrl={profile?.logo_url ?? null} className="size-14" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl leading-tight sm:text-[28px]">
            {profile ? (
              <Link href={`/companies/${profile.id}`} className="underline-offset-4 hover:underline">
                {profile.name}
              </Link>
            ) : (
              "Unavailable company"
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {profile && <TierBadge tier={profile.tier} size="sm" />}
            <span className="text-sm text-muted-foreground">Meeting negotiation</span>
          </div>
        </div>
        <StatusBadge status={t.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-label={t.status === "confirmed" ? "Confirmed meeting" : "Current offer"} className="space-y-6">
          {t.status === "confirmed" && meeting ? (
            <ConfirmedMeeting meeting={meeting} tz={tz} />
          ) : (
            <div className="panel space-y-5 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
                  {t.status === "declined" ? "Declined offer" : `Current offer · version ${latest.version}`}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  from {latest.proposer_company_id === me ? "you" : counterpartName}
                </span>
              </div>
              <div className="space-y-1">
                <p className="tabular text-2xl font-extrabold tracking-tight sm:text-[28px]">
                  {formatDay(latest.starts_at, tz)} · {formatRange(latest.starts_at, latest.ends_at, tz)}
                </p>
                <p className="text-sm text-muted-foreground">{tzLabel(tz)} · 30 minutes</p>
              </div>
              {latest.message && <p className="rounded-2xl bg-muted/70 px-4 py-3 whitespace-pre-line">{latest.message}</p>}

              {t.status === "declined" ? (
                <p className="text-sm text-muted-foreground">
                  {latest.proposer_company_id === me ? `${counterpartName} declined this offer.` : "You declined this offer."} This negotiation is closed.
                </p>
              ) : myTurn && slotData ? (
                <div className="space-y-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-primary">
                    <ReplyIcon className="size-4" /> Your turn to respond
                  </p>
                  <OfferActions
                    threadId={t.id}
                    version={latest.version}
                    counterpartName={counterpartName}
                    offerLabel={offerLabel}
                    days={slotData.days}
                    timezoneLabel={slotData.timezoneLabel}
                  />
                </div>
              ) : (
                <p className="flex items-start gap-2.5 rounded-2xl bg-pending-surface px-4 py-3 text-sm font-medium text-pending">
                  <ClockIcon className="mt-0.5 size-4 shrink-0" />
                  Waiting for {counterpartName} to accept, decline, or suggest another time. This slot isn’t reserved until they accept.
                </p>
              )}
            </div>
          )}
        </section>

        <div className="space-y-6">
          {profile && <CounterpartSummary company={profile} profileHref={`/companies/${profile.id}`} />}
          <section aria-labelledby="history" className="panel space-y-4 p-5 sm:p-6">
            <h2 id="history" className="text-lg">History</h2>
            <OfferHistory
              offers={t.offers}
              currentVersion={t.current_version}
              threadStatus={t.status}
              acceptedOfferId={meeting?.offer_id ?? null}
              nameOf={nameOf}
              tierOf={tierOf}
              tz={tz}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
