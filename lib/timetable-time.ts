import { TIMETABLE } from "@/styles/visualization";

// ── Timetable time geometry ──────────────────────────────────────────────────
//
// The timetable grid is NOT a uniform 50-min axis: TIMETABLE.TIME_SLOTS are the
// real UFSC class-period start times, with irregular gaps (e.g. the 11:00 → 13:30
// lunch break) rendered as equal-height rows. To let custom events sit at any
// time (not snapped to a slot) and be dragged, we map an "HH:MM" time to a
// fractional ROW position and back, treating each visual row as spanning its
// slot's time range. Callers multiply the row position by the measured row
// height to get a pixel offset — so the overlay stays aligned even if the row
// height changes.

const SLOT_MINUTES: number[] = TIMETABLE.TIME_SLOTS.map((s) => toMinutes(s.id));
const N = SLOT_MINUTES.length;
// The last row has no following slot to bound it — assume a standard 50-min span.
const LAST_SLOT_SPAN = 50;

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

function slotSpan(i: number): [number, number] {
  const start = SLOT_MINUTES[i];
  const end = i < N - 1 ? SLOT_MINUTES[i + 1] : start + LAST_SLOT_SPAN;
  return [start, end];
}

// Minutes → fractional row index (0 = top of first row, N = bottom of grid).
export function minutesToRows(min: number): number {
  if (min <= SLOT_MINUTES[0]) return 0;
  for (let i = 0; i < N; i++) {
    const [start, end] = slotSpan(i);
    if (min < end) return i + (min - start) / (end - start);
  }
  return N;
}

// Fractional row index → minutes (inverse of minutesToRows).
export function rowsToMinutes(rows: number): number {
  const clamped = Math.max(0, Math.min(N, rows));
  const i = Math.min(N - 1, Math.floor(clamped));
  const frac = clamped - i;
  const [start, end] = slotSpan(i);
  return start + frac * (end - start);
}

// Total grid height in row units — i.e. the number of slot rows.
export const TOTAL_ROWS = N;

// The earliest/latest minute the grid can represent (for clamping drags).
export const GRID_START_MIN = SLOT_MINUTES[0];
export const GRID_END_MIN = slotSpan(N - 1)[1];

// Snap a minute value to the nearest `step` minutes (default 5).
export function snapMinutes(min: number, step = 5): number {
  return Math.round(min / step) * step;
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
