import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { signOut } from "@/app/actions"
import { createClient, getViewer } from "@/lib/supabase/server"
import { isUnread } from "@/lib/threads"

// Participant area. Organizers are sent to their own area; the database
// rejects their participant actions regardless.
export default async function CompanyLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.kind === "admin") redirect("/admin")

  if (viewer.kind === "inactive") {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-2xl">Your account isn’t active</h1>
          <p className="text-muted-foreground">
            This login isn’t linked to an active company. Contact the B2B Café organizers to restore access.
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

  return (
    <AppShell
      home="/companies"
      who={viewer.companyName}
      role="Participating company"
      nav={[
        { href: "/companies", label: "Directory" },
        { href: "/inbox", label: "Inbox", count: unread },
        { href: "/agenda", label: "Agenda" },
      ]}
    >
      {children}
    </AppShell>
  )
}
