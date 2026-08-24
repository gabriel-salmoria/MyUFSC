/**
 * Tests for the timetable's grid geometry (`lib/timetable-time.ts`), in
 * particular the gap-aware row coverage that decides which cells a custom event
 * occupies.
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { TIMETABLE } from "@/styles/visualization";
import {
  PERIOD_MINUTES,
  coveredSlotIndexes,
  toMinutes,
} from "@/lib/timetable-time";

/** Row index of a slot id, so the assertions read in wall-clock terms. */
function row(slotId: string): number {
  const index = TIMETABLE.TIME_SLOTS.findIndex((s) => s.id === slotId);
  assert.notEqual(index, -1, `no such slot: ${slotId}`);
  return index;
}

/** `coveredSlotIndexes` over an "HH:MM"–"HH:MM" range, as slot ids. */
function covered(start: string, end: string): string[] {
  return coveredSlotIndexes(toMinutes(start), toMinutes(end)).map(
    (i) => TIMETABLE.TIME_SLOTS[i].id,
  );
}

test("a period is 50 minutes, not the distance to the next row", () => {
  // 11:00 → 13:30 are adjacent ROWS but 150 minutes apart; the 11:00 period is
  // still only 11:00–11:50. Conflating the two is what stretched an event
  // across the lunch break.
  assert.equal(PERIOD_MINUTES, 50);
  const gap = toMinutes("13:30") - toMinutes("11:00");
  assert.equal(gap, 150);
});

test("an event running into the lunch gap stops at the last real period", () => {
  // The reported defect: "nomeee 10:10–12:20" was drawn as one card reaching
  // well past 11:00, because 11:50–12:20 falls in the unrepresented gap and the
  // card spanned it anyway. It must cover 10:10 and 11:00 — and nothing else.
  assert.deepEqual(covered("10:10", "12:20"), ["10:10", "11:00"]);
});

test("an event living entirely inside a gap covers no cell at all", () => {
  assert.deepEqual(covered("12:00", "13:00"), []);
  // …and the 10:00–10:10 micro-gap behaves the same way.
  assert.deepEqual(covered("10:00", "10:10"), []);
});

test("coverage is half-open — an event ending exactly on a row start excludes it", () => {
  // 10:10–11:00 fills its own period and must NOT bleed into the 11:00 row.
  assert.deepEqual(covered("10:10", "11:00"), ["10:10"]);
  assert.deepEqual(covered("13:30", "15:10"), ["13:30", "14:20"]);
});

test("a short event inside one period covers exactly that period", () => {
  assert.deepEqual(covered("09:30", "09:40"), ["09:10"]);
  assert.equal(row("09:10"), 2);
});

test("an event spanning a micro-gap covers the periods on both sides", () => {
  // 09:50–10:15 overlaps the 09:10 period (ends 10:00) and the 10:10 one.
  assert.deepEqual(covered("09:50", "10:15"), ["09:10", "10:10"]);
});

test("a full-day event covers every row exactly once", () => {
  const all = covered("00:00", "23:59");
  assert.deepEqual(all, TIMETABLE.TIME_SLOTS.map((s) => s.id));
  assert.equal(new Set(all).size, all.length);
});

test("an empty or inverted range covers nothing", () => {
  assert.deepEqual(covered("10:10", "10:10"), []);
  assert.deepEqual(covered("12:00", "09:00"), []);
});
