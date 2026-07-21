/**
 * Shared, pure schedule-conflict helpers.
 *
 * This is the single source of truth for "do two class sections collide?" and
 * "does a section fall inside a turno?". Both the timetable UI
 * (`components/schedule/timetable.tsx`) and the plan-generator engine consume
 * it, so there is exactly one copy of the cell-expansion / overlap math.
 *
 * "Conflict" here means a shared `(day, slotIndex)` grid cell — the exact
 * semantics the timetable already used — not raw interval arithmetic. The cell
 * grid is `TIMETABLE_CONFIG.TIME_SLOTS` from `styles/course-theme.ts`.
 */

import type { ClassSchedule } from "@/parsers/class-parser";
import { TIMETABLE_CONFIG } from "@/styles/course-theme";

const TIME_SLOTS = TIMETABLE_CONFIG.TIME_SLOTS;

/** Turno buckets, derived purely from a slot's start time. */
export type Turno = "morning" | "afternoon" | "night";

/**
 * Turno preference. If every flag is `true` (or every flag is `false`) it is
 * treated as "no preference" — every section is eligible.
 */
export interface TurnoFilter {
  morning: boolean;
  afternoon: boolean;
  night: boolean;
}

/** "HH:MM" -> minutes since midnight. */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Expand a section's slots into the set of `(day, slotIndex)` grid cells it
 * occupies, encoded as `"${day}:${slotIndex}"`.
 *
 * Boundary rule (identical to the former inline logic in `timetable.tsx`):
 *  - the start cell is the slot whose id **exactly equals** `startTime`;
 *    if no slot matches, the slot is skipped;
 *  - the section spans every cell from that start up to (not including) the
 *    first slot whose time is `>= endTime`; if none is `>=`, it runs to the end
 *    of the grid.
 */
export function expandToCells(slots: ClassSchedule[]): Set<string> {
  const cells = new Set<string>();

  for (const slot of slots) {
    const { day, startTime, endTime } = slot;
    if (!endTime) continue;

    const startSlotIndex = TIME_SLOTS.findIndex((s) => s.id === startTime);
    if (startSlotIndex === -1) continue;

    const endSlotIndex = TIME_SLOTS.findIndex((s) => {
      const slotTime = parseInt(s.id.replace(":", ""));
      const eTime = parseInt(endTime.replace(":", ""));
      return slotTime >= eTime;
    });
    const lastSlotIndex = endSlotIndex === -1 ? TIME_SLOTS.length : endSlotIndex;

    for (let i = startSlotIndex; i < lastSlotIndex; i++) {
      cells.add(`${day}:${i}`);
    }
  }

  return cells;
}

/**
 * Grid `day` index for Saturday (0 = Monday … 5 = Saturday). See
 * `class-parser.ts`, which maps MatrUFSC day 7 → 5.
 */
export const SATURDAY_DAY = 5;

/**
 * Drop "neutral" cells that must not participate in conflict detection.
 *
 * Saturday classes are treated as neutral by the plan generator: a Saturday
 * offering never collides with anything, so two courses may share a Saturday
 * slot without the packer flagging a conflict (maintainer decision — Saturday
 * offerings are rare and non-blocking). Returns a new set with every Saturday
 * `"5:<slot>"` cell removed; the timetable UI keeps using the raw cells.
 */
export function stripNeutralDays(cells: Set<string>): Set<string> {
  const prefix = `${SATURDAY_DAY}:`;
  const out = new Set<string>();
  for (const cell of cells) {
    if (!cell.startsWith(prefix)) out.add(cell);
  }
  return out;
}

/** Two sections conflict when their occupied cells intersect. */
export function sectionsConflict(a: Set<string>, b: Set<string>): boolean {
  // Iterate the smaller set for a cheaper intersection test.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const cell of small) {
    if (large.has(cell)) return true;
  }
  return false;
}

/**
 * Bucket a slot by its start time:
 *  - `< 12:00`  -> "morning"
 *  - `12:00-18:00` (exclusive of 18:00) -> "afternoon"
 *  - `>= 18:00` -> "night"
 *
 * Accepts either a raw `"HH:MM"` string or a `TIME_SLOTS` id (same format).
 */
export function turnoOfSlot(slotId: string): Turno {
  const minutes = toMinutes(slotId);
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "night";
}

/**
 * True when a section is eligible under a turno filter.
 *
 * With no preference (all flags true or all false) every section passes.
 * Otherwise **all** of the section's slots must fall inside a selected turno —
 * a section that straddles turnos is excluded.
 */
export function sectionInTurno(
  slots: ClassSchedule[],
  filter: TurnoFilter,
): boolean {
  const { morning, afternoon, night } = filter;
  const noPreference =
    (morning && afternoon && night) ||
    (!morning && !afternoon && !night);
  if (noPreference) return true;

  return slots.every((slot) => filter[turnoOfSlot(slot.startTime)]);
}
