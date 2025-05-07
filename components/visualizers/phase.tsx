// components/visualizers/phase.tsx
"use client";

import { useMemo } from "react";
import type { Course } from "@/types/curriculum";
import type { StudentCourse } from "@/types/student-plan";
import { COURSE_BOX, PHASE } from "@/styles/visualization";
import CourseBox from "@/components/visualizers/course-box";
import GhostCourseBox from "@/components/visualizers/ghost-box";
import { StudentStore } from "@/lib/student-store";
import { useStudentStore } from "@/lib/student-store";

interface PhaseProps {
  semesterNumber: number; // Added
  studentCourses: StudentCourse[]; // Added
  width: number;
  isFromCurriculum?: boolean; // Renamed from isActualSemester
}

export default function Phase({
  semesterNumber,
  studentCourses,
  width,
  isFromCurriculum,
}: PhaseProps) {
  const studentStore = useStudentStore();
  const boxWidth = useMemo(() => {
    return Math.max(COURSE_BOX.MIN_WIDTH, width * COURSE_BOX.WIDTH_FACTOR);
  }, [width]);

  // Calculate horizontal centering offset for the boxes
  const xOffset = useMemo(() => {
    return (width - boxWidth) / 2;
  }, [width, boxWidth]);

  return (
    <div
      className="relative h-full border border-border"
      style={{ width: `${width}px` }}
    >
      {/* Phase header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-2 py-3 text-center font-medium border-b border-border">
        Phase {semesterNumber}
      </div>

      {/* Course boxes - positioned dynamically within the phase */}
      {studentCourses.map((studentCourse: StudentCourse, index) => {
        // Calculate position directly here instead of using external state
        const position = {
          courseId: studentCourse.id, // Use studentCourse ID
          x: xOffset,
          y: index * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
          width: boxWidth,
          height: COURSE_BOX.HEIGHT,
        };

        return (
          <CourseBox
            key={`student-course-${semesterNumber}-${index}`}
            studentCourse={studentCourse} // Pass the StudentCourse object
            position={position}
            isEmpty={false}
            isDraggable={true} // Should be draggable if not empty
            isFromCurriculum={isFromCurriculum}
          />
        );
      })}

      {/* Add ghost boxes for empty slots if it's an actual semester (progress view) */}
      {!isFromCurriculum && Array.from({ length: 6 - studentCourses.length }).map((_, index) => {
          const positionIndex = studentCourses.length + index;
          const position = {
             courseId: `ghost-${semesterNumber}-${positionIndex}`, // Unique ID for ghost
             x: xOffset,
             y: positionIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
             width: boxWidth,
             height: COURSE_BOX.HEIGHT,
             isGhost: true,
           };

          return (
            <GhostCourseBox
              key={`ghost-${semesterNumber}-${positionIndex}`}
              position={position}
              semesterNumber={semesterNumber}
              positionIndex={positionIndex}
              />
          );
        })}
    </div>
  );
}
