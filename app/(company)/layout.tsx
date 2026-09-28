import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { signOut } from "@/app/actions"
import { createClient, getViewer } from "@/lib/supabase/server"
import { NAV } from "@/lib/copy"
import { isUnread } from "@/lib/threads"

// Participant area. Organizers are sent to their own area; the database
// rejects their participant actions regardless.
export default async function CompanyLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.kind === "admin") redirect("/admin")

  if (viewer.kind === "unlinked") {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-2xl">This login isn’t set up yet</h1>
          <p className="text-muted-foreground">
            It isn’t linked to an organization. Contact the B2B Café organizers to finish setting up your access.
          </p>
          <form action={signOut}>
            <Button variant="outline" size="lg" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </AuthShell>
    )
  }

  const supabase = await createClient()
  const { data: threads } = await supabase
    .from("threads")
    .select("company_a_id, last_activity_at, a_last_read_at, b_last_read_at")
    .or(`company_a_id.eq.${viewer.companyId},company_b_id.eq.${viewer.companyId}`)
  const unread = (threads ?? []).filter((t) => isUnread(t, viewer.companyId)).length
  const { count: demo } = await supabase.from("companies").select("*", { count: "exact", head: true }).eq("is_demo", true)

  return (
    <AppShell
      home="/companies"
      who={viewer.companyName}
      role="Participant"
      demo={Boolean(demo)}
      nav={[
        { href: "/companies", label: NAV.participants },
        { href: "/inbox", label: NAV.requests, count: unread },
        { href: "/agenda", label: NAV.schedule },
        { href: "/help", label: NAV.help },
      ]}
    >
      {children}
    </AppShell>
  )
}
