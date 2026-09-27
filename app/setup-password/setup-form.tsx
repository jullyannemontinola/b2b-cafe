"use client"

import { useActionState } from "react"
import { Loader2Icon } from "lucide-react"
import { setPassword } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SetupPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, null)
  const error = state && !state.ok ? state.error : null

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "setup-error" : undefined}
        />
      </div>
      {error && (
        <p id="setup-error" role="alert" className="rounded-xl bg-destructive-surface px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Saving…" : "Save password and continue"}
      </Button>
    </form>
  )
}
