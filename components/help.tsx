"use client"

import { Popover } from "@base-ui/react/popover"
import { CircleHelpIcon, ExternalLinkIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Contextual help: a labelled question-mark button opening a short popover.
// The page underneath stays mounted, so drafts, selected times and scroll
// position are untouched. Focus returns to the button on close. The "Read more"
// link opens a new tab for the same reason.
export function HelpButton({
  title,
  children,
  more,
  className,
}: {
  title: string
  children: React.ReactNode
  more?: string // e.g. "/help?topic=requesting"
  className?: string
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={`Help: ${title}`}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none data-popup-open:bg-secondary data-popup-open:text-primary",
          className,
        )}
      >
        <CircleHelpIcon aria-hidden className="size-[18px]" strokeWidth={2.25} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup className="w-[min(21rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lift transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex items-start justify-between gap-3">
              <Popover.Title className="pt-0.5 font-bold">{title}</Popover.Title>
              <Popover.Close aria-label="Close help" className="-mt-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
                <XIcon aria-hidden className="size-4" />
              </Popover.Close>
            </div>
            <div className="mt-1.5 space-y-2 leading-relaxed text-muted-foreground">{children}</div>
            {more && (
              <a
                href={more}
                target="_blank"
                rel="noopener"
                className="mt-3 inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
              >
                Read more in Help <ExternalLinkIcon aria-hidden className="size-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
