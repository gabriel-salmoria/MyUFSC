// components/visualizers/phase.tsx
"use client";

import { useMemo } from "react";
import type { Phase as PhaseType } from "@/types/curriculum";
import type { Course } from "@/types/curriculum";
import type { StudentCourse } from "@/types/student-plan";
import { COURSE_BOX, PHASE } from "@/styles/visualization";
import { CSS_CLASSES } from "@/styles/course-theme";
import CourseBox from "@/components/visualizers/course-box";
import { getCourseInfo } from "@/lib/parsers/curriculum-parser";

interface PhaseProps {
  phase: PhaseType;
  studentCourses?: StudentCourse[];
  width: number;
  onCourseClick?: (course: Course | StudentCourse) => void;
  onCourseDropped?: (
    course: Course,
    semesterIndex: number,
    position: number,
  ) => void;
  isLastPhase?: boolean; // To know if we need to show the right divider
  isProgressVisualizer?: boolean; // Flag to indicate if we're in progress visualizer
}

export default function Phase({
  phase,
  studentCourses = [],
  width,
  onCourseClick,
  onCourseDropped,
  isLastPhase = false,
  isProgressVisualizer = false,
}: PhaseProps) {
  // Calculate box width based on phase width
  const boxWidth = useMemo(() => {
    return Math.max(COURSE_BOX.MIN_WIDTH, width * COURSE_BOX.WIDTH_FACTOR);
  }, [width]);

  // Calculate horizontal centering offset for the boxes
  const xOffset = useMemo(() => {
    return (width - boxWidth) / 2;
  }, [width, boxWidth]);

  // Determine which courses to display based on mode
  const displayCourses = useMemo(() => {
    return isProgressVisualizer ? studentCourses : phase.courses;
  }, [isProgressVisualizer, studentCourses, phase.courses]);

  // Determine how many ghost boxes to add if we're in progress visualizer
  const ghostBoxCount = useMemo(() => {
    if (!isProgressVisualizer) return 0;

    // If in progress visualizer, add ghost boxes to meet minimum count
    const coursesCount = displayCourses.length;
    return coursesCount >= PHASE.BOXES_PER_COLUMN
      ? 1 // At least one ghost box for adding more
      : PHASE.BOXES_PER_COLUMN - coursesCount;
  }, [displayCourses.length, isProgressVisualizer]);

  return (
    <div
      className="relative h-full border border-border"
      style={{ width: `${width}px` }}
    >
      {/* Phase header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-2 py-3 text-center font-medium border-b border-border">
        Phase {phase.number}
      </div>

      {/* Header divider - separates the phase title from courses */}
      <div className="w-full h-px bg-border" />

      {/* Phase right divider - only if not the last phase */}
      {!isLastPhase && (
        <div className="absolute top-0 right-0 h-full w-px bg-border z-5" />
      )}

      {/* Course boxes - positioned dynamically within the phase */}
      {displayCourses.map((course, index) => {
        // Calculate position directly here instead of using external state
        const position = {
          courseId: course.id,
          x: xOffset,
          y: index * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
          width: boxWidth,
          height: COURSE_BOX.HEIGHT,
        };

        return (
          <CourseBox
            course={course}
            studentCourse={
              isProgressVisualizer ? (course as StudentCourse) : undefined
            }
            position={position}
            isEmpty={false}
            isDraggable={true}
            onClick={() => onCourseClick?.(course)}
          />
        );
      })}
      {/* Add ghost boxes for empty slots if in progress visualizer */}
      {isProgressVisualizer &&
        ghostBoxCount > 0 &&
        Array.from({ length: ghostBoxCount }).map((_, index) => {
          const positionIndex = displayCourses.length + index;
          const position = {
            courseId: `ghost-${phase.number}-${index}`,
            x: xOffset,
            y: positionIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
            width: boxWidth,
            height: COURSE_BOX.HEIGHT,
            isGhost: true,
          };

          return (
            <div
              key={`ghost-${phase.number}-${index}`}
              className="absolute"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
              }}
            >
              <div
                className={CSS_CLASSES.GHOST_BOX}
                style={{
                  width: `${position.width}px`,
                  height: `${position.height}px`,
                  opacity: COURSE_BOX.GHOST_OPACITY,
                }}
                onDragOver={(e) => {
                  // Prevent default to allow drop
                  e.preventDefault();
                  e.currentTarget.classList.add(
                    CSS_CLASSES.GHOST_BOX_DRAG_OVER,
                  );
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove(
                    CSS_CLASSES.GHOST_BOX_DRAG_OVER,
                  );
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove(
                    CSS_CLASSES.GHOST_BOX_DRAG_OVER,
                  );

                  try {
                    // Parse the drop data
                    const data = JSON.parse(
                      e.dataTransfer.getData("application/json"),
                    );

                    if (data.courseId && onCourseDropped) {
                      // Get the course info from the ID
                      const course = getCourseInfo(data.courseId);

                      if (course) {
                        console.log(
                          "Course dropped:",
                          course.id,
                          "to phase:",
                          phase.number,
                          "position:",
                          positionIndex,
                        );

                        // Show success animation
                        const dropTarget = e.currentTarget;
                        dropTarget.classList.add(
                          CSS_CLASSES.GHOST_BOX_DROP_SUCCESS,
                        );
                        setTimeout(() => {
                          dropTarget.classList.remove(
                            CSS_CLASSES.GHOST_BOX_DROP_SUCCESS,
                          );
                        }, 500);

                        // Call onCourseDropped with the target position
                        onCourseDropped(course, phase.number, positionIndex);
                      } else {
                        console.error(
                          "Course not found for ID:",
                          data.courseId,
                        );
                      }
                    } else {
                      console.warn(
                        "Missing courseId in dropped data or onCourseDropped handler",
                      );
                    }
                  } catch (error) {
                    console.error("Error processing drop:", error);
                  }
                }}
                data-semester={phase.number}
                data-position={positionIndex}
              ></div>
            </div>
          );
        })}

      {/* Message for empty phase (when not in progress visualizer) */}
      {!isProgressVisualizer && displayCourses.length === 0 && (
        <div className="flex items-center justify-center h-20 mt-6 text-sm text-muted-foreground">
          No courses in this phase
        </div>
      )}
    </div>
  );
}
