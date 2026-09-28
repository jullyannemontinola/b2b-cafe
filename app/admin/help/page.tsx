import type { Metadata } from "next"
import { HelpPage } from "@/components/help-page"
import { NAV } from "@/lib/copy"
import { requireAdmin } from "@/lib/supabase/server"

// Static title: per-topic titles went stale on in-app topic switches.
export const metadata: Metadata = { title: NAV.help }

export default async function OrganizerHelpPage({ searchParams }: PageProps<"/admin/help">) {
  await requireAdmin()
  return <HelpPage role="organizer" topic={(await searchParams).topic} />
}
