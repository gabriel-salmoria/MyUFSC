"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { StudentCourse } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store"; // Import the store

interface CourseListProps {
  courses: StudentCourse[];
  getCourseColor: (courseId: string) => string;
}

export default function CourseList({
  courses,
  // onCourseClick, // REMOVED
  getCourseColor,
}: CourseListProps) {
  const { selectSchedule } = useStudentStore(); // Use the store

  return (
    <div className={CSS_CLASSES.STATS_SECTION}>
      <h3 className="text-sm font-medium mb-2">Current Courses</h3>
      <div className={CSS_CLASSES.STATS_GRID}>
        {courses.map((course) => (
          <div
            key={course.course.id} // Changed key to use course.course.id
            className={cn(
              CSS_CLASSES.STATS_COURSE_CARD,
              getCourseColor(course.course.id),
            )}
            // Use the store action directly
            onClick={(e) => {
              e.stopPropagation(); // Prevent event from bubbling
              selectSchedule(course);
            }}
          >
            <div className={CSS_CLASSES.COURSE_ID}>{course.course.id}</div>
            <div className={CSS_CLASSES.COURSE_NAME}>{course.course.name}</div>
            <div className="mt-1 text-black dark:text-white text-center text-opacity-70 dark:text-opacity-80">
              Credits: {course.course.credits}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
