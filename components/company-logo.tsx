/* eslint-disable @next/next/no-img-element -- uploaded logos come from Supabase Storage */
import { cn } from "@/lib/utils"

// Muted, solid avatar colours, chosen away from the tier colours (gold,
// silver-blue, green) so an avatar never reads as a tier. All pass 4.5:1 with
// white initials.
const AVATAR_COLORS = ["#5e4b8b", "#8b4a62", "#9a5436", "#2f6773", "#4a5261", "#6d3f6e", "#7a5b2e", "#3d4f7a"]

// Stable per organization: the same ID always gets the same colour (FNV-1a).
export function avatarColor(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// An uploaded logo when there is one; otherwise a solid colour with initials.
export function CompanyLogo({
  id,
  name,
  logoUrl,
  className,
}: {
  id?: string | null
  name: string
  logoUrl: string | null
  className?: string
}) {
  const initials =
    name
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  return (
    <span
      className={cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold text-white", logoUrl && "border border-border bg-card", className)}
      style={logoUrl ? undefined : { backgroundColor: avatarColor(id ?? name) }}
    >
      {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : <span aria-hidden>{initials}</span>}
    </span>
  )
}
