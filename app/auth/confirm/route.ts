import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Landing point for account-setup emails. Verifies the one-time token on the
// server, which signs the recipient in, then sends them to choose a password.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null

  if (tokenHash && (type === "invite" || type === "recovery")) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL("/setup-password", url.origin))
  }
  // Expired, already used, or malformed.
  return NextResponse.redirect(new URL("/setup-password?link=invalid", url.origin))
}
