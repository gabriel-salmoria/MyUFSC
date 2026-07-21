/**
 * Remaining-mandatory-course resolution + ordering for the plan generator.
 *
 * We deliberately do NOT re-inline the visualizers' full status engine
 * (`CurriculumVisualizer` / `GridVisualizer`). The engine only needs the
 * terminal-status subset: a curriculum course is already "done" when an
 * equivalent courseId sits in any plan semester with a terminal status. Phase 2
 * (electives) is when a shared `resolveCourseStatus` gets lifted — until then
 * this stays a narrow, single-purpose scan (plan.md §Preprocessing, ~99-106).
 */

import type { Course } from "@/types/curriculum";
import type { StudentPlan } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { computeBlocksCounts } from "@/lib/prerequisites";

/** NFD accent-strip → lower-case → collapse whitespace, for name matching. */
export function normalizeCourseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True for graduation-requirement pseudo-courses that are not schedulable
 * disciplines (e.g. "Atividades Complementares"). These are typed `mandatory`
 * in curriculum JSON but have no class sections and no real phase, so the packer
 * must exclude them: they can be neither scheduled nor sensibly reported as
 * unplaceable. Matched by normalized name (robust across curricula) rather than
 * a "no sections / phase 0" heuristic, which parseCourses makes lossy (it
 * collapses `phase null → 0`, so a real early-phase course and a phase-less
 * pseudo-course become indistinguishable).
 */
export function isNonDisciplineRequirement(course: Course): boolean {
  return normalizeCourseName(course.name).includes("atividades complementares");
}

/**
 * Statuses that mean a course no longer needs to be generated. Note: `planned`
 * is intentionally NOT terminal here (plan.md ~99-102 lists only these three),
 * so a mandatory course the student has merely *planned* is still treated as
 * remaining.
 */
const TERMINAL_STATUSES: ReadonlySet<CourseStatus> = new Set([
  CourseStatus.COMPLETED,
  CourseStatus.EXEMPTED,
  CourseStatus.IN_PROGRESS,
]);

/**
 * A terminal course is fixed history the generator must not touch or re-place
 * (completed / exempted / in-progress). Everything else (planned, failed,
 * pending) is re-placeable — the generator reorganizes the whole future per the
 * maintainer's "reorganize everything" decision, so those are stripped from the
 * working clone and regenerated (see runGreedy) instead of left in place.
 */
export function isTerminalStatus(status: CourseStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Resolve the terminal status of a curriculum course against the plan, matching
 * identity through the (non-transitive) equivalence map. Returns the terminal
 * status if found, otherwise `null` (course still remaining).
 */
export function resolveTerminalStatus(
  course: Course,
  plan: StudentPlan,
  equivMap: Map<string, Set<string>>,
): CourseStatus | null {
  const equivalents = equivMap.get(course.id);

  for (const semester of plan.semesters) {
    for (const sc of semester.courses) {
      const matches = equivalents
        ? equivalents.has(sc.courseId)
        : sc.courseId === course.id;
      if (matches && TERMINAL_STATUSES.has(sc.status)) {
        return sc.status;
      }
    }
  }
  return null;
}

/**
 * Build the ordered list of remaining **mandatory** courses to place.
 *
 * Filter: `type === "mandatory"`, not a non-discipline graduation requirement
 * (see {@link isNonDisciplineRequirement}), and not resolved to a terminal
 * status.
 * Order: `phase` ascending, tie-break by `computeBlocksCounts` descending
 * (courses that unlock more go first → shortens the critical path). A final
 * `id` comparison keeps the sort fully deterministic.
 */
export function buildRemainingCandidates(
  courses: Course[],
  plan: StudentPlan,
  equivMap: Map<string, Set<string>>,
): Course[] {
  const blocks = computeBlocksCounts(courses);

  const remaining = courses.filter(
    (course) =>
      course.type === "mandatory" &&
      !isNonDisciplineRequirement(course) &&
      resolveTerminalStatus(course, plan, equivMap) === null,
  );

  remaining.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    const ba = blocks.get(a.id) ?? 0;
    const bb = blocks.get(b.id) ?? 0;
    if (ba !== bb) return bb - ba;
    return a.id.localeCompare(b.id);
  });

  return remaining;
}
