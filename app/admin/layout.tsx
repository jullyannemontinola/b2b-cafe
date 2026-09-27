import { AppShell } from "@/components/app-shell"
import { requireAdmin } from "@/lib/supabase/server"

// Organizer area. Company users get a 404; RLS limits the data to admins anyway.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin()
  return (
    <AppShell
      home="/admin"
      who="Event organizer"
      role="Admin"
      nav={[
        { href: "/admin", label: "Overview", exact: true },
        { href: "/admin/companies", label: "Companies" },
        { href: "/admin/meetings", label: "Meetings" },
      ]}
    >
      {children}
    </AppShell>
  )
}
