import { Course } from "@/types/curriculum";
import { StudentInfo } from "@/types/student-plan";

export function computeBlocksCounts(courses: Course[]): Map<string, number> {
  const requiredBy = new Map<string, Set<string>>();
  for (const course of courses) {
    if (!requiredBy.has(course.id)) requiredBy.set(course.id, new Set());
    for (const prereqId of (course.prerequisites ?? [])) {
      if (!requiredBy.has(prereqId)) requiredBy.set(prereqId, new Set());
      requiredBy.get(prereqId)!.add(course.id);
    }
  }

  const result = new Map<string, number>();
  for (const course of courses) {
    const blocked = new Set<string>();
    const queue = [...(requiredBy.get(course.id) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (!blocked.has(next)) {
        blocked.add(next);
        for (const dep of (requiredBy.get(next) ?? [])) queue.push(dep);
      }
    }
    result.set(course.id, blocked.size);
  }
  return result;
}

export function checkPrerequisites(
  course: Course,
  targetPhaseNumber: number,
  studentInfo: StudentInfo | null,
  equivalenceMap: Map<string, Set<string>>
): { satisfied: boolean; missing: string[] } {
  if (!studentInfo || studentInfo.currentPlan == null) {
    return { satisfied: true, missing: [] };
  }
  
  if (!course.prerequisites || course.prerequisites.length === 0) {
    return { satisfied: true, missing: [] };
  }

  const plan = studentInfo.plans[studentInfo.currentPlan];
  const missing: string[] = [];

  // Gather all course IDs that the user has placed in semesters PRIOR to targetPhaseNumber
  // We consider courses in phase < targetPhaseNumber to be "planned before".
  const priorCourses = new Set<string>();
  
  plan.semesters.forEach(semester => {
    if (semester.number < targetPhaseNumber) {
      semester.courses.forEach(studentCourse => {
        priorCourses.add(studentCourse.courseId);
      });
    }
  });

  for (const prereqId of course.prerequisites) {
    // Check if prereq directly exists in prior semesters
    let met = priorCourses.has(prereqId);

    // If not, check equivalents of this prereq
    if (!met) {
      const equivalents = equivalenceMap.get(prereqId);
      if (equivalents) {
        for (const eqId of equivalents) {
          if (priorCourses.has(eqId)) {
            met = true;
            break;
          }
        }
      }
    }

    if (!met) {
      missing.push(prereqId);
    }
  }

  return {
    satisfied: missing.length === 0,
    missing
  };
}
