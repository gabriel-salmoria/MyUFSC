/**
 * Night-turno eligibility with a fixed, id-keyed Saturday exception.
 *
 * "Night only" is already expressed precisely by {@link sectionInTurno} + a
 * `{ night: true }` {@link TurnoFilter}. The one gap is a course whose sole
 * offering is on Saturday morning: `sectionInTurno` rejects it even though a
 * Saturday class never consumes weekday capacity (Saturday is neutral in
 * conflict detection — see {@link stripNeutralDays}). The whitelist below lets
 * such a course through.
 *
 * The whitelist is keyed by course **id**, never by name. Sprint 01/02's
 * name-based sequence matcher matched no real course and silently dropped work
 * (see sprints/02 plan, Defect 2); id-keying makes the SI `INE5638` exception
 * exact and unit-assertable, and lets Sprint 04 extend it (daytime exceptions)
 * without touching the shared conflict util.
 */

import type { Course } from "@/types/curriculum";
import type { Professor } from "@/parsers/class-parser";
import { sectionInTurno, type TurnoFilter } from "@/lib/schedule-conflict";

/**
 * Courses allowed to bypass the night-only turno filter. SI's `INE5638`
 * "Introdução a Projetos" is offered ONLY Saturday morning (verified in the
 * 20262 snapshot); its Saturday cells are stripped as neutral so it consumes no
 * weekday capacity and never conflicts.
 */
export const NIGHT_TURNO_EXCEPTIONS: ReadonlySet<string> = new Set(["INE5638"]);

/**
 * True when a section of `course` is eligible under the turno filter, honoring
 * the whitelist: a whitelisted course passes regardless of its section's turno
 * (by id), otherwise the section must satisfy the normal {@link sectionInTurno}
 * rule. `exceptions` is injectable so tests can supply fixtures and Sprint 04
 * can widen the set without editing the constant.
 */
export function isNightTurnoValid(
  course: Course,
  prof: Professor,
  turno: TurnoFilter,
  exceptions: ReadonlySet<string> = NIGHT_TURNO_EXCEPTIONS,
): boolean {
  return exceptions.has(course.id) || sectionInTurno(prof.slots, turno);
}
