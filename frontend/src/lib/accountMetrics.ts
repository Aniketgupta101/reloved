/** Account / home impact helpers for Reloved Friday metrics. */

/** Minutes of shopping / sourcing avoided per completed Reloved handover. */
export const MINUTES_PER_RELOVED = 45

export function formatTimeSaved(relovedCount: number): { label: string; detail: string } {
  const minutes = Math.max(0, relovedCount) * MINUTES_PER_RELOVED
  if (minutes < 60) {
    return {
      label: `${minutes}m`,
      detail: `${relovedCount} Reloved × ${MINUTES_PER_RELOVED} min`,
    }
  }
  const hours = minutes / 60
  const label =
    hours >= 10 ? `${Math.round(hours)}h` : `${Math.round(hours * 10) / 10}h`
  return {
    label,
    detail: `${relovedCount} Reloved × ${MINUTES_PER_RELOVED} min`,
  }
}

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Consecutive UTC days ending today with at least one give/claim activity. */
export function computeKindnessStreak(dates: Array<string | null | undefined>): number {
  const days = new Set<string>()
  for (const iso of dates) {
    const key = dayKey(iso)
    if (key) days.add(key)
  }
  if (days.size === 0) return 0

  let streak = 0
  const cursor = new Date()
  cursor.setUTCHours(0, 0, 0, 0)

  // Allow streak to start from yesterday if user hasn't acted today yet
  const todayKey = cursor.toISOString().slice(0, 10)
  if (!days.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10)
    if (!days.has(key)) break
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}
