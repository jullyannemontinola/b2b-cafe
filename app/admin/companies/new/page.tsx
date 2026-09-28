import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { registerCompany } from "@/app/admin/actions"
import { HelpButton } from "@/components/help"
import { NAV } from "@/lib/copy"
import { requireAdmin } from "@/lib/supabase/server"
import { CompanyForm } from "../company-form"

export const metadata: Metadata = { title: "Add approved participant" }

export default async function NewCompanyPage() {
  await requireAdmin()
  return (
    <div className="space-y-5">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {NAV.participants}
      </Link>
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl leading-tight">Add approved participant</h1>
        <HelpButton title="Adding a participant" more="/admin/help?topic=adding">
          <p>Use this form for an organization already approved by the event team.</p>
          <p>Saving creates its account and emails a setup link to the login email. The contact then sets their own password.</p>
        </HelpButton>
      </div>
      <CompanyForm mode="create" action={registerCompany} />
    </div>
  )
}
