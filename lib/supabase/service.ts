import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

// Privileged client for Auth administration (creating users, sending setup
// emails). Server-only; callers must have verified the signed-in admin first.
export function createServiceClient() {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not configured on the server.")
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
