// Maps the error codes raised by the database functions to user-facing copy.
const messages: Record<string, string> = {
  not_authorized: "Your session has expired or your company is inactive. Sign in again.",
  not_found: "This negotiation doesn't exist or isn't yours.",
  self_proposal: "You can't propose a meeting to your own company.",
  company_unavailable: "That company isn't available for meetings right now.",
  invalid_slot: "That time isn't a valid event slot. Pick an open 30-minute slot on an event day.",
  message_too_long: "Keep the message under 1,000 characters.",
  thread_exists: "You already have a negotiation with this company.",
  thread_closed: "This negotiation is already closed.",
  stale_offer: "This offer has been replaced by a newer one. The page now shows the latest offer.",
  not_your_turn: "It's the other company's turn to respond.",
  company_conflict: "One of you already has a confirmed meeting at that time. Counter with a different slot.",
  no_table: "Every table is booked at that time. Counter with a different slot.",
  booking_conflict: "Someone booked this time a moment ago. Availability has been refreshed; counter with a different slot.",
}

export function friendlyError(raw: string | undefined) {
  return (raw && messages[raw]) || "Something went wrong. Please try again."
}
