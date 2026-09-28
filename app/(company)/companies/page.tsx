import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRightIcon, SearchIcon } from "lucide-react"
import { EmptyState } from "@/components/app-shell"
import { CompanyLogo } from "@/components/company-logo"
import { HelpButton } from "@/components/help"
import { TIERS, TierBadge, tierMeta, type Tier } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NAV } from "@/lib/copy"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: NAV.participants }

type Company = { id: string; name: string; business_type: string; tier: Tier; logo_url: string | null; description: string | null }

// Tier only changes how prominently a company is shown. It never affects
// availability, acceptance or booking.
export default async function DirectoryPage({ searchParams }: PageProps<"/companies">) {
  const q = String((await searchParams).q ?? "").trim()
  const viewer = await requireCompany()
  const supabase = await createClient()

  // The whole (filtered) set is fetched and grouped, so no tier can be pushed
  // onto a later page. ponytail: fine for event scale; paginate per tier if it passes ~1,000 companies.
  let query = supabase.from("companies").select("id, name, business_type, tier, logo_url, description").order("name")
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "\\$&")}%`)
  const [{ data: companies, error }, { data: threads }] = await Promise.all([
    query,
    supabase.from("threads").select("id, company_a_id, company_b_id").or(`company_a_id.eq.${viewer.companyId},company_b_id.eq.${viewer.companyId}`),
  ])
  if (error) throw error

  const threadWith = new Map((threads ?? []).map((t) => [t.company_a_id === viewer.companyId ? t.company_b_id : t.company_a_id, t.id]))
  const sections = TIERS.map((tier) => ({ tier, companies: companies.filter((c) => c.tier === tier) })).filter((s) => !q || s.companies.length)

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-2xl leading-tight">{NAV.participants}</h1>
          <span className="tabular text-base font-semibold text-muted-foreground" aria-live="polite">
            {companies.length}
            <span className="sr-only">{` ${companies.length === 1 ? "organization" : "organizations"}${q ? ` matching “${q}”` : ""}`}</span>
          </span>
        </div>
        <form role="search" className="flex w-full gap-2 sm:w-96">
          <label htmlFor="q" className="sr-only">
            Search participants by organization name
          </label>
          <div className="relative flex-1">
            <SearchIcon aria-hidden className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Organization name" className="rounded-full pl-10" />
          </div>
          <Button type="submit" className="h-11 rounded-full px-5">
            Search
          </Button>
        </form>
      </div>

      {companies.length === 0 ? (
        <EmptyState title={q ? `No participants match “${q}”` : "No participants are listed yet"}>
          {q ? "Search covers every B2B tier. Check the spelling or try part of the name." : "Approved organizations appear here once the organizers add them."}
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
          <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
            {q && (
              <span className="mr-1 font-semibold text-muted-foreground">
                Matching “{q}” ·{" "}
                <Link href="/companies" className="text-primary underline-offset-4 hover:underline">
                  Clear
                </Link>
              </span>
            )}
            <nav aria-label="Jump to B2B tier" className="flex flex-wrap items-center gap-2">
              {sections.map((s) => (
                <a key={s.tier} href={`#tier-${s.tier}`} className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
                  <TierBadge tier={s.tier} className="transition-shadow hover:shadow-soft" />
                  <span className="sr-only">, {s.companies.length} {s.companies.length === 1 ? "organization" : "organizations"}</span>
                </a>
              ))}
            </nav>
            <HelpButton title="B2B tiers" more="/help?topic=tiers">
              <p>
                Each badge shows the organization’s B2B Café participation tier: B2B Premium, B2B Access or B2B Matching Pool.
              </p>
              <p>Tiers only change how prominently organizations are listed. They don’t affect who you can request or which times are available.</p>
            </HelpButton>
          </div>

          {sections.map(({ tier, companies: list }) => (
            <section key={tier} id={`tier-${tier}`} aria-labelledby={`tier-${tier}-heading`} className="scroll-mt-28 space-y-4 pt-2">
              <TierHeading tier={tier} count={list.length} />
              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {tierMeta[tier].section} participants yet.
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
                      <ParticipantCard company={c} isSelf={c.id === viewer.companyId} threadId={threadWith.get(c.id)} />
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
  return (
    <div className="flex items-baseline gap-2 border-b border-border pb-2.5">
      <h2 id={`tier-${tier}-heading`} className="text-lg">
        {tierMeta[tier].section}
      </h2>
      <span className="tabular text-sm font-semibold text-muted-foreground">
        {count}
        <span className="sr-only"> {count === 1 ? "organization" : "organizations"}</span>
      </span>
    </div>
  )
}

const cardSize = {
  premium: { card: "gap-4 p-6", logo: "size-16 rounded-2xl text-base", name: "text-xl", lines: "line-clamp-3" },
  access: { card: "gap-3.5 p-5", logo: "size-12", name: "text-base", lines: "line-clamp-2" },
  matching_pool: { card: "gap-3 p-4", logo: "size-10 rounded-xl text-xs", name: "text-[15px]", lines: "" },
} as const

// One card for every tier; the tier only sets its size. The "View details"
// link is stretched over the card, so the whole card is clickable without
// nesting controls; "View request" sits above it.
function ParticipantCard({ company: c, isSelf, threadId }: { company: Company; isSelf: boolean; threadId?: string }) {
  const size = cardSize[c.tier]
  return (
    <article
      aria-labelledby={`c-${c.id}`}
      className={cn(
        "panel relative flex h-full flex-col transition-colors duration-150 hover:border-primary/40 has-[.card-link:focus-visible]:ring-3 has-[.card-link:focus-visible]:ring-ring/40",
        size.card,
      )}
    >
      <div className="flex items-start gap-3.5">
        <CompanyLogo id={c.id} name={c.name} logoUrl={c.logo_url} className={size.logo} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 id={`c-${c.id}`} className={cn("line-clamp-2 leading-snug break-words", size.name)}>
            {c.name}
          </h3>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <TierBadge tier={c.tier} size="sm" />
            <span className="min-w-0 truncate text-sm text-muted-foreground">{c.business_type}</span>
          </div>
        </div>
      </div>
      {size.lines && c.description && <p className={cn("text-sm leading-relaxed text-muted-foreground", size.lines)}>{c.description}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-sm font-bold">
        <Link href={`/companies/${c.id}`} className="card-link inline-flex items-center gap-0.5 text-primary outline-none after:absolute after:inset-0 after:rounded-[inherit]">
          View details<span className="sr-only"> for {c.name}</span>
          <ChevronRightIcon aria-hidden className="size-4" />
        </Link>
        {isSelf ? (
          <span className="font-semibold text-muted-foreground">Your organization</span>
        ) : threadId ? (
          <Link
            href={`/inbox/${threadId}`}
            className="relative z-10 rounded-md text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            View request<span className="sr-only"> with {c.name}</span>
          </Link>
        ) : null}
      </div>
    </article>
  )
}
