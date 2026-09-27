import { cn } from "@/lib/utils"

const styles = {
  pending: "bg-pending-surface text-pending",
  confirmed: "bg-confirmed-surface text-confirmed",
  declined: "bg-closed-surface text-closed",
  past: "bg-closed-surface text-closed",
  inactive: "bg-closed-surface text-closed",
  active: "bg-confirmed-surface text-confirmed",
  failed: "bg-destructive-surface text-destructive",
  info: "bg-secondary text-secondary-foreground",
} as const

const labels: Partial<Record<keyof typeof styles, string>> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  past: "Completed",
}

export type Status = keyof typeof styles

// Status is always carried by the text; colour only reinforces it.
export function StatusBadge({ status, label, className }: { status: Status; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold",
        styles[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? labels[status]}
    </span>
  )
}

export function UnreadDot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold text-primary", className)}>
      <span aria-hidden className="size-2 rounded-full bg-primary" />
      New
    </span>
  )
}

const accountLabels = {
  pending: ["Not provisioned", "failed"],
  account_created: ["Login created", "pending"],
  invite_sent: ["Invite sent", "info"],
  invite_failed: ["Invite failed", "failed"],
  active: ["Account active", "active"],
} as const

export type AccountStatus = keyof typeof accountLabels

export function AccountBadge({ status }: { status: AccountStatus }) {
  const [label, tone] = accountLabels[status]
  return <StatusBadge status={tone} label={label} />
}
