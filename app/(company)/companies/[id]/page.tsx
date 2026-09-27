import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ArrowRightIcon, MessagesSquareIcon } from "lucide-react"
import { CompanyProfile } from "@/components/company-profile"
import { SlotPicker } from "@/components/slot-picker"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { getSlotDays } from "@/lib/availability"
import { createClient, requireCompany } from "@/lib/supabase/server"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_COLUMNS =
  "id, name, business_type, tier, logo_url, description, products_services, partnership_interests, website, contact_name, contact_email, contact_phone"

export async function generateMetadata({ params }: PageProps<"/companies/[id]">): Promise<Metadata> {
  const { id } = await params
  if (!UUID.test(id)) return {}
  const supabase = await createClient()
  const { data } = await supabase.from("companies").select("name").eq("id", id).maybeSingle()
  return { title: data?.name ?? "Company" }
}

export default async function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const viewer = await requireCompany()
  const supabase = await createClient()

  const { data: company } = await supabase.from("companies").select(PROFILE_COLUMNS).eq("id", id).eq("is_active", true).maybeSingle()
  if (!company) notFound()

  const isSelf = company.id === viewer.companyId
  const [a, b] = [viewer.companyId, company.id].sort()
  const { data: thread } = isSelf
    ? { data: null }
    : await supabase.from("threads").select("id, status").eq("company_a_id", a).eq("company_b_id", b).maybeSingle()
  const slotData = !isSelf && !thread ? await getSlotDays(company.id) : null

  return (
    <div className="space-y-6">
      <Link href="/companies" className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Directory
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="panel p-5 sm:p-7 lg:sticky lg:top-24">
          <CompanyProfile company={company} />
        </section>

        <section id="propose" aria-labelledby="meet-heading" className="panel scroll-mt-28 p-5 sm:p-7">
          {isSelf ? (
            <div className="space-y-2">
              <h2 id="meet-heading" className="text-xl">This is your company</h2>
              <p className="text-muted-foreground">
                This is how other companies see your profile. To change it, contact the B2B Café organizers.
              </p>
            </div>
          ) : thread ? (
            <div className="flex flex-col items-start gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <MessagesSquareIcon className="size-5" />
              </span>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 id="meet-heading" className="text-xl">You’re already in touch</h2>
                  <StatusBadge status={thread.status} />
                </div>
                <p className="text-muted-foreground">
                  Each pair of companies has one negotiation. Open it to see the latest offer and respond.
                </p>
              </div>
              <Button size="lg" nativeButton={false} render={<Link href={`/inbox/${thread.id}`} />}>
                View negotiation <ArrowRightIcon />
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 id="meet-heading" className="text-xl">Propose a meeting</h2>
                <p className="text-muted-foreground">
                  Pick a time. {company.name} can accept, decline, or suggest another time.
                </p>
              </div>
              <SlotPicker days={slotData!.days} timezoneLabel={slotData!.timezoneLabel} mode={{ kind: "propose", targetCompanyId: company.id }} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
