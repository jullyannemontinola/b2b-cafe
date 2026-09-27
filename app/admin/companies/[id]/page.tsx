import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, MailCheckIcon } from "lucide-react"
import { updateCompany } from "@/app/admin/actions"
import { CompanyProfile } from "@/components/company-profile"
import { AccountBadge, StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { formatDay, formatRange, getEventConfig, isPast } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"
import { CompanyForm } from "../company-form"
import { ParticipationToggle, SetupButton } from "./company-controls"

export const metadata: Metadata = { title: "Company" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const accountCopy = {
  pending: ["No login yet", "The company is recorded but its login hasn’t been created. Retry to create it and send the setup email."],
  account_created: ["Login created, email not sent", "The login exists but no setup email has gone out yet. Send it now."],
  invite_sent: ["Waiting for the company", "The email provider accepted the setup email. The account becomes active once they set a password."],
  invite_failed: ["Setup email failed", "The login exists but the setup email wasn’t accepted. Check the error, then retry."],
  active: ["Account active", "The company set its password and can sign in."],
} as const

export default async function AdminCompanyPage({ params, searchParams }: PageProps<"/admin/companies/[id]">) {
  await requireAdmin()
  const { id } = await params
  const { registered } = await searchParams
  if (!UUID.test(id)) notFound()
  const config = await getEventConfig()
  const tz = config.timezone
  const supabase = await createClient()

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, business_type, tier, logo_url, description, products_services, partnership_interests, website, contact_name, contact_email, contact_phone, is_active, created_at, company_accounts(login_email, status, invite_sent_at, activated_at, last_error)",
    )
    .eq("id", id)
    .maybeSingle()
  if (!company) notFound()

  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, starts_at, ends_at, thread_id, meeting_tables(label), threads!inner(company_a_id, company_b_id, company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier))")
    .or(`company_a_id.eq.${id},company_b_id.eq.${id}`, { referencedTable: "threads" })
    .order("starts_at")
  const upcoming = (meetings ?? []).filter((m) => !isPast(m.ends_at))

  const account = company.company_accounts
  const status = account?.status ?? "pending"
  const [accountTitle, accountHelp] = accountCopy[status]
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : null)

  return (
    <div className="space-y-6">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Companies
      </Link>

      {registered && (
        <div
          role="status"
          className={
            status === "invite_sent"
              ? "flex items-start gap-3 rounded-3xl bg-confirmed-surface p-4 text-confirmed sm:p-5"
              : "flex items-start gap-3 rounded-3xl bg-pending-surface p-4 text-pending sm:p-5"
          }
        >
          {status === "invite_sent" ? <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" /> : <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />}
          <p className="text-sm font-semibold">
            {status === "invite_sent"
              ? `${company.name} is registered and the setup email to ${account?.login_email} was accepted for delivery.`
              : `${company.name} is registered, but account setup isn’t finished: ${account?.last_error ?? accountTitle}. Use the retry button below.`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-[28px] leading-tight">{company.name}</h1>
        <StatusBadge status={company.is_active ? "active" : "inactive"} label={company.is_active ? "Participating" : "Inactive"} />
        <AccountBadge status={status} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <section aria-labelledby="account" className="panel space-y-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                <MailCheckIcon className="size-5" />
              </span>
              <div>
                <h2 id="account" className="text-lg">
                  Platform account · {accountTitle}
                </h2>
                <p className="text-sm text-muted-foreground">{accountHelp}</p>
              </div>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <Meta label="Login email">{account?.login_email ?? "—"}</Meta>
              <Meta label="Setup email accepted">{fmt(account?.invite_sent_at ?? null) ?? "—"}</Meta>
              <Meta label="Activated">{fmt(account?.activated_at ?? null) ?? "—"}</Meta>
            </dl>
            {account?.last_error && status !== "active" && (
              <p role="alert" className="rounded-2xl bg-destructive-surface px-4 py-3 text-sm text-destructive">
                {account.last_error}
              </p>
            )}
            {status !== "active" && (
              <SetupButton companyId={company.id} label={status === "invite_sent" ? "Resend setup email" : "Retry account setup"} />
            )}
          </section>

          <section aria-labelledby="participation" className="panel space-y-3 p-5 sm:p-6">
            <h2 id="participation" className="text-lg">Participation</h2>
            <p className="text-sm text-muted-foreground">
              {company.is_active
                ? "Approved and participating: listed in the directory and able to schedule."
                : "Inactive: hidden from the directory and blocked from scheduling. Existing meetings are kept."}{" "}
              This is separate from account setup.
            </p>
            <ParticipationToggle companyId={company.id} companyName={company.name} active={company.is_active} upcomingMeetings={upcoming.length} />
          </section>

          <section aria-labelledby="edit" className="space-y-3">
            <h2 id="edit" className="text-lg">Edit profile</h2>
            <CompanyForm
              mode="edit"
              action={updateCompany.bind(null, company.id)}
              initialLogoUrl={company.logo_url}
              loginEmail={account?.login_email}
              initial={{
                name: company.name,
                business_type: company.business_type,
                tier: company.tier,
                website: company.website ?? "",
                description: company.description ?? "",
                products_services: company.products_services ?? "",
                partnership_interests: company.partnership_interests ?? "",
                contact_name: company.contact_name,
                contact_email: company.contact_email,
                contact_phone: company.contact_phone ?? "",
              }}
            />
          </section>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          <section aria-labelledby="preview" className="panel space-y-4 p-5 sm:p-6">
            <h2 id="preview" className="text-sm font-bold text-muted-foreground">
              What participants see
            </h2>
            <CompanyProfile company={company} headingLevel="h2" />
          </section>

          <section aria-labelledby="company-meetings" className="panel space-y-3 p-5 sm:p-6">
            <h2 id="company-meetings" className="text-lg">
              Meetings <span className="tabular text-sm font-semibold text-muted-foreground">({meetings?.length ?? 0})</span>
            </h2>
            {!meetings?.length ? (
              <p className="text-sm text-muted-foreground">No confirmed meetings.</p>
            ) : (
              <ul className="space-y-2">
                {meetings.map((m) => {
                  const other = m.threads.company_a_id === id ? m.threads.company_b : m.threads.company_a
                  return (
                    <li key={m.id}>
                      <Link href={`/admin/threads/${m.thread_id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/70 px-3.5 py-2.5 text-sm hover:bg-secondary">
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-bold">{other?.name}</span><TierBadge tier={other?.tier} size="sm" /></span>
                          <span className="tabular block text-muted-foreground">
                            {formatDay(m.starts_at, tz)}, {formatRange(m.starts_at, m.ends_at, tz)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold">{m.meeting_tables?.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/70 px-3.5 py-2.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold break-all">{children}</dd>
    </div>
  )
}
