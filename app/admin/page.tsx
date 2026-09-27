import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, PlusIcon } from "lucide-react"
import { EmptyState, PageHeader } from "@/components/app-shell"
import { TierBadge, tierMeta, TIERS } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { formatDay, formatRange, getEventConfig, isPast, tzLabel } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Overview" }

// Every number here is a direct count of stored rows. Organizer accounts have
// no company record, so they can never appear in company or meeting counts.
export default async function AdminOverviewPage() {
  await requireAdmin()
  const config = await getEventConfig()
  const tz = config.timezone
  const supabase = await createClient()

  const [companies, accounts, pending, meetings, tables] = await Promise.all([
    supabase.from("companies").select("id, tier, is_active"),
    supabase.from("company_accounts").select("company_id, status"),
    supabase.from("threads").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("meetings")
      .select(
        "id, starts_at, ends_at, thread_id, meeting_tables(label), threads(company_a:companies!threads_company_a_id_fkey(name, tier), company_b:companies!threads_company_b_id_fkey(name, tier))",
      )
      .eq("status", "confirmed")
      .order("starts_at"),
    supabase.from("meeting_tables").select("*", { count: "exact", head: true }).eq("is_active", true),
  ])
  for (const r of [companies, accounts, pending, meetings, tables]) if (r.error) throw r.error

  const allCompanies = companies.data!
  const statusByCompany = new Map(accounts.data!.map((a) => [a.company_id, a.status]))
  const activeCompanies = allCompanies.filter((c) => c.is_active)
  const awaitingSetup = allCompanies.filter((c) => statusByCompany.get(c.id) !== "active")
  const allMeetings = meetings.data!
  const upcoming = allMeetings.filter((m) => !isPast(m.ends_at))

  const slotsPerDay = (8 * 60) / config.slotMinutes // prototype hours 09:00–17:00
  const capacityPerDay = (tables.count ?? 0) * slotsPerDay
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso))
  const byDay = config.eventDates.map((date) => ({
    date,
    label: formatDay(date, tz),
    count: allMeetings.filter((m) => dayOf(m.starts_at) === date).length,
  }))

  const tiers = TIERS.map((tier) => ({
    tier,
    total: allCompanies.filter((c) => c.tier === tier).length,
    active: activeCompanies.filter((c) => c.tier === tier).length,
  }))
  const maxTier = Math.max(1, ...tiers.map((t) => t.total))

  const stats = [
    { label: "Registered companies", value: allCompanies.length, note: "All company records, active or not" },
    { label: "Active participants", value: activeCompanies.length, note: "Visible in the directory and able to schedule" },
    { label: "Awaiting account setup", value: awaitingSetup.length, note: "Company login not yet activated by the recipient", href: "/admin/companies?account=awaiting" },
    { label: "Pending negotiations", value: pending.count ?? 0, note: "Open threads, counted once however many counters", href: "/admin/meetings?view=negotiations" },
    { label: "Confirmed meetings", value: allMeetings.length, note: "Each meeting counted once, not per company", href: "/admin/meetings" },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Event overview" description={`Live counts from the scheduling database. Times in ${tzLabel(tz)}.`}>
        <Button size="lg" nativeButton={false} render={<Link href="/admin/companies/new" />}>
          <PlusIcon /> Add approved company
        </Button>
      </PageHeader>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => {
          const body = (
            <>
              <dt className="text-sm font-semibold text-muted-foreground">{s.label}</dt>
              <dd className="tabular mt-1 text-3xl font-extrabold tracking-tight">{s.value}</dd>
              <dd className="mt-1.5 text-xs leading-snug text-muted-foreground">{s.note}</dd>
            </>
          )
          return s.href ? (
            <Link key={s.label} href={s.href} className="panel block p-4 last:col-span-2 md:last:col-span-1 transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none sm:p-5">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="panel p-4 sm:p-5">
              {body}
            </div>
          )
        })}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="tiers" className="panel space-y-5 p-5 sm:p-6">
          <div>
            <h2 id="tiers" className="text-lg">Companies by tier</h2>
            <p className="text-sm text-muted-foreground">Active participants out of all registered records per tier.</p>
          </div>
          <ul className="space-y-4">
            {tiers.map((t) => (
              <li key={t.tier} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold">{tierMeta[t.tier].label}</span>
                  <span className="tabular text-muted-foreground">
                    <span className="font-bold text-foreground">{t.active}</span> active of {t.total}
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-secondary" style={{ width: `${(t.total / maxTier) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(t.active / maxTier) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="days" className="panel space-y-5 p-5 sm:p-6">
          <div>
            <h2 id="days" className="text-lg">Confirmed meetings by day</h2>
            <p className="text-sm text-muted-foreground">
              Against table capacity: {tables.count} tables × {slotsPerDay} slots = {capacityPerDay} per day.
            </p>
          </div>
          <ul className="space-y-4">
            {byDay.map((d) => (
              <li key={d.date} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <Link href={`/admin/meetings?day=${d.date}`} className="font-bold hover:text-primary">
                    {d.label}
                  </Link>
                  <span className="tabular text-muted-foreground">
                    <span className="font-bold text-foreground">{d.count}</span> of {capacityPerDay} table slots
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${capacityPerDay ? Math.min(100, (d.count / capacityPerDay) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="upcoming" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="upcoming" className="text-lg">Upcoming meetings</h2>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin/meetings" />}>
            All meetings <ArrowRightIcon />
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming meetings">Meetings appear here once companies accept a proposal.</EmptyState>
        ) : (
          <ul className="panel divide-y divide-border overflow-hidden">
            {upcoming.slice(0, 8).map((m) => (
              <li key={m.id}>
                <Link href={`/admin/threads/${m.thread_id}`} className="grid gap-x-4 gap-y-1 px-4 py-3.5 transition-colors duration-150 hover:bg-secondary/40 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:px-5">
                  <span className="tabular text-sm font-bold">
                    {formatDay(m.starts_at, tz)} · {formatRange(m.starts_at, m.ends_at, tz).split(" – ")[0]}
                  </span>
                  <span className="min-w-0 text-sm leading-relaxed">
                    <span className="font-semibold">{m.threads?.company_a?.name}</span> <TierBadge tier={m.threads?.company_a?.tier} size="sm" className="align-middle" />
                    <span className="text-muted-foreground"> and </span>
                    <span className="font-semibold">{m.threads?.company_b?.name}</span> <TierBadge tier={m.threads?.company_b?.tier} size="sm" className="align-middle" />
                  </span>
                  <span className="inline-flex h-7 w-fit items-center rounded-full bg-secondary px-3 text-xs font-bold text-secondary-foreground">
                    {m.meeting_tables?.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
