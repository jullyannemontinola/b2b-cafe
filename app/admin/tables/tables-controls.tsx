"use client"

import { useState, useTransition } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { reconcileVenues, setSharedTables, type SharedTablePlan, type VenuePlan } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))

const list = (labels: string[] = []) => labels.join(", ")

// One event day's shared-table setting. Each day saves on its own, so changing
// one day never touches the other. Increases save straight away; reductions are
// previewed first because they switch tables off, and a reduction that would
// touch a booked table is refused with the bookings in the way.
export function SharedTablesForm({
  date,
  dayLabel,
  active,
  dedicated,
  tz,
}: {
  date: string
  dayLabel: string
  active: number
  dedicated: number
  tz: string
}) {
  const [value, setValue] = useState(String(active))
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SharedTablePlan | null>(null)
  const [pending, start] = useTransition()
  const id = `shared-${date}`
  const typed = /^\d+$/.test(value.trim()) ? Number(value) : null
  const changed = typed !== null && typed !== active

  function run(count: number, apply: boolean) {
    start(async () => {
      const plan = await setSharedTables(date, count, apply)
      if (plan.error) return setError(plan.error)
      if (!apply) return setPreview(plan)
      setPreview(null)
      if (!plan.ok) return setPreview(plan)
      toast.success(`${dayLabel}: ${count} shared ${count === 1 ? "table" : "tables"} saved.`)
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPreview(null)
    if (typed === null) return setError("Enter a whole number, 0 or more.")
    if (typed > 500) return setError("Enter 500 or fewer.")
    if (!changed) return setError(`${dayLabel} already has ${active} shared ${active === 1 ? "table" : "tables"}.`)
    run(typed, typed > active)
  }

  return (
    <form onSubmit={submit} noValidate aria-label={`Tables for ${dayLabel}`} className="grid gap-x-8 gap-y-3 px-5 py-5 sm:px-6 md:grid-cols-[9rem_auto_minmax(0,1fr)] md:items-start">
      <p className="pt-1 text-base font-bold md:pt-8">{dayLabel}</p>

      <div className="space-y-2">
        <Label htmlFor={id}>Shared tables</Label>
        <div className="flex gap-2">
          <Input
            id={id}
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setPreview(null)
              setError(null)
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className="w-24"
          />
          <Button type="submit" className="h-11" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="max-w-xs text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 md:pt-7">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Premium dedicated (automatic)</dt>
          <dd className="tabular mt-0.5 text-xl font-extrabold">{dedicated}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">{changed ? "Total after saving" : "Total tables"}</dt>
          <dd className="tabular mt-0.5 text-xl font-extrabold">
            {(changed ? typed! : active) + dedicated}
            <span className="block text-xs font-medium text-muted-foreground">
              = {changed ? typed : active} shared + {dedicated} dedicated
            </span>
          </dd>
        </div>
      </dl>

      {preview && (
        <div className="md:col-span-3">
          {preview.ok ? (
            <div role="alertdialog" aria-labelledby={`${id}-preview`} className="space-y-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
              <p id={`${id}-preview`} className="font-bold">
                Reduce {dayLabel} from {preview.active} to {preview.requested} shared {preview.requested === 1 ? "table" : "tables"}?
              </p>
              <p className="text-muted-foreground">
                Switches off {list(preview.deactivate)}. {preview.deactivate?.length === 1 ? "It has" : "They have"} no confirmed meetings and{" "}
                {preview.deactivate?.length === 1 ? "keeps its" : "keep their"} number for later. The other day isn’t affected.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={pending} onClick={() => run(preview.requested, true)}>
                  {pending && <Loader2Icon className="animate-spin" />}
                  Switch off and save
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setPreview(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div role="alert" className="space-y-2 rounded-xl border border-destructive-border bg-destructive-surface p-4 text-sm">
              <p className="font-bold text-destructive">
                {dayLabel} needs at least {preview.booked_tables} shared {preview.booked_tables === 1 ? "table" : "tables"}: that many have
                confirmed meetings. Nothing was changed.
              </p>
              <p>These confirmed meetings keep their tables. Meetings are never moved or cancelled automatically:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {preview.blocked?.map((b) => (
                  <li key={b.table + b.starts_at}>
                    <strong>{b.table}</strong> · {when(b.starts_at, tz)} · {b.companies}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

// Existing meetings whose table doesn't follow the Premium rules. Nothing
// moves until an organizer reviews the list and applies it.
export function VenueReview({ plan, tz }: { plan: VenuePlan; tz: string }) {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = plan.changes.some((c) => !c.to || c.conflict)

  return (
    <section aria-labelledby="venue-review" className="space-y-3 rounded-2xl border border-pending/30 bg-pending-surface p-5 text-sm sm:p-6">
      <h2 id="venue-review" className="text-lg text-pending">
        {plan.changes.length} confirmed {plan.changes.length === 1 ? "meeting needs" : "meetings need"} a table review
      </h2>
      <p className="text-foreground/80">
        {plan.changes.length === 1 ? "This meeting involves" : "These meetings involve"} a Premium organization but{" "}
        {plan.changes.length === 1 ? "isn’t" : "aren’t"} on its dedicated table. Times stay the same; only the table changes. Both organizations
        see the new table on the meeting request.
      </p>
      <ul className="divide-y divide-pending/15 rounded-xl bg-card">
        {plan.changes.map((c) => (
          <li key={c.meeting_id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="font-semibold">{c.companies}</span>
              <span className="block text-muted-foreground">{when(c.starts_at, tz)}</span>
            </span>
            <span className="font-semibold">
              {c.from} → {c.to ?? <span className="text-destructive">no dedicated table</span>}
              {c.conflict && <span className="block text-xs text-destructive">That table is already booked then.</span>}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {error}
        </p>
      )}
      {blocked ? (
        <p className="font-medium text-destructive">Resolve the marked meetings before applying. Nothing has been changed.</p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Move {plan.changes.length === 1 ? "this meeting" : "all listed meetings"} now?</span>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await reconcileVenues(true)
                if (r.error || !r.ok) return setError(r.error ?? "Something changed. Review the updated list.")
                toast.success(`${r.changes.length} ${r.changes.length === 1 ? "meeting" : "meetings"} moved to dedicated tables.`)
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Move and notify
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Review and apply
        </Button>
      )}
    </section>
  )
}
