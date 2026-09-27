/* eslint-disable @next/next/no-img-element -- local SVG placeholders, no optimisation needed */
import { cn } from "@/lib/utils"

export function CompanyLogo({
  name,
  logoUrl,
  className,
}: {
  name: string
  logoUrl: string | null
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary text-sm font-extrabold text-secondary-foreground",
        className,
      )}
    >
      {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : <span aria-hidden>{initials}</span>}
    </span>
  )
}
