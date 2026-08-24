/**
 * Semester-positional course status.
 *
 * A student is *in* a semester — they don't take individual courses "in
 * progress" scattered across their plan. `StudentInfo.currentPhase` is the one
 * semester the student is currently enrolled in, and everything else follows
 * from where a course sits relative to it:
 *
 * ```
 *   semester <  currentPhase  ->  COMPLETED   (already done)
 *   semester === currentPhase ->  IN_PROGRESS (being taken now)
 *   semester >  currentPhase  ->  PLANNED     (still ahead)
 * ```
 *
 * ## Stored status still wins
 * Derivation only fills in the *absence* of an explicit status. A stored
 * COMPLETED / FAILED / EXEMPTED is an outcome the student (or their transcript)
 * asserted, and it stands wherever the course sits — so a course finished early
 * inside the current semester still reads "concluída", and a reprovada in an
 * earlier semester is never silently promoted to "concluída" by the back-fill.
 * Stored IN_PROGRESS / PLANNED are the manual per-course overrides the details
 * panel writes; they win too.
 *
 * {@link CourseStatus.PENDING} (and the UI-only DEFAULT) mean "no explicit
 * status" — that is what makes a course positional. Courses added by dragging
 * store PENDING for exactly this reason.
 */

import type { StudentCourse, StudentPlan, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";

/**
 * Statuses that are an explicit assertion about a course and therefore override
 * its position: the three real outcomes plus the two manual overrides.
 */
const EXPLICIT_STATUSES: ReadonlySet<CourseStatus> = new Set([
  CourseStatus.COMPLETED,
  CourseStatus.FAILED,
  CourseStatus.EXEMPTED,
  CourseStatus.IN_PROGRESS,
  CourseStatus.PLANNED,
]);

/** True when `status` is an explicit assertion rather than "derive from position". */
export function isExplicitStatus(status: CourseStatus | undefined): boolean {
  return !!status && EXPLICIT_STATUSES.has(status);
}

/**
 * Status a course in `semesterNumber` should render as, given the student's
 * current phase. Explicit stored statuses pass through untouched.
 *
 * `currentPhase < 1` (unknown / not set yet) disables derivation entirely and
 * returns the stored status, so nothing is invented for a profile that has
 * never declared where it is.
 */
export function resolveCourseStatus(
  stored: CourseStatus | undefined,
  semesterNumber: number,
  currentPhase: number,
): CourseStatus {
  if (isExplicitStatus(stored)) return stored!;
  if (!Number.isFinite(currentPhase) || currentPhase < 1) {
    return stored ?? CourseStatus.PENDING;
  }
  if (semesterNumber < currentPhase) return CourseStatus.COMPLETED;
  if (semesterNumber === currentPhase) return CourseStatus.IN_PROGRESS;
  return CourseStatus.PLANNED;
}

/** `resolveCourseStatus` applied to one course, returning a patched copy. */
export function resolveStudentCourse(
  course: StudentCourse,
  semesterNumber: number,
  currentPhase: number,
): StudentCourse {
  const status = resolveCourseStatus(course.status, semesterNumber, currentPhase);
  return status === course.status ? course : { ...course, status };
}

/**
 * Resolve every course in `semesters` against `currentPhase`.
 *
 * Returns the SAME array reference when nothing changed, so callers can keep
 * this inside a `useMemo` without invalidating downstream memos on every
 * render. Same for each untouched semester and course.
 */
export function resolveSemesters(
  semesters: StudentSemester[],
  currentPhase: number,
): StudentSemester[] {
  let changed = false;
  const next = semesters.map((semester) => {
    let semesterChanged = false;
    const courses = semester.courses.map((course) => {
      const resolved = resolveStudentCourse(course, semester.number, currentPhase);
      if (resolved !== course) semesterChanged = true;
      return resolved;
    });
    if (!semesterChanged) return semester;
    changed = true;
    return { ...semester, courses };
  });
  return changed ? next : semesters;
}

/** {@link resolveSemesters} lifted to a whole plan. Reference-stable when a no-op. */
export function resolvePlan(plan: StudentPlan, currentPhase: number): StudentPlan {
  const semesters = resolveSemesters(plan.semesters, currentPhase);
  return semesters === plan.semesters ? plan : { ...plan, semesters };
}

/**
 * Best guess at the phase a legacy plan was sitting in, used once by the persist
 * migration and by the transcript import.
 *
 * Preference order:
 *  1. the highest semester holding a course explicitly marked IN_PROGRESS;
 *  2. otherwise one past the highest semester holding a finished course
 *     (completed / failed / exempted);
 *  3. otherwise 1.
 */
export function inferCurrentPhase(semesters: StudentSemester[]): number {
  let highestInProgress = 0;
  let highestFinished = 0;

  for (const semester of semesters) {
    for (const course of semester.courses) {
      if (course.status === CourseStatus.IN_PROGRESS) {
        highestInProgress = Math.max(highestInProgress, semester.number);
      } else if (
        course.status === CourseStatus.COMPLETED ||
        course.status === CourseStatus.FAILED ||
        course.status === CourseStatus.EXEMPTED
      ) {
        highestFinished = Math.max(highestFinished, semester.number);
      }
    }
  }

  if (highestInProgress > 0) return highestInProgress;
  if (highestFinished > 0) return highestFinished + 1;
  return 1;
}
