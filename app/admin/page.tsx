import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { NAV } from "@/lib/copy"
import { requireAdmin } from "@/lib/supabase/server"
import { Dashboard } from "./dashboard"

export const metadata: Metadata = { title: NAV.dashboard }

// The heading and main action render immediately; the figures stream in.
// A failed query throws to app/admin/error.tsx.
export default async function DashboardPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-tight">{NAV.dashboard}</h1>
        <Button nativeButton={false} render={<Link href="/admin/companies/new" />}>
          <PlusIcon /> Add approved participant
        </Button>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  )
}
