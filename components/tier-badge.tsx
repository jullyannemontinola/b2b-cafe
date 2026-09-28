import { CrownIcon, LayersIcon, UsersRoundIcon, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// The one place tier names, order and colours are defined.
export const TIERS = ["premium", "access", "matching_pool"] as const
export type Tier = (typeof TIERS)[number]

export const tierMeta: Record<Tier, { label: string; section: string; icon: LucideIcon; badge: string }> = {
  premium: {
    label: "Premium",
    section: "B2B Premium",
    icon: CrownIcon,
    badge: "border-tier-premium-border bg-tier-premium-surface text-tier-premium",
  },
  access: {
    label: "Access",
    section: "B2B Access",
    icon: LayersIcon,
    badge: "border-tier-access-border bg-tier-access-surface text-tier-access",
  },
  matching_pool: {
    label: "Matching Pool",
    section: "B2B Matching Pool",
    icon: UsersRoundIcon,
    badge: "border-tier-pool-border bg-tier-pool-surface text-tier-pool",
  },
}

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value)
}

// Label always visible; icon and colour only reinforce it.
export function TierBadge({ tier, size = "md", className }: { tier: string | null | undefined; size?: "sm" | "md"; className?: string }) {
  const meta = isTier(tier) ? tierMeta[tier] : null
  const Icon = meta?.icon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-bold whitespace-nowrap",
        size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
        meta?.badge ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.25} />}
      {meta?.label ?? "Tier not set"}
    </span>
  )
}
