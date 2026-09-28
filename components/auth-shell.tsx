import { CalendarDaysIcon, CoffeeIcon, MapPinIcon } from "lucide-react"

// Shared frame for sign-in and account setup: event context on the left, the
// task on the right. Stacks on small screens.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card lg:grid-cols-[1fr_1.05fr]">
        <section className="relative isolate overflow-hidden bg-primary px-6 py-8 text-primary-foreground sm:px-10 sm:py-10 lg:py-12">
          <div className="flex h-full flex-col gap-10 lg:gap-16">
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-white text-primary">
                <CoffeeIcon className="size-[18px]" strokeWidth={2.25} />
              </span>
              <span className="text-[15px] font-extrabold tracking-tight">B2B Café</span>
            </span>
            <div className="space-y-4">
              <h2 className="max-w-sm text-3xl leading-[1.1] sm:text-4xl">Meeting scheduling for B2B Café participants</h2>
              <p className="max-w-sm text-[15px] leading-relaxed text-white/85">
                At the 4th IoT Conference Philippines and the 1st AI Philippine Expo.
              </p>
            </div>
            <ul className="mt-auto flex flex-wrap gap-2 text-sm font-semibold">
              <li className="flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2">
                <CalendarDaysIcon className="size-4" /> November 10–11, 2026
              </li>
              <li className="flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2">
                <MapPinIcon className="size-4" /> Megatrade Halls, SM Megamall
              </li>
            </ul>
          </div>
        </section>
        <section className="flex items-center px-6 py-10 sm:px-12 lg:py-14">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </section>
      </div>
    </main>
  )
}
