"use client"

import { useActionState, useEffect, useState } from "react"
import { CheckIcon, ImageUpIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import type { FormState } from "@/app/admin/actions"
import { tierMeta, TIERS } from "@/components/tier-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Values = Partial<Record<string, string>>

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]

export function CompanyForm({
  mode,
  action,
  initial = {},
  initialLogoUrl = null,
  loginEmail,
}: {
  mode: "create" | "edit"
  action: (state: FormState, form: FormData) => Promise<FormState>
  initial?: Values
  initialLogoUrl?: string | null
  loginEmail?: string
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const values: Values = state?.values ?? initial
  const errors = state?.fieldErrors ?? {}
  const [contactEmail, setContactEmail] = useState(values.contact_email ?? "")
  const [login, setLogin] = useState(values.login_email ?? "")
  const [loginEdited, setLoginEdited] = useState(Boolean(values.login_email))
  const [preview, setPreview] = useState<string | null>(initialLogoUrl)
  const [logoError, setLogoError] = useState<string | null>(null)

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message)
    // React resets the form after a submit, which clears the chosen file.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync preview with that reset
    if (state && !state.ok) setPreview(initialLogoUrl)
  }, [state, initialLogoUrl])

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setLogoError(null)
    if (!file) return setPreview(initialLogoUrl)
    if (!LOGO_TYPES.includes(file.type)) {
      e.target.value = ""
      return setLogoError("Use a PNG, JPEG or WebP image.")
    }
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = ""
      return setLogoError("The logo must be 5 MB or smaller.")
    }
    setPreview(URL.createObjectURL(file))
  }

  const err = (key: string) => errors[key]
  const logoMessage = logoError ?? err("logo")

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state && !state.ok && state.message && (
        <p role="alert" className="rounded-2xl bg-destructive-surface px-4 py-3 text-sm font-medium text-destructive">
          {state.message}
        </p>
      )}

      <Section title="Company details" description="Shown to other participants on the company’s profile.">
        <div className="grid gap-5 @xl:grid-cols-[auto_1fr]">
          <div className="space-y-2">
            <span className="text-sm font-semibold" id="logo-label">
              Logo {mode === "create" && <Required />}
            </span>
            <label
              className={cn(
                "group relative flex size-36 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-3xl border-2 border-dashed text-center transition-colors duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
                logoMessage ? "border-destructive/60 bg-destructive-surface" : "border-input bg-secondary/40 hover:border-primary/60",
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={preview} alt="Logo preview" className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  <ImageUpIcon className="size-6 text-primary" />
                  <span className="px-3 text-xs font-semibold text-muted-foreground">PNG, JPEG or WebP up to 5 MB</span>
                </>
              )}
              {preview && (
                <span className="absolute inset-x-2 bottom-2 rounded-full bg-card/90 py-1 text-xs font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Replace
                </span>
              )}
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
                onChange={onLogo}
                aria-labelledby="logo-label"
                aria-invalid={Boolean(logoMessage)}
                aria-describedby={logoMessage ? "logo-error" : undefined}
                className="sr-only"
              />
            </label>
            {logoMessage && (
              <p id="logo-error" className="max-w-36 text-xs font-medium text-destructive">
                {logoMessage}
              </p>
            )}
          </div>
          <div className="grid gap-4 @md:grid-cols-2">
            <Field name="name" label="Company name" required defaultValue={values.name} error={err("name")} className="@md:col-span-2" />
            <Field name="business_type" label="Business type" required defaultValue={values.business_type} error={err("business_type")} placeholder="e.g. Energy IoT" />
            <Field name="website" label="Website" type="url" defaultValue={values.website} error={err("website")} placeholder="https://" />
            <fieldset className="space-y-2 @md:col-span-2">
              <legend className="mb-2 text-sm font-semibold">
                B2B tier <Required />
              </legend>
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
                {TIERS.map((tier) => (
                  <label
                    key={tier}
                    className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-center text-sm font-semibold text-muted-foreground transition-colors duration-150 has-checked:bg-card has-checked:text-primary has-checked:shadow-soft has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
                  >
                    <input type="radio" name="tier" value={tier} defaultChecked={values.tier === tier} className="peer sr-only" />
                    <CheckIcon className="hidden size-4 peer-checked:block" strokeWidth={3} />
                    {tierMeta[tier].label}
                  </label>
                ))}
              </div>
              {err("tier") && <p className="text-xs font-medium text-destructive">{err("tier")}</p>}
            </fieldset>
          </div>
        </div>
        <div className="grid gap-4 @3xl:grid-cols-3">
          <Area name="description" label="Company description" defaultValue={values.description} error={err("description")} />
          <Area name="products_services" label="Products or services" defaultValue={values.products_services} error={err("products_services")} />
          <Area name="partnership_interests" label="Partnership interests or topics" defaultValue={values.partnership_interests} error={err("partnership_interests")} />
        </div>
      </Section>

      <Section title="Contact person" description="Participants see these details on the profile.">
        <div className="grid gap-4 @2xl:grid-cols-3">
          <Field name="contact_name" label="Full name" required defaultValue={values.contact_name} error={err("contact_name")} />
          <Field
            name="contact_email"
            label="Business email"
            type="email"
            required
            value={contactEmail}
            onChange={(v) => {
              setContactEmail(v)
              if (!loginEdited) setLogin(v)
            }}
            error={err("contact_email")}
          />
          <Field name="contact_phone" label="Contact number" type="tel" required defaultValue={values.contact_phone} error={err("contact_phone")} placeholder="+63 917 555 0100" />
        </div>
      </Section>

      <Section
        title="Platform account"
        description={
          mode === "create"
            ? "We’ll email this address a secure link to set their own password. You never see or set it."
            : "The login email can’t be changed here. It’s separate from the business email above."
        }
      >
        {mode === "create" ? (
          <div className="max-w-md">
            <Field
              name="login_email"
              label="Login email"
              type="email"
              required
              value={login}
              onChange={(v) => {
                setLogin(v)
                setLoginEdited(true)
              }}
              error={err("login_email")}
              hint={loginEdited ? undefined : "Matches the business email until you change it."}
            />
          </div>
        ) : (
          <p className="w-fit rounded-xl bg-muted px-3.5 py-2.5 text-sm font-semibold">{loginEmail ?? "No login yet"}</p>
        )}
      </Section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {mode === "create" ? (pending ? "Registering…" : "Register and send setup email") : pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <fieldset className="panel @container space-y-5 p-5 sm:p-7">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-lg font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </fieldset>
  )
}

function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}

function Field({
  name,
  label,
  required,
  type = "text",
  defaultValue,
  value,
  onChange,
  error,
  hint,
  placeholder,
  className,
}: {
  name: string
  label: string
  required?: boolean
  type?: string
  defaultValue?: string
  value?: string
  onChange?: (v: string) => void
  error?: string
  hint?: string
  placeholder?: string
  className?: string
}) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label} {required ? <Required /> : <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        {...(onChange ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue })}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={`${name}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function Area({ name, label, defaultValue, error }: { name: string; label: string; defaultValue?: string; error?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Textarea id={name} name={name} rows={4} maxLength={2000} defaultValue={defaultValue} aria-invalid={Boolean(error)} />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}
