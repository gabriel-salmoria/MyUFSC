import type { Course } from "@/types/curriculum";
import type { StudentCourse, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";

/**
 * Resolved status entry for a single curriculum course, keyed by course id.
 */
export interface CurriculumStatusEntry {
  status: CourseStatus;
  grade?: number;
  studentCourse?: StudentCourse;
}

/**
 * Safely determine if a course definition is optional (an elective).
 * Preserves the historical `false`/`"false"` type coercion.
 */
export function isDefOptional(def: Course): boolean {
  return (
    def.type === "optional" ||
    (def as any).type === false ||
    String((def as any).type).toLowerCase() === "false"
  );
}

/**
 * Determine if a course is a generic elective placeholder (optativa) in the
 * curriculum — i.e. a slot, not a real course the student can take.
 * It's a placeholder if its ID contains "OPT" or its name is literally
 * "Optativa...".
 */
export function isGenericPlaceholder(def: Course): boolean {
  // It must be an elective
  if (!isDefOptional(def)) return false;
  // It's a placeholder if its ID contains "OPT" or its name is literally "Optativa..."
  const hasOptInId = /OPT/i.test(def.id);
  const hasOptInName = /optativa/i.test(def.name || "");

  return hasOptInId || hasOptInName;
}

/**
 * Predicate: is this course a genuine (non-placeholder) elective — an elective
 * course a student actually takes, as opposed to a generic curriculum slot.
 */
export function isRealElective(course: Course): boolean {
  return isDefOptional(course) && !isGenericPlaceholder(course);
}

/**
 * Core curriculum status engine (extracted verbatim from
 * `CurriculumVisualizer`'s `mappedCurriculumCourses` memo).
 *
 * Named courses resolve their status via equivalence-set lookup against the
 * student's plan; generic elective placeholders (`id` contains `"OPT"` or name
 * contains `"optativa"`) consume from per-status `optionalPools` via greedy
 * credit-accounting (not identity-matching) — modelling UFSC's "any elective
 * fills the slot" rule.
 *
 * This is a behavior-identical move: the placeholder regex, the `false`/`"false"`
 * type coercion, and the pool-draining order (COMPLETED → IN_PROGRESS → PLANNED,
 * courses sorted by phase) are all preserved exactly.
 */
export function computeCurriculumStatusMap(
  courses: Course[],
  semesters: StudentSemester[],
  equivalenceMap: Map<string, Set<string>>,
): Map<string, CurriculumStatusEntry> {
  const optionalPools = {
    [CourseStatus.COMPLETED]: 0,
    [CourseStatus.IN_PROGRESS]: 0,
    [CourseStatus.PLANNED]: 0,
  };

  const allStudentCourses = semesters.flatMap((s) => s.courses);

  // Sum up optional hours from the student's progress strictly based on the current curriculum's rules
  allStudentCourses.forEach((sc) => {
    // Lookup how THIS specific curriculum classifies the course the student took
    const curriculumDef = courses.find((c) => c.id === sc.courseId);

    // A course is a valid elective (Optativa) if it exists in the curriculum as 'optional'
    // and is NOT a generic placeholder itself
    if (curriculumDef && isRealElective(curriculumDef)) {
      // UFSC usually counts 18h per credit
      const hours =
        curriculumDef.workload ||
        (curriculumDef.credits ? curriculumDef.credits * 18 : 0);

      if (
        sc.status === CourseStatus.COMPLETED ||
        sc.status === CourseStatus.EXEMPTED
      ) {
        optionalPools[CourseStatus.COMPLETED] += hours;
      } else if (sc.status === CourseStatus.IN_PROGRESS) {
        optionalPools[CourseStatus.IN_PROGRESS] += hours;
      } else if (sc.status === CourseStatus.PLANNED) {
        optionalPools[CourseStatus.PLANNED] += hours;
      }
    }
  });

  const statusMap = new Map<string, CurriculumStatusEntry>();
  const sortedCurriculumCourses = [...courses].sort(
    (a, b) => a.phase - b.phase,
  );

  sortedCurriculumCourses.forEach((course) => {
    let status = CourseStatus.DEFAULT;
    let grade: number | undefined = undefined;
    let matchedStudentCourse: StudentCourse | undefined = undefined;

    const equivalents = equivalenceMap.get(course.id);

    // Generic curriculum placeholders (like "Optativa I" or "OPT0004")
    if (isGenericPlaceholder(course)) {
      // Optional courses map strictly greedily via their explicit workload limits, left-to-right (1st semester -> nth semester)
      const courseHours =
        course.workload || (course.credits ? course.credits * 18 : 72);

      if (optionalPools[CourseStatus.COMPLETED] >= courseHours) {
        optionalPools[CourseStatus.COMPLETED] -= courseHours;
        status = CourseStatus.COMPLETED;
      } else if (optionalPools[CourseStatus.IN_PROGRESS] >= courseHours) {
        optionalPools[CourseStatus.IN_PROGRESS] -= courseHours;
        status = CourseStatus.IN_PROGRESS;
      } else if (optionalPools[CourseStatus.PLANNED] >= courseHours) {
        optionalPools[CourseStatus.PLANNED] -= courseHours;
        status = CourseStatus.PLANNED;
      }
    } else {
      // Standard courses check via exact Match or Equivalence rules
      const matchingStudentCourse = allStudentCourses.find((sc) =>
        equivalents ? equivalents.has(sc.courseId) : sc.courseId === course.id,
      );

      if (matchingStudentCourse) {
        status = matchingStudentCourse.status;
        grade = matchingStudentCourse.grade;
        matchedStudentCourse = matchingStudentCourse;
      }
    }

    statusMap.set(course.id, {
      status,
      grade,
      studentCourse: matchedStudentCourse,
    });
  });

  return statusMap;
}
