/**
 * Remaining elective (optativas) hours, used as the demand budget for the
 * elective post-pass in `electives.ts`.
 *
 * Pure, side-effect-free — plain `StudentInfo` / `Course[]` in, a
 * {@link GraduationReminder} out. Only COMPLETED / EXEMPTED count (fixed
 * academic history); PLANNED / IN_PROGRESS / FAILED are excluded, since nothing
 * tentative reduces the requirement. Hours per course =
 * `def.workload || def.credits * 18` (18h/credit, matching
 * `curriculum-status.ts`). A real (non-placeholder) elective counts
 * ({@link isRealElective}); mandatory disciplines, generic elective
 * placeholders, and non-discipline requirements do not.
 *
 * ## Caveat on the total (issue: no source in curriculum data)
 * `Curriculum` carries no field for how many elective hours a degree requires,
 * so {@link OPTATIVAS_TOTAL_HOURS} below is a **placeholder**, not a per-degree
 * figure. It is deliberately no longer surfaced to the user as a claim ("ainda
 * faltam Xh") — it only bounds how much the elective fill schedules. A
 * companion "atividades complementares" total used to be computed here purely
 * to render that claim; it was removed with it rather than left as an invented
 * number with no consumer.
 */

import type { Course } from "@/types/curriculum";
import type { StudentInfo } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { isRealElective } from "@/lib/curriculum-status";
import { resolveSemesters } from "@/lib/semester-status";
import { isNonDisciplineRequirement } from "@/lib/plan-generator/candidates";
import type { GraduationReminder } from "@/lib/plan-generator/types";

/**
 * Elective-hours budget the fill aims at. Placeholder — the curriculum data has
 * no per-degree total (see the module doc). Never shown to the user as fact.
 */
const OPTATIVAS_TOTAL_HOURS = 288;

/** Hours credited for a course (18h/credit fallback, matching curriculum-status). */
export function courseHours(def: Course): number {
  return def.workload || def.credits * 18;
}

/**
 * Compute the remaining optativas hours for a student's current plan. Iterates
 * the plan's semesters, and for each COMPLETED/EXEMPTED course that resolves (by
 * exact id) to a curriculum definition, credits its hours. Returns the remainder
 * clamped at a floor of 0, so over-earning reports 0 (never negative).
 */
export function computeGraduationReminder(
  studentInfo: StudentInfo,
  courses: Course[],
): GraduationReminder {
  const courseById = new Map(courses.map((c) => [c.id, c] as const));

  let optativasEarned = 0;

  const plan = studentInfo.plans[studentInfo.currentPlan];
  // Resolve positional status: an elective in a semester before `currentPhase`
  // counts as earned even if the student never explicitly marked it.
  const semesters = plan
    ? resolveSemesters(plan.semesters, studentInfo.currentPhase ?? 0)
    : [];

  for (const semester of semesters) {
    for (const sc of semester.courses) {
      if (
        sc.status !== CourseStatus.COMPLETED &&
        sc.status !== CourseStatus.EXEMPTED
      ) {
        continue;
      }

      const def = courseById.get(sc.courseId);
      if (!def) continue;

      // Non-discipline requirements are excluded FIRST: once Atividades
      // Complementares are re-tagged off `mandatory` at ingestion (issue #11)
      // they read as `optional`, which would otherwise trip `isRealElective` and
      // wrongly credit their hours as optativas. The name-based non-discipline
      // predicate is authoritative and must win regardless of the `type` tag.
      if (isNonDisciplineRequirement(def)) continue;
      if (isRealElective(def)) optativasEarned += courseHours(def);
      // Mandatory disciplines and generic elective placeholders count for
      // nothing here.
    }
  }

  return {
    optativasHours: Math.max(0, OPTATIVAS_TOTAL_HOURS - optativasEarned),
  };
}
