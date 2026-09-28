import { createClient } from "@/lib/supabase/server"
import { formatDay, formatRange, formatTime, getEventConfig, tzLabel } from "@/lib/event"

export type Slot = {
  startsAt: string
  endsAt: string
  label: string // "9:00 AM – 9:30 AM"
  startLabel: string // "9:00 AM"
  period: "Morning" | "Afternoon"
  freeTables: number
  dedicated: boolean // a Premium organization's dedicated table hosts this meeting
  // Why the slot can't be chosen right now, or null if it looks open.
  reason: string | null
}

export type SlotDay = { date: string; label: string; slots: Slot[] }

// Advisory availability against a counterpart, for each event day. Acceptance
// re-checks everything in the database, so this is only a guide. Pass the
// request when suggesting another time so a Premium host's table stays the same.
export async function getSlotDays(targetCompanyId: string, threadId?: string) {
  const config = await getEventConfig()
  const supabase = await createClient()
  const now = Date.now()

  const days = await Promise.all(
    config.eventDates.map(async (date): Promise<SlotDay> => {
      const { data, error } = await supabase.rpc("slot_availability", { p_target: targetCompanyId, p_date: date, p_thread: threadId })
      if (error) throw error
      return {
        date,
        label: formatDay(date, config.timezone),
        slots: data.map((s) => ({
          startsAt: s.starts_at,
          endsAt: s.ends_at,
          label: formatRange(s.starts_at, s.ends_at, config.timezone),
          startLabel: formatTime(s.starts_at, config.timezone),
          period: localHour(s.starts_at, config.timezone) < 12 ? "Morning" : "Afternoon",
          freeTables: s.free_tables,
          dedicated: s.dedicated,
          reason:
            new Date(s.starts_at).getTime() <= now
              ? "Time has passed"
              : s.self_busy
                ? "You have a meeting"
                : s.target_busy
                  ? "They have a meeting"
                  : s.table_missing
                    ? "No dedicated table set up"
                    : s.free_tables === 0
                      ? s.dedicated
                        ? "Dedicated table booked"
                        : "No tables available"
                    : null,
        })),
      }
    }),
  )
  return { days, timezoneLabel: tzLabel(config.timezone) }
}

function localHour(iso: string, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)))
}
