/**
 * Curriculum data hygiene: re-tag non-discipline graduation requirements off
 * `mandatory` (issue #11).
 *
 * UFSC curriculum JSON types "Atividades Complementares" as `mandatory`, but it
 * has no class sections and no real phase — it is a graduation requirement, not
 * a schedulable discipline. Consumers (the plan generator, the visualizers) each
 * work around this with the name-based {@link isNonDisciplineRequirement} filter.
 * The cleaner fix is to correct the data at ingestion so every consumer sees the
 * right `type`; the runtime filters then become defense-in-depth, not the source
 * of truth.
 *
 * This module is a pure transform over the raw curriculum `courses` array. It
 * handles both storage shapes: the compact array
 * `[id,name,credits,workload,description,prerequisites,equivalents,type,phase]`
 * (type at index 7) and the object form (`{ type }`). It changes ONLY the `type`
 * of matched rows, is idempotent, and never mutates its input.
 *
 * NOTE: re-tagging to `optional` makes an Atividades Complementares row read as
 * an elective to `isRealElective`. the graduation and elective sections check
 * {@link isNonDisciplineRequirement} first / exclude it, so the hours still
 * bucket as complementares and it is never scheduled as an optativa.
 */

import type { Course } from "@/types/curriculum";
import { isNonDisciplineRequirement } from "@/lib/plan-generator/engine";

/** The type index in the compact-array course encoding. */
const COMPACT_TYPE_INDEX = 7;
/** The name index in the compact-array course encoding. */
const COMPACT_NAME_INDEX = 1;

/** Non-mandatory type a non-discipline requirement is re-tagged to. */
const RETAGGED_TYPE = "optional";

/**
 * Return a copy of `courses` with every non-discipline graduation requirement
 * (e.g. Atividades Complementares) re-tagged from `mandatory` to `optional`.
 * Accepts compact-array or object rows; only the `type` of matched rows changes.
 * Idempotent and non-mutating.
 */
export function retagNonDisciplineRequirements<T = unknown>(courses: T[]): T[] {
  if (!Array.isArray(courses)) return courses;

  return courses.map((row) => {
    if (Array.isArray(row)) {
      const name = String(row[COMPACT_NAME_INDEX] ?? "");
      if (!isNonDisciplineRequirement({ name } as Course)) return row;
      if (row[COMPACT_TYPE_INDEX] === RETAGGED_TYPE) return row; // already correct
      const next = [...row];
      next[COMPACT_TYPE_INDEX] = RETAGGED_TYPE;
      return next as T;
    }

    if (row && typeof row === "object") {
      const obj = row as { name?: string; type?: string };
      if (!isNonDisciplineRequirement({ name: obj.name ?? "" } as Course)) {
        return row;
      }
      if (obj.type === RETAGGED_TYPE) return row;
      return { ...obj, type: RETAGGED_TYPE } as T;
    }

    return row;
  });
}
