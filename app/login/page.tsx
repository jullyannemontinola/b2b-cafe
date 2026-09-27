import type { Metadata } from "next"
import { AuthShell } from "@/components/auth-shell"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-[28px] leading-tight">Welcome back</h1>
          <p className="text-muted-foreground">Sign in with the account the organizers set up for you.</p>
        </div>
        <LoginForm />
        <p className="rounded-2xl bg-muted px-4 py-3.5 text-sm leading-relaxed text-muted-foreground">
          Registration and approval happen separately through the B2B Café organizers. Approved companies receive an
          email to set their password.
        </p>
      </div>
    </AuthShell>
  )
}
