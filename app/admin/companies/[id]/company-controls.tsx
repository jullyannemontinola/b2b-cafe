"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, RotateCwIcon } from "lucide-react"
import { toast } from "sonner"
import { retryAccountSetup, setParticipation } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"

export function SetupButton({ companyId, label }: { companyId: string; label: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="soft"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryAccountSetup(companyId)
          if (r.status === "invite_sent") toast.success("Setup email accepted by the email provider.")
          else toast.error(r.error ?? "Setup didn’t complete.")
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
      {label}
    </Button>
  )
}

export function ParticipationToggle({
  companyId,
  companyName,
  active,
  upcomingMeetings,
}: {
  companyId: string
  companyName: string
  active: boolean
  upcomingMeetings: number
}) {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function apply(next: boolean) {
    start(async () => {
      const r = await setParticipation(companyId, next)
      setConfirming(false)
      if (r.ok) toast.success(next ? "Company reactivated." : "Company deactivated.")
      else toast.error(r.error)
    })
  }

  if (!active) {
    return (
      <Button variant="soft" disabled={pending} onClick={() => apply(true)}>
        {pending && <Loader2Icon className="animate-spin" />}
        Reactivate participation
      </Button>
    )
  }
  if (!confirming) {
    return (
      <Button variant="destructive" disabled={pending} onClick={() => setConfirming(true)}>
        Deactivate participation
      </Button>
    )
  }
  return (
    <div role="alertdialog" aria-label="Confirm deactivation" className="space-y-3 rounded-2xl border-2 border-destructive-border bg-card p-4 text-sm">
      <p className="font-bold text-destructive">Deactivate {companyName}?</p>
      <p>It disappears from the directory and can’t propose, accept or counter, even if already signed in.</p>
      <p>
        {upcomingMeetings > 0
          ? `Its ${upcomingMeetings} upcoming confirmed ${upcomingMeetings === 1 ? "meeting stays" : "meetings stay"} booked and visible in monitoring. Nothing is cancelled automatically; contact the other companies if needed.`
          : "It has no upcoming confirmed meetings."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={pending} onClick={() => apply(false)}>
          {pending && <Loader2Icon className="animate-spin" />}
          Yes, deactivate
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
          Keep active
        </Button>
      </div>
    </div>
  )
}
