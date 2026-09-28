import { AppShell } from "@/components/app-shell"
import { NAV } from "@/lib/copy"
import { createClient, requireAdmin } from "@/lib/supabase/server"

// Organizer area. Participant users get a 404; RLS limits the data to admins anyway.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin()
  const supabase = await createClient()
  const { count: demo } = await supabase.from("companies").select("*", { count: "exact", head: true }).eq("is_demo", true)
  return (
    <AppShell
      home="/admin"
      who="B2B Café organizers"
      role="Organizer account"
      demo={Boolean(demo)}
      nav={[
        { href: "/admin", label: NAV.dashboard, exact: true },
        { href: "/admin/companies", label: NAV.participants },
        { href: "/admin/meetings", label: NAV.meetings },
        { href: "/admin/tables", label: NAV.tables },
        { href: "/admin/help", label: NAV.help },
      ]}
    >
      {children}
    </AppShell>
  )
}
