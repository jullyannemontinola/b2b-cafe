"use client"

import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { CompanyProfile, type CompanyProfileData } from "@/components/company-profile"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export type CounterpartData = CompanyProfileData & { id: string }

// Organization details in a side sheet (full-width on phones). It opens over
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
          <SheetTitle className="text-sm font-bold text-muted-foreground">Organization details</SheetTitle>
          <SheetDescription className="sr-only">Details for {company.name}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-6 py-6">
          <CompanyProfile company={company} headingLevel="h2" />
          {profileHref && (
            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={profileHref} />}>
              Open details page <ArrowUpRightIcon />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
