// Company account provisioning: create the Auth user, link it, send the setup
// email. These are separate external steps, so each one records its outcome in
// company_accounts and the whole thing is safe to re-run ("Retry").
//
// Plain module (no Next imports) so the integration tests can drive it with a
// failing email sender. Only ever call it with a service client after checking
// the signed-in user is an admin.
import type { SupabaseClient } from "@supabase/supabase-js"

export type AccountStatus = "pending" | "account_created" | "invite_sent" | "invite_failed" | "active"

export type SendSetupEmail = (input: {
  email: string
  confirmed: boolean // already verified an earlier link but never set a password
  redirectTo: string
}) => Promise<{ error: string | null }>

// Real sender: a Supabase invite while the address is unconfirmed, otherwise a
// recovery email. Both land on /auth/confirm and then /setup-password.
export function supabaseSender(service: SupabaseClient): SendSetupEmail {
  return async ({ email, confirmed, redirectTo }) => {
    const { error } = confirmed
      ? await service.auth.resetPasswordForEmail(email, { redirectTo })
      : await service.auth.admin.inviteUserByEmail(email, { redirectTo })
    return { error: error?.message ?? null }
  }
}

export type ProvisionResult = { status: AccountStatus; error: string | null }

export async function provisionAccount(
  service: SupabaseClient,
  companyId: string,
  redirectTo: string,
  send: SendSetupEmail = supabaseSender(service),
): Promise<ProvisionResult> {
  const { data: account, error } = await service
    .from("company_accounts")
    .select("login_email, user_id, status")
    .eq("company_id", companyId)
    .single()
  if (error || !account) return { status: "pending", error: "This company has no account record." }
  if (account.status === "active") return { status: "active", error: null }

  const record = async (patch: Record<string, unknown>) => {
    await service.from("company_accounts").update(patch).eq("company_id", companyId)
  }

  // Step 1: the Auth user. Only ever one we created and recorded ourselves.
  let userId: string | null = account.user_id
  if (!userId) {
    const { data: existing } = await service.rpc("auth_user_id_by_email", { p_email: account.login_email })
    if (existing) {
      const message = "A login with this email already exists and isn't linked to this company. Use a different login email."
      await record({ last_error: message })
      return { status: "pending", error: message }
    }
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: account.login_email,
      email_confirm: false,
    })
    if (createError || !created.user) {
      const message = `Couldn't create the login: ${createError?.message ?? "unknown error"}`
      // Only if no concurrent attempt has since recorded its user.
      await service.from("company_accounts").update({ last_error: message }).eq("company_id", companyId).is("user_id", null)
      return { status: "pending", error: message }
    }
    userId = created.user.id
    // Guard against a concurrent retry having recorded a different user.
    const { data: claimed } = await service
      .from("company_accounts")
      .update({ user_id: userId, status: "account_created", last_error: null })
      .eq("company_id", companyId)
      .is("user_id", null)
      .select("company_id")
    if (!claimed?.length) {
      return { status: "pending", error: "Another setup attempt is already in progress. Refresh to see its result." }
    }
  }

  // Step 2: link the login to the company as an ordinary company user.
  const { error: linkError } = await service
    .from("app_users")
    .upsert({ id: userId, company_id: companyId, is_admin: false }, { onConflict: "id", ignoreDuplicates: true })
  const { data: link } = await service.from("app_users").select("company_id, is_admin").eq("id", userId).maybeSingle()
  if (linkError || link?.company_id !== companyId || link.is_admin) {
    const message = "The login couldn't be linked to this company."
    await record({ last_error: message })
    return { status: "account_created", error: message }
  }

  // Step 3: the setup email. "invite_sent" only when the provider accepted it.
  const { data: user } = await service.auth.admin.getUserById(userId)
  const confirmed = Boolean(user?.user?.email_confirmed_at)
  const { error: sendError } = await send({ email: account.login_email, confirmed, redirectTo })
  if (sendError) {
    const message = `The setup email wasn't sent: ${sendError}`
    await record({ status: "invite_failed", last_error: message })
    return { status: "invite_failed", error: message }
  }
  await record({ status: "invite_sent", invite_sent_at: new Date().toISOString(), last_error: null })
  return { status: "invite_sent", error: null }
}
