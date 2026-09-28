import type { Metadata } from "next"
import Link from "next/link"
import { reconcileVenues } from "@/app/admin/actions"
import { HelpButton } from "@/components/help"
import { NAV } from "@/lib/copy"
import { formatDay, getEventConfig } from "@/lib/event"
import { createClient, requireAdmin } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { SharedTablesForm, VenueReview } from "./tables-controls"

export const metadata: Metadata = { title: NAV.tables }

// Shared tables are set per day by organizers. Dedicated tables are created by
// the database for each Premium organization (one per day) and are
// only listed here.
export default async function AdminTablesPage({ searchParams }: PageProps<"/admin/tables">) {
  await requireAdmin()
  const config = await getEventConfig()
  const tz = config.timezone
  const requested = String((await searchParams).day ?? "")
  const day = config.eventDates.includes(requested) ? requested : config.eventDates[0]
  const supabase = await createClient()

  const [{ data: tables, error }, { data: allTables, error: allError }, venue] = await Promise.all([
    supabase
      .from("meeting_tables")
      .select("id, label, kind, number, is_active, owner_company_id, companies(name, tier), meetings(id, status)")
      .eq("event_date", day)
      .order("kind")
      .order("number"),
    supabase.from("meeting_tables").select("event_date, kind").eq("is_active", true),
    reconcileVenues(false),
  ])
  if (error) throw error
  if (allError) throw allError
  const countOn = (date: string, kind: "shared" | "dedicated") => allTables.filter((t) => t.event_date === date && t.kind === kind).length

  const rows = tables.map((t) => ({ ...t, bookings: t.meetings.filter((m) => m.status === "confirmed").length }))
  const listed = rows.filter((t) => t.is_active || t.bookings > 0)
  const off = rows.length - listed.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl leading-tight">{NAV.tables}</h1>
          <HelpButton title="Shared and dedicated tables" more="/admin/help?topic=tables">
            <p>
              <strong className="text-foreground">Shared tables</strong> host meetings between non-Premium organizations. You set how many
              there are for each day.
            </p>
            <p>
              <strong className="text-foreground">Dedicated tables</strong> are added automatically: one per Premium organization per
              day. Any meeting involving a Premium organization uses its dedicated table.
            </p>
          </HelpButton>
        </div>
      </div>

      {venue.changes.length > 0 && <VenueReview plan={venue} tz={tz} />}

      <section aria-labelledby="capacity" className="space-y-3">
        <div>
          <h2 id="capacity" className="text-lg">
            Shared tables by day
          </h2>
          <p className="text-sm text-muted-foreground">
            Each day is set separately. Premium dedicated tables are added on top automatically, one per Premium organization. The
            number you set is declared capacity; check separately that the venue can fit it.
          </p>
        </div>
        <div className="panel divide-y divide-border">
          {config.eventDates.map((d) => (
            <SharedTablesForm
              key={`${d}-${countOn(d, "shared")}`}
              date={d}
              dayLabel={formatDay(d, tz)}
              active={countOn(d, "shared")}
              dedicated={countOn(d, "dedicated")}
              tz={tz}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="table-list" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="table-list" className="flex items-baseline gap-2 text-lg">
            Tables on {formatDay(day, tz)}
            <span className="tabular text-sm font-semibold text-muted-foreground">{listed.length}</span>
          </h2>
        <nav aria-label="Show tables for" className="flex gap-1 rounded-full bg-muted p-1">
          {config.eventDates.map((d) => (
            <Link
              key={d}
              href={`/admin/tables?day=${d}#table-list`}
              aria-current={d === day ? "page" : undefined}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none sm:flex-none",
                d === day ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {formatDay(d, tz)}
            </Link>
          ))}
        </nav>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold sm:px-5">Table</th>
                <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                <th scope="col" className="px-4 py-3 font-semibold">Owner</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Confirmed meetings</th>
                <th scope="col" className="px-4 py-3 font-semibold sm:pr-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listed.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="px-4 py-3 text-left font-bold sm:px-5">{t.label}</th>
                  <td className="px-4 py-3">{t.kind === "shared" ? "Shared" : "Dedicated"}</td>
                  <td className="px-4 py-3">
                    {t.companies ? (
                      <Link href={`/admin/companies/${t.owner_company_id}`} className="font-semibold hover:text-primary hover:underline">
                        {t.companies.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-3 text-right">
                    {t.bookings > 0 ? (
                      <Link href={`/admin/meetings?day=${day}&table=${t.id}`} className="font-bold text-primary hover:underline">
                        {t.bookings}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 sm:pr-5">
                    {t.is_active ? "In use" : <span className="font-semibold text-pending">Switched off, has bookings</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {off > 0 && (
          <p className="text-sm text-muted-foreground">
            {off === 1
              ? "1 switched-off table is hidden. It keeps its number and comes back first when capacity increases."
              : `${off} switched-off tables are hidden. They keep their numbers and come back first when capacity increases.`}
          </p>
        )}
      </section>
    </div>
  )
}

