type ThreadReadState = {
  company_a_id: string
  last_activity_at: string
  a_last_read_at: string | null
  b_last_read_at: string | null
}

export function isUnread(t: ThreadReadState, myCompanyId: string) {
  const readAt = t.company_a_id === myCompanyId ? t.a_last_read_at : t.b_last_read_at
  return !readAt || new Date(t.last_activity_at) > new Date(readAt)
}


// One literal (not concatenated) so supabase-js can infer the row type.
export const THREAD_COLUMNS =
  "id, status, current_version, last_activity_at, a_last_read_at, b_last_read_at, company_a_id, company_b_id, company_a:companies!threads_company_a_id_fkey(id, name, logo_url, tier), company_b:companies!threads_company_b_id_fkey(id, name, logo_url, tier), offers(version, proposer_company_id, starts_at, ends_at), meetings(id, starts_at, ends_at, meeting_tables(label))"
