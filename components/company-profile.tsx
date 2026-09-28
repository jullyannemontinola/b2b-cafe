import { CompanyLogo } from "@/components/company-logo"
import { TierBadge } from "@/components/tier-badge"

export type CompanyProfileData = {
  id?: string
  name: string
  business_type: string
  tier: string | null
  logo_url: string | null
  description: string | null
  products_services: string | null
  partnership_interests: string | null
  website: string | null
  contact_name: string
  contact_email: string
  contact_phone: string | null
}

// The participant-visible profile. Also used as the organizer's preview and in
// the Organization details sheet.
export function CompanyProfile({ company, headingLevel = "h1" }: { company: CompanyProfileData; headingLevel?: "h1" | "h2" }) {
  return (
    <div className="space-y-6">
      <CompanyIdentity company={company} headingLevel={headingLevel} />
      <CompanyDetails company={company} />
    </div>
  )
}

export function CompanyIdentity({
  company,
  headingLevel = "h1",
  children,
}: {
  company: Pick<CompanyProfileData, "id" | "name" | "logo_url" | "tier" | "business_type">
  headingLevel?: "h1" | "h2"
  children?: React.ReactNode
}) {
  const Heading = headingLevel
  return (
    <div className="flex items-start gap-4">
      <CompanyLogo id={company.id} name={company.name} logoUrl={company.logo_url} className="size-16 rounded-2xl text-lg" />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <Heading className="text-2xl leading-tight break-words">{company.name}</Heading>
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={company.tier} />
          <span className="text-sm text-muted-foreground">{company.business_type}</span>
          {children}
        </div>
      </div>
    </div>
  )
}

export function CompanyDetails({ company }: { company: CompanyProfileData }) {
  const sections = [
    ["About", company.description],
    ["Products and services", company.products_services],
    ["Looking to discuss", company.partnership_interests],
  ].filter((s): s is [string, string] => Boolean(s[1]))

  return (
    <div className="space-y-6">
      {sections.map(([title, body]) => (
        <section key={title} className="space-y-1.5">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">{body}</p>
        </section>
      ))}

      <dl className="divide-y divide-border border-y border-border text-sm">
        <ContactRow label="Contact person">{company.contact_name}</ContactRow>
        <ContactRow label="Email">
          <a href={`mailto:${company.contact_email}`} className="break-all text-primary underline-offset-4 hover:underline">
            {company.contact_email}
          </a>
        </ContactRow>
        {company.contact_phone && (
          <ContactRow label="Phone">
            <span className="tabular">{company.contact_phone}</span>
          </ContactRow>
        )}
        {company.website && (
          <ContactRow label="Website">
            <a href={company.website} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">
              {company.website.replace(/^https?:\/\//, "")}
            </a>
          </ContactRow>
        )}
      </dl>
    </div>
  )
}

function ContactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  )
}
