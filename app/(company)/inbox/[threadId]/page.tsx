import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ClockIcon, PanelRightOpenIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { CompanyDetailsSheet } from "@/components/company-sheet"
import { HelpButton } from "@/components/help"
import { StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { ConfirmedMeeting, OfferHistory, THREAD_DETAIL_COLUMNS } from "@/components/thread-parts"
import { getSlotDays } from "@/lib/availability"
import { NAV, requestStatus, venueLine } from "@/lib/copy"
import { formatDay, formatRange, getEventConfig, tzLabel } from "@/lib/event"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { isUnread } from "@/lib/threads"
import { MarkRead, OfferActions } from "./offer-actions"

export const metadata: Metadata = { title: "Meeting request" }

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
  // Same participant-visible profile the directory shows.
  const { data: profile } = await supabase.from("companies").select(PROFILE_COLUMNS).eq("id", counterpartId).maybeSingle()
  const counterpartName = profile?.name ?? "the other organization"
  const nameOf = (id: string) => (id === me ? "You" : counterpartName)
  const latest = [...t.offers].sort((x, y) => y.version - x.version)[0]
  const meeting = t.meetings
  const myTurn = t.status === "pending" && latest.proposer_company_id !== me
  const tz = config.timezone
  const offerLabel = `${formatDay(latest.starts_at, tz)}, ${formatRange(latest.starts_at, latest.ends_at, tz)}`
  const slotData = myTurn && profile ? await getSlotDays(profile.id, t.id) : null

  const revised = latest.version > 1
  const fromMe = latest.proposer_company_id === me
  const { data: mine } = await supabase.from("companies").select("tier").eq("id", me).single()
  const firstFromMe = t.offers.find((o) => o.version === 1)?.proposer_company_id === me
  const status = requestStatus({
    status: t.status,
    waitingOn: t.status === "pending" && !myTurn ? counterpartName : null,
    revised,
  })

  return (
    <div className="space-y-5">
      <MarkRead threadId={t.id} unread={isUnread(t, me)} />
      <Link href="/inbox" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {NAV.requests}
      </Link>

      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <CompanyLogo id={profile?.id} name={counterpartName} logoUrl={profile?.logo_url ?? null} className="size-14" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="text-2xl leading-tight">{profile?.name ?? "Unavailable organization"}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {profile && <TierBadge tier={profile.tier} size="sm" />}
            {profile && <span className="text-sm text-muted-foreground">{profile.business_type}</span>}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <StatusBadge status={status.tone} label={status.label} />
          {profile && (
            <CompanyDetailsSheet
              company={profile}
              profileHref={`/companies/${profile.id}`}
              trigger={
                <Button variant="outline" size="sm" className="rounded-full">
                  <PanelRightOpenIcon /> Organization details
                </Button>
              }
            />
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-label={t.status === "confirmed" ? "Confirmed meeting" : "Latest proposed time"} className="space-y-6">
          {t.status === "confirmed" && meeting ? (
            <ConfirmedMeeting meeting={meeting} tz={tz} />
          ) : (
            <div className="panel space-y-5 p-5 sm:p-7">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground">
                  {t.status === "declined"
                    ? "Declined time"
                    : revised
                      ? `Alternative time from ${fromMe ? "you" : counterpartName}`
                      : `Requested by ${fromMe ? "you" : counterpartName}`}
                </p>
                <p className="tabular text-2xl font-extrabold tracking-tight sm:text-[28px]">
                  {formatDay(latest.starts_at, tz)} · {formatRange(latest.starts_at, latest.ends_at, tz)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {tzLabel(tz)} (UTC+8) · 30 minutes{t.status === "pending" && " · Not reserved until confirmed"}
                </p>
                {t.status === "pending" && profile && (
                  <p className="text-sm text-muted-foreground">{venueLine(mine?.tier, profile, firstFromMe)}</p>
                )}
              </div>
              {latest.message && <p className="border-l-2 border-primary/30 pl-4 whitespace-pre-line">{latest.message}</p>}

              {t.status === "declined" ? (
                <p className="text-sm text-muted-foreground">
                  {fromMe ? `${counterpartName} declined this request.` : "You declined this request."} This meeting request is closed.
                </p>
              ) : myTurn && slotData ? (
                <div className="space-y-4 border-t border-border pt-5">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-lg">Your response needed</h2>
                    <HelpButton title={revised ? "Responding to an alternative time" : "Responding to a request"} more="/help?topic=responding">
                      {revised && <p>{counterpartName} suggested this time instead of the earlier one.</p>}
                      <p>
                        <strong className="text-foreground">Confirm meeting</strong> books this time and assigns a table.
                      </p>
                      <p>
                        <strong className="text-foreground">Suggest another time</strong> sends a different time. {counterpartName} will need to
                        confirm it.
                      </p>
                      <p>
                        <strong className="text-foreground">Decline request</strong> closes this request. Neither of you can send the other a new one.
                      </p>
                    </HelpButton>
                  </div>
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
                  Awaiting {counterpartName}. They can confirm this time, suggest another time or decline.
                </p>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="history" className="panel space-y-4 p-5 sm:p-6">
          <h2 id="history" className="text-lg">History</h2>
          <OfferHistory
            offers={t.offers}
            currentVersion={t.current_version}
            threadStatus={t.status}
            acceptedOfferId={meeting?.offer_id ?? null}
            nameOf={nameOf}
            tz={tz}
          />
        </section>
      </div>
    </div>
  )
}
