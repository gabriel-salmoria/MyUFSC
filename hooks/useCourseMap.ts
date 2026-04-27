import { useMemo } from "react";
import { useStudentStore } from "@/lib/student-store";
import type { Course } from "@/types/curriculum";
import { parseCourses } from "@/parsers/curriculum-parser";

/**
 * Returns a Map<courseId, Course> built from all curricula in the cache.
 * Handles both array-format and object-format courses so the map is
 * populated correctly even before CurriculumVisualizer has run generatePhases.
 */
export function useCourseMap(): Map<string, Course> {
  const curriculumCache = useStudentStore((state) => state.curriculumCache);
  return useMemo(() => {
    const map = new Map<string, Course>();
    for (const curriculum of Object.values(curriculumCache)) {
      const courses: Course[] = Array.isArray(curriculum.courses[0])
        ? parseCourses(curriculum.courses as any[])
        : (curriculum.courses as Course[]);
      for (const course of courses) {
        if (course.id) map.set(course.id, course);
      }
    }
    return map;
  }, [curriculumCache]);
}
