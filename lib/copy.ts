// User-facing vocabulary in one place. Database names (threads, offers,
// companies) stay as they are; screens map them to these words.

export const NAV = {
  participants: "Participants",
  requests: "Meeting requests",
  schedule: "My schedule",
  help: "Help",
  dashboard: "Dashboard",
  meetings: "Meetings",
  tables: "Tables",
} as const

// Verified from the official event page. Operating hours are deliberately
// absent: the configured 09:00–17:00 window is a prototype placeholder.
export const EVENT = {
  name: "B2B Café",
  hostEvents: "4th IoT Conference Philippines and 1st AI Philippine Expo",
  dates: "November 10–11, 2026",
  venue: "Megatrade Halls, SM Megamall, Mandaluyong City",
  url: "https://jocellebatapasigue.com/b2bcafe/",
  registrationUrl: "https://tally.so/r/PdQyod", // the event page's "Join B2B Café" form
} as const

// No direct organizer contact is published for the event. Set
// ORGANIZER_CONTACT_EMAIL to show one in Help; until then Help links to the
// official event page only.
export function organizerContactEmail() {
  const email = process.env.ORGANIZER_CONTACT_EMAIL?.trim()
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null
}

export type RequestTone = "pending" | "confirmed" | "declined" | "past"

// Status of a meeting request as the signed-in viewer should read it.
// `waitingOn` is the organization that has to respond next; null means the viewer.
export function requestStatus(r: {
  status: "pending" | "confirmed" | "declined"
  waitingOn: string | null
  revised: boolean // the latest time replaced an earlier one
  past?: boolean
}): { tone: RequestTone; label: string } {
  if (r.status === "confirmed") return r.past ? { tone: "past", label: "Completed" } : { tone: "confirmed", label: "Meeting confirmed" }
  if (r.status === "declined") return { tone: "declined", label: "Request declined" }
  if (r.waitingOn) return { tone: "pending", label: `Awaiting ${r.waitingOn}` }
  return { tone: "pending", label: r.revised ? "Alternative time suggested" : "Your response needed" }
}

// Where a meeting takes place, worded for the viewer. Mirrors meeting_host()
// in the database: a Premium organization's dedicated table; if both are
// Premium, the table of the organization that received the first request.
export function venueLine(myTier: string | null | undefined, other: { name: string; tier: string | null }, iSentFirstRequest: boolean) {
  const mine = myTier === "premium"
  const theirs = other.tier === "premium"
  const host = mine && theirs ? (iSentFirstRequest ? "them" : "me") : theirs ? "them" : mine ? "me" : null
  if (host === "them") return `This meeting will take place at ${other.name}’s dedicated table.`
  if (host === "me") return "This meeting will take place at your dedicated table."
  return "This meeting will use a shared table, assigned when it’s confirmed."
}
