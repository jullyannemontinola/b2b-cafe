"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { friendlyError } from "@/lib/errors"

// Thin wrappers: the database functions own every rule. These only forward the
// user's session and translate error codes into copy.

export type ActionResult = { ok: true; threadId?: string } | { ok: false; error: string; code?: string }

function fail(message: string | undefined): ActionResult {
  return { ok: false, error: friendlyError(message), code: message }
}

export async function signIn(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  })
  if (error) return { ok: false, error: "That email and password don't match an account. Check both and try again." }
  redirect("/") // sends admins to /admin and companies to /companies
}

export async function setPassword(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const password = String(form.get("password") ?? "")
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." }
  if (password !== String(form.get("confirm") ?? "")) return { ok: false, error: "The two passwords don't match." }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password") return { ok: false, error: error.message }
    return { ok: false, error: "Your setup session has expired. Ask the organizers to resend your invitation." }
  }
  await supabase.rpc("complete_account_setup")
  redirect("/")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function proposeMeeting(input: {
  targetCompanyId: string
  startsAt: string
  endsAt: string
  message: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("propose_meeting", {
    p_target: input.targetCompanyId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_message: input.message,
  })
  refresh()
  return error ? fail(error.message) : { ok: true, threadId: data }
}

export async function counterOffer(input: {
  threadId: string
  expectedVersion: number
  startsAt: string
  endsAt: string
  message: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("counter_offer", {
    p_thread: input.threadId,
    p_expected_version: input.expectedVersion,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_message: input.message,
  })
  refresh()
  return error ? fail(error.message) : { ok: true }
}

export async function acceptOffer(threadId: string, expectedVersion: number): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("accept_offer", { p_thread: threadId, p_expected_version: expectedVersion })
  refresh()
  return error ? fail(error.message) : { ok: true }
}

export async function declineOffer(threadId: string, expectedVersion: number): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("decline_offer", { p_thread: threadId, p_expected_version: expectedVersion })
  refresh()
  return error ? fail(error.message) : { ok: true }
}

export async function markThreadRead(threadId: string) {
  const supabase = await createClient()
  await supabase.rpc("mark_thread_read", { p_thread: threadId })
  refresh()
}
