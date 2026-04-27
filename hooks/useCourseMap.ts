import { useMemo } from "react";
import { useStudentStore } from "@/lib/student-store";
import type { Course } from "@/types/curriculum";

/**
 * Returns a Map<courseId, Course> built from all curricula in the cache.
 * Memoized — only recomputes when curriculumCache changes.
 */
export function useCourseMap(): Map<string, Course> {
  const curriculumCache = useStudentStore((state) => state.curriculumCache);
  return useMemo(() => {
    const map = new Map<string, Course>();
    for (const curriculum of Object.values(curriculumCache)) {
      for (const course of curriculum.courses) {
        if (course.id) map.set(course.id, course);
      }
    }
    return map;
  }, [curriculumCache]);
}
