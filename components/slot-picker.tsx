"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { counterOffer, proposeMeeting, type ActionResult } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Slot, SlotDay } from "@/lib/availability"
import { cn } from "@/lib/utils"

type Mode =
  | { kind: "propose"; targetCompanyId: string }
  | { kind: "counter"; threadId: string; expectedVersion: number }

export function SlotPicker({
  days,
  timezoneLabel,
  mode,
  onDone,
}: {
  days: SlotDay[]
  timezoneLabel: string
  mode: Mode
  onDone?: () => void
}) {
  const router = useRouter()
  const firstOpenDay = days.find((d) => d.slots.some((s) => !s.reason))?.date ?? days[0]?.date
  const [date, setDate] = useState(firstOpenDay)
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const day = days.find((d) => d.date === date)
  const slot = days.flatMap((d) => d.slots).find((s) => s.startsAt === selected)
  const slotDay = days.find((d) => slot && d.slots.includes(slot))
  const groups = (["Morning", "Afternoon"] as const)
    .map((period) => ({ period, slots: day?.slots.filter((s) => s.period === period) ?? [] }))
    .filter((g) => g.slots.length > 0)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!slot) return setError("Choose a time slot first.")
    setError(null)
    startTransition(async () => {
      let result: ActionResult
      if (mode.kind === "propose") {
        result = await proposeMeeting({ targetCompanyId: mode.targetCompanyId, startsAt: slot.startsAt, endsAt: slot.endsAt, message })
      } else {
        result = await counterOffer({
          threadId: mode.threadId,
          expectedVersion: mode.expectedVersion,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          message,
        })
      }
      if (!result.ok) {
        // Keep the drafted message; availability has been refreshed server-side.
        setError(result.error)
        setSelected(null)
        return
      }
      toast.success(mode.kind === "propose" ? "Proposal sent" : "Counterproposal sent")
      onDone?.()
      if (result.threadId) router.push(`/inbox/${result.threadId}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-2.5">
        <legend className="mb-2.5 text-sm font-bold">Day</legend>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
          {days.map((d) => {
            const open = d.slots.filter((s) => !s.reason).length
            const active = d.date === date
            return (
              <button
                key={d.date}
                type="button"
                aria-pressed={active}
                onClick={() => setDate(d.date)}
                className={cn(
                  "flex flex-col items-center rounded-xl px-3 py-2.5 transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                  active ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-sm font-bold">{d.label}</span>
                <span className="text-xs font-medium">{open} open</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-2 text-sm font-bold">
          Time
          <span className="text-xs font-medium text-muted-foreground">{timezoneLabel} · 30-minute meetings</span>
        </legend>
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No slots on this day.</p>}
        {groups.map((g) => (
          <div key={g.period} className="space-y-2">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{g.period}</p>
            <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3">
              {g.slots.map((s) => (
                <SlotOption key={s.startsAt} slot={s} checked={s.startsAt === selected} disabled={pending} onSelect={() => setSelected(s.startsAt)} />
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Availability is a guide. The time is only reserved once the other company accepts.
        </p>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="message">
          Message <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="What would you like to discuss?"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive-surface px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:pl-4">
        <p className="tabular text-sm" aria-live="polite">
          {slot && slotDay ? (
            <>
              <span className="font-bold">{slotDay.label}</span>, {slot.label}
            </>
          ) : (
            <span className="text-muted-foreground">No time selected</span>
          )}
        </p>
        <Button type="submit" size="lg" disabled={pending || !slot}>
          {pending && <Loader2Icon className="animate-spin" />}
          {mode.kind === "propose" ? "Send proposal" : "Send counterproposal"}
        </Button>
      </div>
    </form>
  )
}

function SlotOption({ slot, checked, disabled, onSelect }: { slot: Slot; checked: boolean; disabled: boolean; onSelect: () => void }) {
  const unavailable = Boolean(slot.reason)
  return (
    <label
      className={cn(
        "relative flex min-h-16 flex-col justify-center rounded-2xl border px-3.5 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
        unavailable && "cursor-not-allowed border-dashed border-input bg-muted/60 text-muted-foreground",
        !unavailable && !checked && "cursor-pointer border-border bg-card hover:border-primary/50 hover:bg-secondary/40",
        checked && "cursor-pointer border-primary bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_rgb(21_84_240/0.8)]",
      )}
    >
      <input
        type="radio"
        name="slot"
        value={slot.startsAt}
        checked={checked}
        disabled={unavailable || disabled}
        onChange={onSelect}
        aria-label={`${slot.label}${slot.reason ? `, unavailable: ${slot.reason}` : ""}`}
        className="sr-only"
      />
      <span className={cn("tabular text-[15px] font-bold", unavailable && "font-semibold")}>{slot.startLabel}</span>
      <span className={cn("text-xs", checked ? "text-primary-foreground/85" : unavailable ? "" : "text-muted-foreground")}>
        {slot.reason ?? `${slot.freeTables} ${slot.freeTables === 1 ? "table" : "tables"} free`}
      </span>
      {checked && (
        <span aria-hidden className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-white text-primary">
          <CheckIcon className="size-3.5" strokeWidth={3} />
        </span>
      )}
    </label>
  )
}
