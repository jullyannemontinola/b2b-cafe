import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { CompanyDetails, CompanyIdentity } from "@/components/company-profile"
import { HelpButton } from "@/components/help"
import { SlotPicker } from "@/components/slot-picker"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { getSlotDays } from "@/lib/availability"
import { NAV, requestStatus, venueLine } from "@/lib/copy"
import { createClient, requireCompany } from "@/lib/supabase/server"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_COLUMNS =
  "id, name, business_type, tier, logo_url, description, products_services, partnership_interests, website, contact_name, contact_email, contact_phone"

export async function generateMetadata({ params }: PageProps<"/companies/[id]">): Promise<Metadata> {
  const { id } = await params
  if (!UUID.test(id)) return {}
  const supabase = await createClient()
  const { data } = await supabase.from("companies").select("name").eq("id", id).maybeSingle()
  return { title: data?.name ?? "Organization details" }
}

export default async function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const viewer = await requireCompany()
  const supabase = await createClient()

  const { data: company } = await supabase.from("companies").select(PROFILE_COLUMNS).eq("id", id).maybeSingle()
  if (!company) notFound()

  const isSelf = company.id === viewer.companyId
  const [a, b] = [viewer.companyId, company.id].sort()
  const { data: thread } = isSelf
    ? { data: null }
    : await supabase.from("threads").select("id, status, current_version, offers(version, proposer_company_id)").eq("company_a_id", a).eq("company_b_id", b).maybeSingle()
  const slotData = !isSelf && !thread ? await getSlotDays(company.id) : null
  // Where a new request would meet (same rule as the database): a Premium
  // organization's dedicated table, the recipient's if both are Premium.
  const { data: me } = await supabase.from("companies").select("tier").eq("id", viewer.companyId).single()
  const venue = venueLine(me?.tier, company, true)

  const latest = thread?.offers.find((o) => o.version === thread.current_version)
  const status = thread
    ? requestStatus({
        status: thread.status,
        waitingOn: latest?.proposer_company_id === viewer.companyId ? company.name : null,
        revised: thread.current_version > 1,
      })
    : null

  return (
    <div className="space-y-5">
      <Link href="/companies" className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {NAV.participants}
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label={`${company.name} details`} className="panel space-y-6 p-5 sm:p-7 lg:sticky lg:top-24">
          <CompanyIdentity company={company}>
            {status && <StatusBadge status={status.tone} label={status.label} />}
          </CompanyIdentity>
          {!isSelf && (
            <Button
              className="w-full lg:hidden"
              variant={thread ? "soft" : "default"}
              nativeButton={false}
              render={<Link href={thread ? `/inbox/${thread.id}` : "#request"} />}
            >
              {thread ? (
                <>
                  Open meeting request <ArrowRightIcon />
                </>
              ) : (
                <>
                  Request a meeting <ArrowDownIcon />
                </>
              )}
            </Button>
          )}
          <CompanyDetails company={company} />
        </section>

        <section id="request" aria-labelledby="meet-heading" className="panel scroll-mt-28 p-5 sm:p-7">
          {isSelf ? (
            <div className="space-y-2">
              <h2 id="meet-heading" className="text-xl">This is your organization</h2>
              <p className="text-muted-foreground">
                Other participants see these details. If anything is incorrect, contact the B2B Café organizers.
              </p>
            </div>
          ) : thread ? (
            <div className="flex flex-col items-start gap-4">
              <div className="space-y-1.5">
                <h2 id="meet-heading" className="text-xl">
                  You already have a meeting request with {company.name}
                </h2>
                <p className="text-muted-foreground">Each pair of organizations has one meeting request. Open it to see the latest time and respond.</p>
              </div>
              <Button size="lg" nativeButton={false} render={<Link href={`/inbox/${thread.id}`} />}>
                Open meeting request <ArrowRightIcon />
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="meet-heading" className="text-xl">Request a meeting</h2>
                <HelpButton title="Requesting a meeting" more="/help?topic=requesting">
                  <p>Sending a request does not reserve this time. The meeting is confirmed after {company.name} accepts and a table is assigned.</p>
                  <p>{company.name} can also suggest another time or decline.</p>
                  <p>
                    Meetings with a Premium organization use its dedicated table. When both are Premium, the organization receiving the request
                    hosts.
                  </p>
                </HelpButton>
              </div>
              <p className="-mt-3 text-sm text-muted-foreground">{venue}</p>
              <SlotPicker
                days={slotData!.days}
                timezoneLabel={slotData!.timezoneLabel}
                counterpartName={company.name}
                mode={{ kind: "propose", targetCompanyId: company.id }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
