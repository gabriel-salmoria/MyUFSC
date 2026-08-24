import { TIMETABLE } from "@/styles/visualization";

// ── Timetable time geometry ──────────────────────────────────────────────────
//
// The timetable grid is NOT a uniform time axis: TIMETABLE.TIME_SLOTS are the
// real UFSC class-period start times, and the grid has gaps between them (the
// 11:00 → 13:30 lunch break, the 10:00 → 10:10 breather) that no row
// represents. Anything mapping wall-clock time onto the grid has to respect
// that — see `coveredSlotIndexes`.

const SLOT_MINUTES: number[] = TIMETABLE.TIME_SLOTS.map((s) => toMinutes(s.id));
const N = SLOT_MINUTES.length;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function toHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// A UFSC class period is 50 minutes. A grid row represents exactly that period —
// NOT the span up to the next row. Those differ wherever the timetable has a
// gap: the 11:00 row is the 11:00–11:50 period, and 11:50 → 13:30 is lunch,
// which the grid simply does not represent.
export const PERIOD_MINUTES = 50;

/**
 * Indices of the grid rows that an arbitrary `[startMin, endMin)` interval
 * actually overlaps.
 *
 * Gap-aware, and that is the whole point. Treating the grid as contiguous — as
 * a single absolutely-positioned card spanning from the start row to the end
 * row does — silently swallows the lunch gap: a 10:10–12:20 event looks like it
 * runs to mid-afternoon, because 11:50–12:20 has no rows to occupy and the card
 * stretches across the void anyway. Overlap-testing each row against its real
 * 50-minute period instead means such an event covers the 10:10 and 11:00 rows
 * and stops, and an event living entirely inside a gap covers nothing.
 *
 * The full `[startMin, endMin)` range is still what gets persisted and
 * exported, so an .ics consumer with a continuous time axis renders it whole.
 */
export function coveredSlotIndexes(startMin: number, endMin: number): number[] {
  const covered: number[] = [];
  for (let i = 0; i < N; i++) {
    const slotStart = SLOT_MINUTES[i];
    const slotEnd = slotStart + PERIOD_MINUTES;
    if (startMin < slotEnd && endMin > slotStart) covered.push(i);
  }
  return covered;
}
