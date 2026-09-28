"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

// Switch for the calendar's optional pending layer; the state lives in the URL
// so it survives refreshes and view changes.
export function PendingToggle({ on }: { on: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()

  function toggle() {
    const next = new URLSearchParams(params)
    if (on) next.delete("pending")
    else next.set("pending", "1")
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }))
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      disabled={pending}
      className="flex items-center gap-2.5 rounded-full py-1 pr-1 text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60"
    >
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors duration-150",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow-soft transition-[left] duration-150", on ? "left-[18px]" : "left-0.5")} />
      </span>
      Show pending requests
    </button>
  )
}
