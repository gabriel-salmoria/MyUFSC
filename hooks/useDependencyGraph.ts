import { useState, useEffect } from "react";
import type { Course } from "@/types/curriculum";
import { useCourseMap } from "@/hooks/useCourseMap";

export interface Connection {
  from: string;
  to: string;
  depth: number;
  // "prerequisite" = courses the clicked one requires (backward, before it).
  // "dependent" = courses that require the clicked one (forward, after it).
  direction: "prerequisite" | "dependent";
}

export const useDependencyGraph = (
  course: Course | null,
  isVisible: boolean,
) => {
  const courseMap = useCourseMap();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [prerequisiteCourses, setPrerequisiteCourses] = useState<Course[]>([]);
  const [dependentCourses, setDependentCourses] = useState<Course[]>([]);
  const [coursesDepth, setCoursesDepth] = useState<Map<string, number>>(
    new Map(),
  );

  useEffect(() => {
    if (!course || !isVisible) return;

    const newConnections: Connection[] = [];
    // Shared across both directions: a course can't be simultaneously an
    // ancestor and a descendant of the clicked one in an acyclic prereq
    // graph, so ids from the two traversals never collide here.
    const depthMap = new Map<string, number>();

    // ---- Backward: prerequisites this course requires ----
    const prerequisites: Course[] = [];
    const visitedBackward = new Set<string>();

    const findPrerequisites = (currentCourse: Course, depth: number = 0) => {
      if (
        !currentCourse.prerequisites ||
        currentCourse.prerequisites.length === 0
      )
        return;

      currentCourse.prerequisites.forEach((prereqId) => {
        const prereqCourse = courseMap.get(prereqId);
        if (!prereqCourse) return;

        newConnections.push({
          from: currentCourse.id,
          to: prereqCourse.id,
          depth,
          direction: "prerequisite",
        });

        if (
          !visitedBackward.has(prereqCourse.id) ||
          depthMap.get(prereqCourse.id)! > depth + 1
        ) {
          if (!visitedBackward.has(prereqCourse.id)) {
            prerequisites.push(prereqCourse);
          }

          visitedBackward.add(prereqCourse.id);
          depthMap.set(prereqCourse.id, depth + 1);
          findPrerequisites(prereqCourse, depth + 1);
        }
      });
    };

    // ---- Forward: courses that require this one ----
    // Build the reverse index once: courseId -> courses listing it as a prerequisite.
    const requiredBy = new Map<string, Course[]>();
    courseMap.forEach((c) => {
      (c.prerequisites ?? []).forEach((prereqId) => {
        if (!requiredBy.has(prereqId)) requiredBy.set(prereqId, []);
        requiredBy.get(prereqId)!.push(c);
      });
    });

    const dependents: Course[] = [];
    const visitedForward = new Set<string>();

    const findDependents = (currentCourse: Course, depth: number = 0) => {
      const dependentsOfCurrent = requiredBy.get(currentCourse.id);
      if (!dependentsOfCurrent || dependentsOfCurrent.length === 0) return;

      dependentsOfCurrent.forEach((dependentCourse) => {
        newConnections.push({
          from: currentCourse.id,
          to: dependentCourse.id,
          depth,
          direction: "dependent",
        });

        if (
          !visitedForward.has(dependentCourse.id) ||
          depthMap.get(dependentCourse.id)! > depth + 1
        ) {
          if (!visitedForward.has(dependentCourse.id)) {
            dependents.push(dependentCourse);
          }

          visitedForward.add(dependentCourse.id);
          depthMap.set(dependentCourse.id, depth + 1);
          findDependents(dependentCourse, depth + 1);
        }
      });
    };

    findPrerequisites(course);
    findDependents(course);

    setCoursesDepth(depthMap);
    setPrerequisiteCourses(prerequisites);
    setDependentCourses(dependents);
    setConnections(newConnections);
  }, [course, isVisible, courseMap]);

  return {
    connections,
    prerequisiteCourses,
    dependentCourses,
    coursesDepth,
  };
};
