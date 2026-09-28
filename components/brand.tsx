import { CoffeeIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground",
        className,
      )}
    >
      <CoffeeIcon className="size-[18px]" strokeWidth={2.25} />
    </span>
  )
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">B2B Café</span>
        {subtitle && <span className="block text-xs font-medium text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  )
}
