import { cache } from "react"
import { createClient } from "@/lib/supabase/server"

// Event rules live in the event_config table (see the migration); the UI reads
// them from there so it can never drift from what the database enforces.
export type EventConfig = {
  timezone: string
  eventDates: string[] // YYYY-MM-DD
  slotMinutes: number
  dayStartMinutes: number // local minutes after midnight, e.g. 540 = 09:00
  dayEndMinutes: number
}

export const getEventConfig = cache(async (): Promise<EventConfig> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("event_config")
    .select("timezone, event_dates, slot_minutes, day_start, day_end")
    .single()
  if (error) throw error
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return {
    timezone: data.timezone,
    eventDates: data.event_dates,
    slotMinutes: data.slot_minutes,
    dayStartMinutes: minutes(data.day_start),
    dayEndMinutes: minutes(data.day_end),
  }
})

export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso))
}

export function formatDay(isoOrDate: string, timeZone: string) {
  // Plain dates are anchored at local noon so the timezone can't shift the day.
  const d = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00+08:00`) : new Date(isoOrDate)
  return new Intl.DateTimeFormat("en-PH", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(d)
}

export function formatRange(startIso: string, endIso: string, timeZone: string) {
  return `${formatTime(startIso, timeZone)} – ${formatTime(endIso, timeZone)}`
}

export function tzLabel(timeZone: string) {
  return timeZone === "Asia/Manila" ? "Philippine time" : timeZone
}

// "Past" is derived from the end time at request time; no background job.
export function isPast(endIso: string) {
  return new Date(endIso).getTime() <= Date.now()
}

// True when the timestamp is more than `days` days ago (request time).
export function olderThanDays(iso: string, days: number) {
  return new Date(iso).getTime() < Date.now() - days * 86_400_000
}

// Local calendar date (YYYY-MM-DD) and minutes after midnight in the event timezone.
export function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}
