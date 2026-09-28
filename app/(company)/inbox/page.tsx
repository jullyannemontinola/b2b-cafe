import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { CompanyLogo } from "@/components/company-logo"
import { StatusBadge, UnreadDot } from "@/components/status-badge"
import { TierBadge } from "@/components/tier-badge"
import { EmptyState } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { NAV, requestStatus } from "@/lib/copy"
import { formatDay, formatRange, getEventConfig } from "@/lib/event"
import { createClient, requireCompany } from "@/lib/supabase/server"
import { isUnread, THREAD_COLUMNS } from "@/lib/threads"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: NAV.requests }

// Incoming = the other organization sent the original request; outgoing = you did.
// Within each tab, requests waiting on the viewer come first.
export default async function MeetingRequestsPage({ searchParams }: PageProps<"/inbox">) {
  const tab = (await searchParams).tab === "outgoing" ? "outgoing" : "incoming"
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
    const first = t.offers.find((o) => o.version === 1)
    const counterpart = t.company_a_id === viewer.companyId ? t.company_b : t.company_a
    const myTurn = t.status === "pending" && latest.proposer_company_id !== viewer.companyId
    return {
      id: t.id,
      counterpart,
      latest,
      incoming: first?.proposer_company_id !== viewer.companyId,
      unread: isUnread(t, viewer.companyId),
      myTurn,
      open: t.status === "pending",
      status: requestStatus({
        status: t.status,
        waitingOn: t.status === "pending" && !myTurn ? (counterpart?.name ?? "the other organization") : null,
        revised: t.current_version > 1,
      }),
    }
  })

  const tabs = (["incoming", "outgoing"] as const).map((key) => {
    const list = rows.filter((r) => r.incoming === (key === "incoming"))
    return { key, label: key === "incoming" ? "Incoming" : "Outgoing", list, unread: list.filter((r) => r.unread).length }
  })
  const current = tabs.find((t) => t.key === tab)!.list
  const groups = [
    { title: "Your response needed", rows: current.filter((r) => r.myTurn) },
    { title: "Awaiting response", rows: current.filter((r) => r.open && !r.myTurn) },
    { title: "Closed", rows: current.filter((r) => !r.open) },
  ].filter((g) => g.rows.length)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl leading-tight">{NAV.requests}</h1>
        <nav aria-label="Request direction" className="flex gap-1 rounded-full bg-muted p-1 sm:w-auto">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key === "incoming" ? "/inbox" : "/inbox?tab=outgoing"}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none sm:flex-none",
                tab === t.key ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="tabular text-xs font-bold opacity-70">{t.list.length}</span>
              {t.unread > 0 && (
                <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {t.unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={tab === "incoming" ? "No incoming requests yet." : "You haven’t sent any requests yet."}>
          {tab === "incoming"
            ? "Requests other participants send you appear here."
            : "Open an organization in Participants and choose a time to request a meeting."}
          {tab === "outgoing" && (
            <div className="mt-4">
              <Button nativeButton={false} render={<Link href="/companies" />}>
                Browse participants <ArrowRightIcon />
              </Button>
            </div>
          )}
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-labelledby={slug(g.title)} className="space-y-2.5">
            <h2 id={slug(g.title)} className="flex items-baseline gap-2 text-base">
              {g.title}
              <span className="tabular text-sm font-semibold text-muted-foreground">{g.rows.length}</span>
            </h2>
            <ul className="panel divide-y divide-border overflow-hidden">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/inbox/${r.id}`}
                    className="flex items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:px-5"
                  >
                    <CompanyLogo id={r.counterpart?.id} name={r.counterpart?.name ?? "?"} logoUrl={r.counterpart?.logo_url ?? null} />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2">
                        <span className={cn("truncate", r.unread ? "font-extrabold" : "font-bold")}>{r.counterpart?.name ?? "Unavailable organization"}</span>
                        {r.counterpart && <TierBadge tier={r.counterpart.tier} size="sm" />}
                      </p>
                      <p className="tabular truncate text-sm text-muted-foreground">
                        {formatDay(r.latest.starts_at, config.timezone)} · {formatRange(r.latest.starts_at, r.latest.ends_at, config.timezone)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      {r.unread && <UnreadDot />}
                      <StatusBadge status={r.status.tone} label={r.status.label} className="max-w-44 truncate sm:max-w-none" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/\W+/g, "-")
