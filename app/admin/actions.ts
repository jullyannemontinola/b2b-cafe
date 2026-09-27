"use server"

import { headers } from "next/headers"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { provisionAccount, type ProvisionResult } from "@/lib/provisioning"
import { createClient, getViewer } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

// Organizer-only actions. Each one re-checks the signed-in user is an admin
// before touching anything; RLS and the DB functions check again.

export type FormState = {
  ok: boolean
  message?: string
  fieldErrors?: Partial<Record<string, string>>
  values?: Record<string, string>
} | null

const TIERS = ["premium", "access", "matching_pool"] as const
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

async function isAdmin() {
  return (await getViewer())?.kind === "admin"
}

async function siteOrigin() {
  const h = await headers()
  return process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? `http://${h.get("host")}`
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim()
}

// Server-side validation of the company fields shared by "add" and "edit".
function readCompany(form: FormData, { withLogin }: { withLogin: boolean }) {
  const values: Record<string, string> = {}
  for (const key of ["name", "contact_email", "contact_name", "contact_phone", "tier", "business_type", "description", "products_services", "partnership_interests", "website", "login_email"]) {
    values[key] = text(form, key)
  }
  const errors: Record<string, string> = {}
  if (!values.name) errors.name = "Enter the company name."
  if (!EMAIL.test(values.contact_email)) errors.contact_email = "Enter a valid business email."
  if (!values.contact_name) errors.contact_name = "Enter the primary contact’s name."
  if (!/^[+\d][\d\s()-]{6,}$/.test(values.contact_phone)) errors.contact_phone = "Enter a contact number, e.g. +63 917 555 0100."
  if (!TIERS.includes(values.tier as (typeof TIERS)[number])) errors.tier = "Choose a B2B tier."
  if (!values.business_type) errors.business_type = "Enter the business type."
  if (values.website && !/^https?:\/\/\S+\.\S+/.test(values.website)) errors.website = "Start the website with https://"
  if (withLogin && !EMAIL.test(values.login_email)) errors.login_email = "Enter a valid login email."
  for (const key of ["description", "products_services", "partnership_interests"]) {
    if (values[key].length > 2000) errors[key] = "Keep this under 2,000 characters."
  }
  return { values, errors }
}

// Checks declared type, size and the file's actual signature bytes.
async function readLogo(form: FormData, required: boolean): Promise<{ file?: File; ext?: string; error?: string }> {
  const file = form.get("logo")
  if (!(file instanceof File) || file.size === 0) return required ? { error: "Upload the company logo." } : {}
  const ext = LOGO_TYPES[file.type]
  if (!ext) return { error: "Use a PNG, JPEG or WebP image." }
  if (file.size > MAX_LOGO_BYTES) return { error: "The logo must be 5 MB or smaller." }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP"
  if (!(isPng || isJpeg || isWebp)) return { error: "That file isn’t a valid PNG, JPEG or WebP image." }
  return { file, ext }
}

async function uploadLogo(file: File, ext: string) {
  const supabase = await createClient()
  const path = `${crypto.randomUUID()}.${ext}`
  // Storage policies only allow admins to write this bucket.
  const { error } = await supabase.storage.from("company-logos").upload(path, file, { contentType: file.type })
  if (error) return { error: "The logo couldn’t be uploaded. Try again." }
  return { path, url: supabase.storage.from("company-logos").getPublicUrl(path).data.publicUrl }
}

const registerErrors: Record<string, [string, string]> = {
  company_exists: ["name", "A company with this name is already registered."],
  login_email_in_use: ["login_email", "This login email already belongs to an account. Use a different one."],
  invalid_email: ["login_email", "Check the business and login email addresses."],
  missing_fields: ["name", "Fill in every required field."],
}

export async function registerCompany(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isAdmin())) return { ok: false, message: "Only organizers can register companies." }

  const { values, errors } = readCompany(form, { withLogin: true })
  const logo = await readLogo(form, true)
  if (logo.error) errors.logo = logo.error
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values, message: "Check the highlighted fields." }

  const uploaded = await uploadLogo(logo.file!, logo.ext!)
  if ("error" in uploaded) return { ok: false, fieldErrors: { logo: uploaded.error }, values }

  const supabase = await createClient()
  const { data: companyId, error } = await supabase.rpc("admin_register_company", {
    p_name: values.name,
    p_contact_email: values.contact_email,
    p_contact_name: values.contact_name,
    p_contact_phone: values.contact_phone,
    p_tier: values.tier as (typeof TIERS)[number],
    p_business_type: values.business_type,
    p_logo_url: uploaded.url,
    p_login_email: values.login_email,
    p_description: values.description,
    p_products_services: values.products_services,
    p_partnership_interests: values.partnership_interests,
    p_website: values.website,
  })
  if (error) {
    await supabase.storage.from("company-logos").remove([uploaded.path])
    const [field, message] = registerErrors[error.message] ?? ["", "The company couldn’t be saved. Try again."]
    return { ok: false, values, message, fieldErrors: field ? { [field]: message } : undefined }
  }

  // The company exists now; provisioning records its own outcome and the
  // detail page shows it (including any failure and a Retry button).
  await provisionAccount(createServiceClient(), companyId, `${await siteOrigin()}/auth/confirm`)
  redirect(`/admin/companies/${companyId}?registered=1`)
}

export async function retryAccountSetup(companyId: string): Promise<ProvisionResult | { status: null; error: string }> {
  if (!(await isAdmin())) return { status: null, error: "Only organizers can do this." }
  const result = await provisionAccount(createServiceClient(), companyId, `${await siteOrigin()}/auth/confirm`)
  refresh()
  return result
}

export async function updateCompany(companyId: string, _: FormState, form: FormData): Promise<FormState> {
  if (!(await isAdmin())) return { ok: false, message: "Only organizers can edit companies." }
  const { values, errors } = readCompany(form, { withLogin: false })
  const logo = await readLogo(form, false)
  if (logo.error) errors.logo = logo.error
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values, message: "Check the highlighted fields." }

  const supabase = await createClient()
  let logoUrl: string | undefined
  if (logo.file) {
    const uploaded = await uploadLogo(logo.file, logo.ext!)
    if ("error" in uploaded) return { ok: false, fieldErrors: { logo: uploaded.error }, values }
    logoUrl = uploaded.url
  }

  const { error } = await supabase
    .from("companies")
    .update({
      name: values.name,
      contact_email: values.contact_email,
      contact_name: values.contact_name,
      contact_phone: values.contact_phone,
      tier: values.tier as (typeof TIERS)[number],
      business_type: values.business_type,
      description: values.description || null,
      products_services: values.products_services || null,
      partnership_interests: values.partnership_interests || null,
      website: values.website || null,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    })
    .eq("id", companyId)
  if (error) {
    const duplicate = error.code === "23505"
    return {
      ok: false,
      values,
      message: duplicate ? "Another company already uses this name." : "The changes couldn’t be saved. Try again.",
      fieldErrors: duplicate ? { name: "Another company already uses this name." } : undefined,
    }
  }
  refresh()
  return { ok: true, message: "Profile saved." }
}

export async function setParticipation(companyId: string, active: boolean) {
  if (!(await isAdmin())) return { ok: false, error: "Only organizers can do this." }
  const supabase = await createClient()
  const { error } = await supabase.from("companies").update({ is_active: active }).eq("id", companyId)
  refresh()
  return error ? { ok: false, error: "The status couldn’t be changed. Try again." } : { ok: true, error: null }
}
