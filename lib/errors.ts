// Maps the error codes raised by the database functions to user-facing copy.
const messages: Record<string, string> = {
  not_authorized: "Your session has ended or your organization isn’t participating. Sign in again.",
  not_found: "This meeting request doesn’t exist or isn’t yours.",
  self_proposal: "You can’t request a meeting with your own organization.",
  company_unavailable: "This organization isn’t available for meetings right now.",
  invalid_slot: "That isn’t an available meeting time. Choose another time.",
  message_too_long: "Keep the message under 1,000 characters.",
  thread_exists: "You already have a meeting request with this organization. Open it from Meeting requests.",
  thread_closed: "This meeting request is already closed.",
  stale_offer: "The other organization has just responded. The page now shows the latest time.",
  not_your_turn: "You’re awaiting the other organization’s response.",
  company_conflict: "You or the other organization already has a confirmed meeting at this time. Suggest another time.",
  no_table: "No tables are available at this time. Suggest another time.",
  no_dedicated_table: "The Premium organization’s dedicated table isn’t set up for this day. Contact the B2B Café organizers.",
  dedicated_table_busy: "The dedicated table for this meeting is already booked at this time. Suggest another time.",
  table_wrong_day: "That table isn’t set up for this day. Contact the B2B Café organizers.",
  booking_conflict: "This time is no longer available. Choose another time.",
}

export function friendlyError(raw: string | undefined) {
  return (raw && messages[raw]) || "Something went wrong. Please try again."
}
