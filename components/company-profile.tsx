import { GlobeIcon, MailIcon, PhoneIcon, UserRoundIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { TierBadge } from "@/components/tier-badge"

export type CompanyProfileData = {
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

// The participant-visible profile. Also used as the organizer's preview.
export function CompanyProfile({ company, headingLevel = "h1" }: { company: CompanyProfileData; headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel
  const sections = [
    ["About", company.description],
    ["Products and services", company.products_services],
    ["Looking to discuss", company.partnership_interests],
  ].filter((s): s is [string, string] => Boolean(s[1]))

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-18 rounded-[20px] text-xl" />
        <div className="min-w-0 space-y-2 pt-1">
          <Heading className="text-2xl leading-tight sm:text-[28px]">{company.name}</Heading>
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={company.tier} />
            <span className="inline-flex h-7 items-center rounded-full border border-border px-3 text-xs font-bold text-muted-foreground">
              {company.business_type}
            </span>
          </div>
        </div>
      </div>

      {sections.map(([title, body]) => (
        <section key={title} className="space-y-1.5">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="max-w-prose text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">{body}</p>
        </section>
      ))}

      <dl className="grid gap-2 rounded-2xl bg-muted/70 p-2 text-sm">
        <ContactRow icon={<UserRoundIcon />} label="Contact">{company.contact_name}</ContactRow>
        <ContactRow icon={<MailIcon />} label="Email">
          <a href={`mailto:${company.contact_email}`} className="break-all underline-offset-4 hover:text-primary hover:underline">
            {company.contact_email}
          </a>
        </ContactRow>
        {company.contact_phone && (
          <ContactRow icon={<PhoneIcon />} label="Phone">
            <span className="tabular">{company.contact_phone}</span>
          </ContactRow>
        )}
        {company.website && (
          <ContactRow icon={<GlobeIcon />} label="Website">
            <a href={company.website} target="_blank" rel="noreferrer" className="break-all underline-offset-4 hover:text-primary hover:underline">
              {company.website.replace(/^https?:\/\//, "")}
            </a>
          </ContactRow>
        )}
      </dl>
    </div>
  )
}

function ContactRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary [&>svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  )
}
