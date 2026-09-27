"use client"

import Link from "next/link"
import { ArrowUpRightIcon, PanelRightOpenIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { CompanyProfile, type CompanyProfileData } from "@/components/company-profile"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export type CounterpartData = CompanyProfileData & { id: string }

// Full company details in a side sheet (full-width on phones). It opens over
// the current page, so drafts and selected times underneath are untouched.
export function CompanyDetailsSheet({
  company,
  profileHref,
  trigger,
}: {
  company: CounterpartData
  profileHref?: string
  trigger: React.ReactElement
}) {
  return (
    <Sheet>
      <SheetTrigger render={trigger} />
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto rounded-l-[28px] border-border p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 pt-6 pb-4">
          <SheetTitle className="text-sm font-bold text-muted-foreground">Company details</SheetTitle>
          <SheetDescription className="sr-only">Profile of {company.name}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-6 py-6">
          <CompanyProfile company={company} headingLevel="h2" />
          {profileHref && (
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={profileHref} />}>
              Open full profile page <ArrowUpRightIcon />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function CounterpartSummary({ company, profileHref, label = "Meeting with" }: { company: CounterpartData; profileHref?: string; label?: string }) {
  return (
    <section aria-label={`${label} ${company.name}`} className="panel space-y-4 p-5">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="flex items-start gap-3.5">
        <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-14" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-lg leading-tight font-bold">{company.name}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge tier={company.tier} size="sm" />
            <span className="text-sm text-muted-foreground">{company.business_type}</span>
          </div>
        </div>
      </div>
      {company.description && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{company.description}</p>}
      <CompanyDetailsSheet
        company={company}
        profileHref={profileHref}
        trigger={
          <Button variant="soft" className="w-full">
            <PanelRightOpenIcon /> View company details
          </Button>
        }
      />
    </section>
  )
}
