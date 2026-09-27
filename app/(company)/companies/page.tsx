import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon, SearchIcon } from "lucide-react"
import { EmptyState, PageHeader } from "@/components/app-shell"
import { CompanyLogo } from "@/components/company-logo"
import { TIERS, TierBadge, tierMeta, type Tier } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Directory" }

type Company = { id: string; name: string; business_type: string; tier: Tier; logo_url: string | null; description: string | null }

// Tier only changes how prominently a company is shown. It never affects
// availability, acceptance or booking.
export default async function DirectoryPage({ searchParams }: PageProps<"/companies">) {
  const q = String((await searchParams).q ?? "").trim()
  const viewer = await requireCompany()
  const supabase = await createClient()

  // The whole (filtered) set is fetched and grouped, so no tier can be pushed
  // onto a later page. ponytail: fine for event scale; paginate per tier if it passes ~1,000 companies.
  let query = supabase.from("companies").select("id, name, business_type, tier, logo_url, description").eq("is_active", true).order("name")
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "\\$&")}%`)
  const [{ data: companies, error }, { data: threads }] = await Promise.all([
    query,
    supabase.from("threads").select("id, company_a_id, company_b_id").or(`company_a_id.eq.${viewer.companyId},company_b_id.eq.${viewer.companyId}`),
  ])
  if (error) throw error

  const threadWith = new Map((threads ?? []).map((t) => [t.company_a_id === viewer.companyId ? t.company_b_id : t.company_a_id, t.id]))
  const sections = TIERS.map((tier) => ({ tier, companies: companies.filter((c) => c.tier === tier) })).filter((s) => !q || s.companies.length)

  return (
    <div className="space-y-8">
      <PageHeader title="Company directory" description="Approved companies at B2B Café, grouped by participation tier. Open a profile to propose a meeting.">
        <form role="search" className="flex w-full gap-2 sm:w-96">
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
      </PageHeader>

      {companies.length === 0 ? (
        <EmptyState title={q ? `No companies match “${q}”` : "No companies are listed yet"}>
          {q ? "The search covers every tier. Check the spelling or try part of the name." : "Approved companies appear here once the organizers activate them."}
          {q && (
            <div className="mt-4">
              <Button variant="soft" nativeButton={false} render={<Link href="/companies" />}>
                Clear search
              </Button>
            </div>
          )}
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Jump to tier" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-muted-foreground" aria-live="polite">
              {companies.length} {companies.length === 1 ? "company" : "companies"}
              {q && <> matching “{q}”</>}:
            </span>
            {sections.map((s) => (
              <a key={s.tier} href={`#tier-${s.tier}`} className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
                <TierBadge tier={s.tier} className="transition-shadow hover:shadow-soft" />
                <span className="sr-only">, {s.companies.length} companies</span>
              </a>
            ))}
          </nav>

          {sections.map(({ tier, companies: list }) => (
            <section key={tier} id={`tier-${tier}`} aria-labelledby={`tier-${tier}-heading`} className="scroll-mt-28 space-y-4">
              <TierHeading tier={tier} count={list.length} />
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-input px-4 py-3.5 text-sm text-muted-foreground">
                  No {tierMeta[tier].label} companies are listed yet.
                </p>
              ) : (
                <ul
                  className={cn(
                    "grid gap-4",
                    tier === "premium" && "md:grid-cols-2",
                    tier === "access" && "sm:grid-cols-2 lg:grid-cols-3",
                    tier === "matching_pool" && "gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                  )}
                >
                  {list.map((c) => (
                    <li key={c.id}>
                      {tier === "premium" ? (
                        <PremiumCard company={c} isSelf={c.id === viewer.companyId} threadId={threadWith.get(c.id)} />
                      ) : (
                        <CompactCard company={c} isSelf={c.id === viewer.companyId} size={tier === "access" ? "md" : "sm"} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function TierHeading({ tier, count }: { tier: Tier; count: number }) {
  const meta = tierMeta[tier]
  const Icon = meta.icon
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3">
      <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-xl border", meta.badge)}>
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
      <h2 id={`tier-${tier}-heading`} className="text-xl">
        {meta.section}
      </h2>
      <span className="tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">
        {count}
        <span className="sr-only"> {count === 1 ? "company" : "companies"}</span>
      </span>
    </div>
  )
}

function PremiumCard({ company: c, isSelf, threadId }: { company: Company; isSelf: boolean; threadId?: string }) {
  return (
    <article
      aria-labelledby={`c-${c.id}`}
      className="panel flex h-full flex-col gap-5 border-tier-premium-border bg-[linear-gradient(180deg,var(--tier-premium-surface)_0%,var(--card)_42%)] p-6"
    >
      <div className="flex items-start gap-4">
        <CompanyLogo name={c.name} logoUrl={c.logo_url} className="size-20 rounded-[22px] text-lg" />
        <div className="min-w-0 flex-1 space-y-1.5 pt-1">
          <h3 id={`c-${c.id}`} className="text-[22px] leading-tight">
            {c.name}
            {isSelf && <span className="ml-2 align-middle text-xs font-bold text-muted-foreground">(you)</span>}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={c.tier} />
            <span className="text-sm font-medium text-muted-foreground">{c.business_type}</span>
          </div>
        </div>
      </div>
      {c.description && <p className="line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">{c.description}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/companies/${c.id}`} />}>
          View company
        </Button>
        {!isSelf &&
          (threadId ? (
            <Button variant="soft" nativeButton={false} render={<Link href={`/inbox/${threadId}`} />}>
              View negotiation
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link href={`/companies/${c.id}#propose`} />}>
              Propose meeting
            </Button>
          ))}
      </div>
    </article>
  )
}

function CompactCard({ company: c, isSelf, size }: { company: Company; isSelf: boolean; size: "md" | "sm" }) {
  const md = size === "md"
  return (
    <Link
      href={`/companies/${c.id}`}
      className={cn(
        "panel group flex h-full flex-col transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        md ? "gap-4 border-tier-access-border p-5" : "gap-3 rounded-[20px] border-tier-pool-border p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <CompanyLogo name={c.name} logoUrl={c.logo_url} className={md ? "size-14" : "size-11 rounded-xl"} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={cn("truncate font-bold", md ? "text-base" : "text-[15px]")}>{c.name}</p>
          <p className="truncate text-sm text-muted-foreground">{c.business_type}</p>
        </div>
      </div>
      {md && c.description && <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{c.description}</p>}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1.5">
          <TierBadge tier={c.tier} size={md ? "md" : "sm"} />
          {isSelf && <span className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[11px] font-bold text-muted-foreground">You</span>}
        </span>
        <span className="flex items-center gap-0.5 text-sm font-bold text-primary">
          {isSelf ? "View" : "View profile"}
          <ChevronRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
