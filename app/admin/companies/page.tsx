import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react"
import { EmptyState, PageHeader } from "@/components/app-shell"
import { CompanyLogo } from "@/components/company-logo"
import { AccountBadge, StatusBadge } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient, requireAdmin } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Companies" }

const filters = [
  { value: "", label: "All" },
  { value: "awaiting", label: "Awaiting setup" },
  { value: "inactive", label: "Inactive" },
]

export default async function AdminCompaniesPage({ searchParams }: PageProps<"/admin/companies">) {
  await requireAdmin()
  const sp = await searchParams
  const q = String(sp.q ?? "").trim()
  const filter = String(sp.account ?? "")
  const supabase = await createClient()

  let query = supabase
    .from("companies")
    .select("id, name, business_type, tier, logo_url, is_active, contact_name, company_accounts(login_email, status)")
    .order("name")
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "\\$&")}%`)
  const { data, error } = await query
  if (error) throw error

  const companies = data.filter((c) =>
    filter === "awaiting" ? c.company_accounts?.status !== "active" : filter === "inactive" ? !c.is_active : true,
  )
  const href = (account: string) => {
    const p = new URLSearchParams()
    if (q) p.set("q", q)
    if (account) p.set("account", account)
    return `/admin/companies${p.size ? `?${p}` : ""}`
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Companies" description="Externally approved companies, their participation and account setup.">
        <Button size="lg" nativeButton={false} render={<Link href="/admin/companies/new" />}>
          <PlusIcon /> Add approved company
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Filter companies" className="flex gap-1 rounded-full bg-muted p-1">
          {filters.map((f) => (
            <Link
              key={f.value}
              href={href(f.value)}
              aria-current={filter === f.value ? "page" : undefined}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 md:flex-none",
                filter === f.value ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2 md:w-96">
          {filter && <input type="hidden" name="account" value={filter} />}
          <label htmlFor="q" className="sr-only">
            Search companies by name
          </label>
          <div className="relative flex-1">
            <SearchIcon aria-hidden className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search by name" className="rounded-full pl-10" />
          </div>
          <Button type="submit" className="h-11 rounded-full px-5">
            Search
          </Button>
        </form>
      </div>

      {companies.length === 0 ? (
        <EmptyState title={q ? `No companies match “${q}”` : "No companies here yet"}>
          {q || filter ? "Try a different search or filter." : "Add the first approved company to give it access."}
        </EmptyState>
      ) : (
        <ul className="panel divide-y divide-border overflow-hidden">
          {companies.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/companies/${c.id}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors duration-150 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:px-5 md:grid-cols-[auto_minmax(0,1fr)_9rem_10rem_auto]"
              >
                <CompanyLogo name={c.name} logoUrl={c.logo_url} />
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.business_type} · {c.company_accounts?.login_email ?? "no login"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                    <TierBadge tier={c.tier} />
                    <StatusBadge status={c.is_active ? "active" : "inactive"} label={c.is_active ? "Participating" : "Inactive"} />
                    <AccountBadge status={c.company_accounts?.status ?? "pending"} />
                  </div>
                </div>
                <span className="hidden md:block">
                  <TierBadge tier={c.tier} />
                </span>
                <span className="hidden flex-col items-start gap-1.5 md:flex">
                  <StatusBadge status={c.is_active ? "active" : "inactive"} label={c.is_active ? "Participating" : "Inactive"} />
                  <AccountBadge status={c.company_accounts?.status ?? "pending"} />
                </span>
                <ChevronRightIcon aria-hidden className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
