import Link from "next/link"
import { LogOutIcon } from "lucide-react"
import { signOut } from "@/app/actions"
import { AppNav, type NavItem } from "@/components/app-nav"
import { BrandMark } from "@/components/brand"
import { Button } from "@/components/ui/button"

export function AppShell({
  home,
  nav,
  who,
  role,
  children,
}: {
  home: string
  nav: NavItem[]
  who: string
  role: string
  children: React.ReactNode
}) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href={home} className="flex items-center gap-2.5 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
            <BrandMark />
            <span className="text-[15px] font-extrabold tracking-tight">B2B Café</span>
          </Link>
          <form action={signOut} className="ml-auto flex items-center gap-2 md:order-last">
            <span className="hidden max-w-52 text-right leading-tight sm:block">
              <span className="block truncate text-sm font-semibold" title={who}>
                {who}
              </span>
              <span className="block text-xs text-muted-foreground">{role}</span>
            </span>
            <Button variant="outline" size="sm" type="submit" className="rounded-full">
              <LogOutIcon />
              Sign out
            </Button>
          </form>
          <div className="order-last w-full md:order-none md:w-auto">
            <AppNav items={nav} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </>
  )
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="text-[28px] leading-tight sm:text-[34px]">{title}</h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-input bg-card/60 px-6 py-12 text-center">
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}
