"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2Icon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { acceptOffer, declineOffer, markThreadRead } from "@/app/actions"
import { SlotPicker } from "@/components/slot-picker"
import { Button } from "@/components/ui/button"
import type { SlotDay } from "@/lib/availability"

export function MarkRead({ threadId, unread }: { threadId: string; unread: boolean }) {
  useEffect(() => {
    if (unread) markThreadRead(threadId)
  }, [threadId, unread])
  return null
}

export function OfferActions({
  threadId,
  version,
  counterpartName,
  offerLabel,
  days,
  timezoneLabel,
}: {
  threadId: string
  version: number
  counterpartName: string
  offerLabel: string
  days: SlotDay[]
  timezoneLabel: string
}) {
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [countering, setCountering] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)

  function run(kind: "accept" | "decline") {
    setError(null)
    setBusy(kind)
    startTransition(async () => {
      const result = kind === "accept" ? await acceptOffer(threadId, version) : await declineOffer(threadId, version)
      setBusy(null)
      setConfirmDecline(false)
      if (!result.ok) return setError(result.error)
      toast.success(
        kind === "accept"
          ? `Meeting confirmed${result.table ? ` · ${result.table}` : ""}. It’s in My schedule.`
          : `Request from ${counterpartName} declined.`,
      )
    })
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl bg-destructive-surface px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {!countering && !confirmDecline && (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={pending} onClick={() => run("accept")}>
            {busy === "accept" && <Loader2Icon className="animate-spin" />}
            Confirm meeting
          </Button>
          <Button size="lg" variant="soft" disabled={pending} onClick={() => setCountering(true)}>
            Suggest another time
          </Button>
          <Button size="lg" variant="destructive" disabled={pending} onClick={() => setConfirmDecline(true)}>
            <XCircleIcon /> Decline request
          </Button>
        </div>
      )}
      {confirmDecline && !countering && (
        <div role="alertdialog" aria-labelledby="decline-title" aria-describedby="decline-desc" className="space-y-3 rounded-2xl border-2 border-destructive-border bg-card p-4">
          <p id="decline-title" className="font-bold text-destructive">
            Decline the request from {counterpartName} for {offerLabel}?
          </p>
          <p id="decline-desc" className="text-sm text-foreground/80">
            This closes the meeting request. Neither of you can send the other a new request through B2B Café.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => run("decline")} autoFocus>
              {busy === "decline" && <Loader2Icon className="animate-spin" />}
              Decline request
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmDecline(false)}>
              Keep request open
            </Button>
          </div>
        </div>
      )}

      {countering && (
        <div className="space-y-4 rounded-3xl border border-border bg-background/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg">Suggest another time</h3>
            <Button variant="outline" size="sm" onClick={() => setCountering(false)}>
              Cancel
            </Button>
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">Choose another available time. {counterpartName} will need to confirm it.</p>
          <SlotPicker
            days={days}
            timezoneLabel={timezoneLabel}
            counterpartName={counterpartName}
            mode={{ kind: "counter", threadId, expectedVersion: version }}
            onDone={() => setCountering(false)}
          />
        </div>
      )}
    </div>
  )
}
