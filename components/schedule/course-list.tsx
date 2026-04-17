"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { StudentCourse } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store"; // Import the store
import { useCourseMap } from "@/hooks/useCourseMap";

interface CourseListProps {
  courses: StudentCourse[];
  getCourseColor: (courseId: string) => string;
}

export default function CourseList({
  courses,
  // onCourseClick, // REMOVED
  getCourseColor,
}: CourseListProps) {
  const selectSchedule = useStudentStore((s) => s.selectSchedule);
  const courseMap = useCourseMap();

  return (
    <div className={CSS_CLASSES.STATS_SECTION}>
      <h3 className="text-sm font-medium mb-2">Disciplinas Atuais</h3>
      <div className={CSS_CLASSES.STATS_GRID}>
        {courses.map((course, idx) => {
          const resolved = courseMap.get(course.courseId);
          return (
          <div
            key={`${course.courseId}-${idx}`}
            className={cn(
              CSS_CLASSES.STATS_COURSE_CARD,
              getCourseColor(course.courseId),
            )}
            onClick={(e) => {
              e.stopPropagation();
              selectSchedule(course, resolved ?? null);
            }}
          >
            <div className={CSS_CLASSES.COURSE_ID}>{course.courseId}</div>
            <div className={CSS_CLASSES.COURSE_NAME}>{resolved?.name ?? course.courseId}</div>
            <div className="mt-1 text-black dark:text-white text-center text-opacity-70 dark:text-opacity-80">
              Créditos: {course.credits}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
