import { Course } from "@/types/curriculum";
import { StudentInfo } from "@/types/student-plan";

/**
 * Build the direct-dependents ("required-by") adjacency: for each course id, the
 * set of course ids that list it as a prerequisite. Shared by
 * {@link computeBlocksCounts} and {@link computeBottleneckWeights} so the graph
 * is built exactly once per call site instead of duplicated.
 */
function buildRequiredBy(courses: Course[]): Map<string, Set<string>> {
  const requiredBy = new Map<string, Set<string>>();
  for (const course of courses) {
    if (!requiredBy.has(course.id)) requiredBy.set(course.id, new Set());
    for (const prereqId of (course.prerequisites ?? [])) {
      if (!requiredBy.has(prereqId)) requiredBy.set(prereqId, new Set());
      requiredBy.get(prereqId)!.add(course.id);
    }
  }
  return requiredBy;
}

/**
 * Transitive dependent count per course: how many downstream courses become
 * unlocked (directly or indirectly) once this course is done. Unchanged public
 * behavior — this is the value the ordering tie-breaks and Task-3 weights reuse.
 */
export function computeBlocksCounts(courses: Course[]): Map<string, number> {
  const requiredBy = buildRequiredBy(courses);

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

/** Per-course bottleneck signal used to prioritize the packing solver. */
export interface BottleneckWeight {
  /**
   * Longest downstream prerequisite chain rooted at this course — the number of
   * future semesters a delay of this course would cascade. `0` for a leaf that
   * unlocks nothing.
   */
  depth: number;
  /** Transitive dependent count (the {@link computeBlocksCounts} value). */
  dependents: number;
  /**
   * Composite priority: `depth * courses.length + dependents`. Depth dominates
   * (scaled past the maximum possible dependent count) so a narrow-but-deep
   * chain root always outranks a wide-but-shallow one; dependents breaks ties.
   */
  weight: number;
}

/**
 * Bottleneck weights for every course. Combines critical-path depth (longest
 * downstream chain, memoized + cycle-guarded) with transitive dependent count.
 * Deterministic and `O(V + E)`.
 */
export function computeBottleneckWeights(
  courses: Course[],
): Map<string, BottleneckWeight> {
  const requiredBy = buildRequiredBy(courses);
  const dependentsCount = computeBlocksCounts(courses);

  // Longest downstream chain per course over the required-by graph, memoized
  // with a cycle guard (a prereq cycle contributes no extra depth).
  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let best = 0;
    for (const dep of requiredBy.get(id) ?? []) {
      best = Math.max(best, 1 + depthOf(dep));
    }
    visiting.delete(id);
    depthMemo.set(id, best);
    return best;
  };

  const scale = courses.length;
  const result = new Map<string, BottleneckWeight>();
  for (const id of requiredBy.keys()) {
    const depth = depthOf(id);
    const dependents = dependentsCount.get(id) ?? 0;
    result.set(id, { depth, dependents, weight: depth * scale + dependents });
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
