"use client"

import { useTransition } from "react"
import { Loader2Icon, RotateCwIcon } from "lucide-react"
import { toast } from "sonner"
import { retryAccountSetup } from "@/app/admin/actions"
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
          if (r.status === "invite_sent") toast.success("Setup email sent.")
          else toast.error(r.error ?? "Setup didn’t complete.")
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
      {label}
    </Button>
  )
}
