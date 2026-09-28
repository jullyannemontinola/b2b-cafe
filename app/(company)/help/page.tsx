import type { Metadata } from "next"
import { HelpPage } from "@/components/help-page"
import { NAV } from "@/lib/copy"
import { requireCompany } from "@/lib/supabase/server"

// Static title: per-topic titles went stale on in-app topic switches.
export const metadata: Metadata = { title: NAV.help }

export default async function ParticipantHelpPage({ searchParams }: PageProps<"/help">) {
  await requireCompany()
  return <HelpPage role="participant" topic={(await searchParams).topic} />
}
