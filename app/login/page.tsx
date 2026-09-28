import type { Metadata } from "next"
import { ExternalLinkIcon } from "lucide-react"
import { AuthShell } from "@/components/auth-shell"
import { EVENT } from "@/lib/copy"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <AuthShell>
      <div className="space-y-7">
        <div className="space-y-2">
          <h1 className="text-[28px] leading-tight">Sign in</h1>
          <p className="text-muted-foreground">Use the account created for your approved organization.</p>
        </div>
        <LoginForm />
        <div className="space-y-1.5 border-t border-border pt-5 text-sm">
          <p className="font-semibold">
            Not registered for B2B Café?{" "}
            <a
              href={EVENT.registrationUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              Register for the event
              <ExternalLinkIcon aria-hidden className="size-3.5" />
              <span className="sr-only">(opens the registration form in a new tab)</span>
            </a>
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Event registration is reviewed by the organizers. Approved participants will receive instructions to access this platform.
          </p>
        </div>
      </div>
    </AuthShell>
  )
}
