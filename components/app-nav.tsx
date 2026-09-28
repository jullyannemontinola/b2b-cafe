"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export type NavItem = { href: string; label: string; count?: number; exact?: boolean }

// Segmented navigation shared by the participant and organizer shells. A 2×2
// grid on phones so no label is truncated; a single pill row from sm up.
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="grid w-full grid-cols-2 gap-1 rounded-[22px] bg-muted p-1 sm:flex sm:rounded-full md:w-auto">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none md:flex-none",
              active ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count ? (
              <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {item.count}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
