import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { registerCompany } from "@/app/admin/actions"
import { PageHeader } from "@/components/app-shell"
import { requireAdmin } from "@/lib/supabase/server"
import { CompanyForm } from "../company-form"

export const metadata: Metadata = { title: "Add approved company" }

export default async function NewCompanyPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Companies
      </Link>
      <PageHeader
        title="Add approved company"
        description="For companies already approved through the organizers’ registration process. Saving records the company and emails its contact a link to set up their login."
      />
      <CompanyForm mode="create" action={registerCompany} />
    </div>
  )
}
