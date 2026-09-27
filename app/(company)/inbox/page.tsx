import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { StatusBadge, UnreadDot } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { EmptyState, PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { formatDay, formatRange, getEventConfig } from "@/lib/event"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { isUnread, THREAD_COLUMNS } from "@/lib/threads"

export const metadata: Metadata = { title: "Inbox" }

export default async function InboxPage() {
  const viewer = await requireCompany()
  const config = await getEventConfig()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("threads")
    .select(THREAD_COLUMNS)
    .or(`company_a_id.eq.${viewer.companyId},company_b_id.eq.${viewer.companyId}`)
    .order("last_activity_at", { ascending: false })
  if (error) throw error

  const rows = data.map((t) => {
    const latest = t.offers.find((o) => o.version === t.current_version)!
    const counterpart = t.company_a_id === viewer.companyId ? t.company_b : t.company_a
    return {
      id: t.id,
      status: t.status,
      counterpart,
      latest,
      unread: isUnread(t, viewer.companyId),
      myTurn: t.status === "pending" && latest.proposer_company_id !== viewer.companyId,
      revised: t.current_version > 1,
    }
  })

  const groups = [
    { title: "Needs your response", empty: "Nothing is waiting on you.", rows: rows.filter((r) => r.myTurn) },
    {
      title: "Waiting on the other company",
      empty: "You have no open proposals.",
      rows: rows.filter((r) => r.status === "pending" && !r.myTurn),
    },
    { title: "Closed", empty: "No confirmed or declined negotiations yet.", rows: rows.filter((r) => r.status !== "pending") },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Inbox" description="Every proposal and counterproposal between you and other companies." />

      {rows.length === 0 ? (
        <EmptyState title="No negotiations yet">
          Find a company in the directory and propose a time to meet.
          <div className="mt-4">
            <Button nativeButton={false} render={<Link href="/companies" />}>
              Browse companies <ArrowRightIcon />
            </Button>
          </div>
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-labelledby={g.title} className="space-y-3">
            <h2 id={g.title} className="flex items-center gap-2 text-lg">
              {g.title}
              <span className="tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">
                {g.rows.length}
              </span>
            </h2>
            {g.rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-input px-4 py-3.5 text-sm text-muted-foreground">{g.empty}</p>
            ) : (
              <ul className="panel divide-y divide-border overflow-hidden">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/inbox/${r.id}`}
                      className="flex items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:px-5"
                    >
                      <CompanyLogo name={r.counterpart?.name ?? "?"} logoUrl={r.counterpart?.logo_url ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className={`truncate ${r.unread ? "font-extrabold" : "font-bold"}`}>{r.counterpart?.name ?? "Unavailable company"}</span>
                          {r.counterpart && <TierBadge tier={r.counterpart.tier} size="sm" />}
                        </p>
                        <p className="tabular truncate text-sm text-muted-foreground">
                          {r.revised ? "Latest offer: " : ""}
                          {formatDay(r.latest.starts_at, config.timezone)}, {formatRange(r.latest.starts_at, r.latest.ends_at, config.timezone)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                        {r.unread && <UnreadDot />}
                        <StatusBadge status={r.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}
