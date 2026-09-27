import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import type { Database } from "@/lib/database.types"

// Always the signed-in user's session: RLS is the security boundary.
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  )
}

// Admins are event organizers with no company; company users belong to exactly
// one company (enforced by a check constraint on app_users).
export type Viewer =
  | { kind: "admin"; userId: string }
  | { kind: "company"; userId: string; companyId: string; companyName: string }
  | { kind: "inactive"; userId: string } // signed in, but no active company or role

// The signed-in user's role, or null when signed out. Cached per request.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return null
  const { data } = await supabase
    .from("app_users")
    .select("company_id, is_admin, companies(name, is_active)")
    .eq("id", userId)
    .maybeSingle()
  if (data?.is_admin) return { kind: "admin", userId }
  if (data?.company_id && data.companies?.is_active) {
    return { kind: "company", userId, companyId: data.company_id, companyName: data.companies.name }
  }
  return { kind: "inactive", userId }
})

export function homeFor(viewer: Viewer | null) {
  if (!viewer) return "/login"
  return viewer.kind === "admin" ? "/admin" : "/companies"
}

// Page-level guards (layouts render in parallel with pages, so pages check too).
export async function requireCompany() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.kind === "admin") redirect("/admin")
  if (viewer.kind !== "company") notFound()
  return viewer
}

export async function requireAdmin() {
  const viewer = await getViewer()
  if (!viewer) redirect("/login")
  if (viewer.kind !== "admin") notFound()
  return viewer
}
