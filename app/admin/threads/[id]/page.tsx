import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, EyeIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { ConfirmedMeeting, OfferHistory, THREAD_DETAIL_COLUMNS } from "@/components/thread-parts"
import { formatDay, formatRange, getEventConfig, tzLabel } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Negotiation" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Monitoring only: organizers can read the whole history but have no actions,
// and the booking functions reject them anyway.
export default async function AdminThreadPage({ params }: PageProps<"/admin/threads/[id]">) {
  await requireAdmin()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const config = await getEventConfig()
  const tz = config.timezone
  const supabase = await createClient()
  const { data: t } = await supabase.from("threads").select(THREAD_DETAIL_COLUMNS).eq("id", id).maybeSingle()
  if (!t) notFound()

  const nameOf = (companyId: string) => (companyId === t.company_a_id ? t.company_a?.name : t.company_b?.name) ?? "Company"
  const latest = [...t.offers].sort((x, y) => y.version - x.version)[0]
  const waitingOn = latest.proposer_company_id === t.company_a_id ? t.company_b?.name : t.company_a?.name

  return (
    <div className="space-y-6">
      <Link href="/admin/meetings?view=negotiations" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Negotiations
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <div className="flex -space-x-3">
          {[t.company_a, t.company_b].map((c, i) => (
            <CompanyLogo key={i} name={c?.name ?? "?"} logoUrl={c?.logo_url ?? null} className="size-12 ring-4 ring-background" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl leading-tight">
            <span className="inline-flex items-center gap-2">
              <Link href={`/admin/companies/${t.company_a_id}`} className="hover:underline">{t.company_a?.name}</Link>
              <TierBadge tier={t.company_a?.tier} size="sm" />
            </span>
            <span className="text-muted-foreground">and</span>
            <span className="inline-flex items-center gap-2">
              <Link href={`/admin/companies/${t.company_b_id}`} className="hover:underline">{t.company_b?.name}</Link>
              <TierBadge tier={t.company_b?.tier} size="sm" />
            </span>
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <EyeIcon className="size-4" /> Organizer view, read-only
          </p>
        </div>
        <StatusBadge status={t.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {t.status === "confirmed" && t.meetings ? (
          <ConfirmedMeeting meeting={t.meetings} tz={tz} />
        ) : (
          <section className="panel space-y-2 p-5 sm:p-7">
            <p className="text-sm font-semibold text-muted-foreground">
              {t.status === "declined" ? "Declined offer" : `Latest offer, waiting on ${waitingOn}`}
            </p>
            <p className="tabular text-2xl font-extrabold tracking-tight">
              {formatDay(latest.starts_at, tz)} · {formatRange(latest.starts_at, latest.ends_at, tz)}
            </p>
            <p className="text-sm text-muted-foreground">{tzLabel(tz)}. Pending offers don’t reserve a table.</p>
          </section>
        )}
        <section aria-labelledby="history" className="panel space-y-4 p-5 sm:p-6">
          <h2 id="history" className="text-lg">History</h2>
          <OfferHistory
            offers={t.offers}
            currentVersion={t.current_version}
            threadStatus={t.status}
            acceptedOfferId={t.meetings?.offer_id ?? null}
            nameOf={nameOf}
            tierOf={(id) => (id === t.company_a_id ? t.company_a?.tier : t.company_b?.tier) ?? null}
            tz={tz}
          />
        </section>
      </div>
    </div>
  )
}
