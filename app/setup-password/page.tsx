import type { Metadata } from "next"
import Link from "next/link"
import { LinkIcon } from "lucide-react"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { SetupPasswordForm } from "./setup-form"

export const metadata: Metadata = { title: "Set your password" }

export default async function SetupPasswordPage({ searchParams }: PageProps<"/setup-password">) {
  const { link } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = data?.claims.email as string | undefined

  if (link === "invalid" || !email) {
    return (
      <AuthShell>
        <div className="space-y-5">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-pending-surface text-pending">
            <LinkIcon className="size-5" />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl">This setup link has expired</h1>
            <p className="text-muted-foreground">
              Setup links work once and expire after 24 hours. Ask the B2B Café organizers to resend your
              invitation, then use the newest email.
            </p>
          </div>
          <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/login" />}>
            Go to sign in
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="space-y-7">
        <div className="space-y-2">
          <h1 className="text-2xl">Choose your password</h1>
          <p className="text-muted-foreground">
            Setting up <span className="font-semibold text-foreground">{email}</span>. You’ll use this email and
            password to sign in.
          </p>
        </div>
        <SetupPasswordForm />
      </div>
    </AuthShell>
  )
}
