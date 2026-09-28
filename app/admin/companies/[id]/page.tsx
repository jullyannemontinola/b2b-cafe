import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon } from "lucide-react"
import { updateCompany } from "@/app/admin/actions"
import { CompanyProfile } from "@/components/company-profile"
import { HelpButton } from "@/components/help"
import { AccountBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { NAV } from "@/lib/copy"
import { formatDay, formatRange, getEventConfig } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"
import { CompanyForm } from "../company-form"
import { SetupButton } from "./company-controls"

export const metadata: Metadata = { title: "Participant" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const accountCopy = {
  pending: ["Setup incomplete", "The participant is recorded but its login wasn’t created. Retry to create it and send the setup email."],
  account_created: ["Setup email not sent", "The login exists but no setup email has gone out. Send it now."],
  invite_sent: ["Invitation sent", "The email provider accepted the setup email. The account becomes active once the contact sets a password."],
  invite_failed: ["Invitation failed", "The setup email wasn’t accepted. Check the error below, then retry."],
  active: ["Account active", "The contact set a password and can sign in."],
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
      "id, name, business_type, tier, logo_url, description, products_services, partnership_interests, website, contact_name, contact_email, contact_phone, created_at, company_accounts(login_email, status, invite_sent_at, activated_at, last_error)",
    )
    .eq("id", id)
    .maybeSingle()
  if (!company) notFound()

  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, starts_at, ends_at, thread_id, meeting_tables(label), threads!inner(company_a_id, company_b_id, company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier))")
    .or(`company_a_id.eq.${id},company_b_id.eq.${id}`, { referencedTable: "threads" })
    .order("starts_at")

  const account = company.company_accounts
  const status = account?.status ?? "pending"
  const [accountTitle, accountHelp] = accountCopy[status]
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : null)

  return (
    <div className="space-y-6">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {NAV.participants}
      </Link>

      {registered && (
        <div
          role="status"
          className={
            status === "invite_sent"
              ? "flex items-start gap-3 rounded-2xl bg-confirmed-surface p-4 text-confirmed"
              : "flex items-start gap-3 rounded-2xl bg-pending-surface p-4 text-pending"
          }
        >
          {status === "invite_sent" ? <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" /> : <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />}
          <p className="text-sm font-semibold">
            {status === "invite_sent"
              ? `${company.name} added. Setup email sent to ${account?.login_email}.`
              : `${company.name} added, but account setup isn’t finished: ${account?.last_error ?? accountTitle}. Use Retry account setup below.`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl leading-tight">{company.name}</h1>
        <AccountBadge status={status} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <section aria-labelledby="account" className="panel space-y-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="account" className="text-lg">
                  Account · {accountTitle}
                </h2>
                <p className="text-sm text-muted-foreground">{accountHelp}</p>
              </div>
              <HelpButton title="Account setup and invitations" more="/admin/help?topic=setup">
                <p>Setup links work once and expire after 24 hours. Resend the setup email if the contact’s link expired or never arrived.</p>
                <p>If setup failed, the error is shown here. Retrying never creates a duplicate login.</p>
              </HelpButton>
            </div>
            <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
              <Meta label="Login email">{account?.login_email ?? "—"}</Meta>
              <Meta label="Setup email sent">{fmt(account?.invite_sent_at ?? null) ?? "—"}</Meta>
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

          <section aria-labelledby="edit" className="space-y-3">
            <h2 id="edit" className="text-lg">Edit organization details</h2>
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
              <ul className="divide-y divide-border">
                {meetings.map((m) => {
                  const other = m.threads.company_a_id === id ? m.threads.company_b : m.threads.company_a
                  return (
                    <li key={m.id}>
                      <Link href={`/admin/threads/${m.thread_id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
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
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold break-all">{children}</dd>
    </div>
  )
}
