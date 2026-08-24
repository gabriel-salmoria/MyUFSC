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
 * ## Only recorded OUTCOMES override position
 * A stored COMPLETED / FAILED / EXEMPTED is something the student (or their
 * transcript) asserted about the course, so it stands wherever the course sits:
 * a course finished early inside the current semester still reads "concluída",
 * and a reprovada in an earlier semester is never silently promoted by the
 * back-fill.
 *
 * `IN_PROGRESS` and `PLANNED` are NOT overrides — they are what the rules above
 * produce, never an input. Anything else means a course keeps a stale status
 * after being dragged to another semester. Every write path therefore stores
 * {@link CourseStatus.PENDING} ("derive me"); see {@link clearDerivedStatus}.
 */

import type { StudentCourse, StudentPlan, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";

/**
 * Statuses that are an assertion about the COURSE and therefore survive
 * wherever it sits: the three real outcomes. Nothing else.
 *
 * `IN_PROGRESS` and `PLANNED` are deliberately absent. They describe a course's
 * position in time, not a fact about it, so they are always derived — a course
 * dragged from the current semester into a future one must stop reading
 * "cursando". They were briefly treated as manual per-course overrides, but no
 * UI creates one any more (the details-panel buttons act on the semester), so
 * every stored occurrence is legacy or generator output. Honouring those made
 * such a course keep a stale status forever, and made it survive a move.
 */
const OUTCOME_STATUSES: ReadonlySet<CourseStatus> = new Set([
  CourseStatus.COMPLETED,
  CourseStatus.FAILED,
  CourseStatus.EXEMPTED,
]);

/** True when `status` is a recorded outcome rather than "derive from position". */
export function isExplicitStatus(status: CourseStatus | undefined): boolean {
  return !!status && OUTCOME_STATUSES.has(status);
}

/**
 * Strip a stored positional status back to `PENDING` so position drives again.
 *
 * Call this anywhere a course is written into a semester — moved, generated,
 * added from a modal, or loaded from a legacy profile. Recorded outcomes and
 * grades pass through untouched.
 */
export function clearDerivedStatus<T extends { status: CourseStatus }>(
  course: T,
): T {
  return isExplicitStatus(course.status)
    ? course
    : { ...course, status: CourseStatus.PENDING };
}

/** Minimum grade that passes a course at UFSC. */
export const PASSING_GRADE = 6.0;

/**
 * Status a course in `semesterNumber` should render as, given the student's
 * current phase and (optionally) its grade. Recorded outcomes pass through
 * untouched.
 *
 * **A grade decides which outcome a finished course got.** Position says
 * *whether* a course is finished; it cannot say whether it was passed. Deriving
 * a bare COMPLETED for everything behind `currentPhase` turned a course the
 * student failed into a green tick the moment its stored FAILED was cleared —
 * by a drag, say. So a past semester resolves through the grade when there is
 * one.
 *
 * The current and future cases ignore the grade on purpose: a failed course
 * dragged forward is being *retaken*, so it reads cursando/planejada, and its
 * old grade is stale rather than wrong.
 *
 * `currentPhase < 1` (unknown / not set yet) disables derivation entirely and
 * returns the stored status, so nothing is invented for a profile that has
 * never declared where it is.
 */
export function resolveCourseStatus(
  stored: CourseStatus | undefined,
  semesterNumber: number,
  currentPhase: number,
  grade?: number,
): CourseStatus {
  if (isExplicitStatus(stored)) return stored!;
  if (!Number.isFinite(currentPhase) || currentPhase < 1) {
    return stored ?? CourseStatus.PENDING;
  }
  if (semesterNumber < currentPhase) {
    return typeof grade === "number" && grade < PASSING_GRADE
      ? CourseStatus.FAILED
      : CourseStatus.COMPLETED;
  }
  if (semesterNumber === currentPhase) return CourseStatus.IN_PROGRESS;
  return CourseStatus.PLANNED;
}

/** `resolveCourseStatus` applied to one course, returning a patched copy. */
export function resolveStudentCourse(
  course: StudentCourse,
  semesterNumber: number,
  currentPhase: number,
): StudentCourse {
  const status = resolveCourseStatus(
    course.status,
    semesterNumber,
    currentPhase,
    course.grade,
  );
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
