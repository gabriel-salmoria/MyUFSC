"use client";

import { useRef, useState, useEffect, useMemo } from "react";

// types
import type { Course, Curriculum } from "@/types/curriculum";
import type { CoursePosition, ViewStudentCourse } from "@/types/visualization";
import type { StudentCourse, StudentInfo } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";

// components
import CourseBox from "@/components/visualizers/course-box";

// prereq helpers
import { useStudentStore } from "@/lib/student-store";
import { checkPrerequisites } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { parsescheduleData } from "@/parsers/class-parser";

// config
import { COURSE_BOX, GRID } from "@/styles/visualization";

interface GridVisualizerProps {
  studentInfo: StudentInfo;
  curriculum: Curriculum | null; // Added curriculum prop
  highlightAvailableForPhase?: number | null;
  height?: number;
  filterOffered?: boolean;
  scheduleData?: any;
}

export default function GridVisualizer({
  studentInfo,
  curriculum, // Added curriculum prop
  highlightAvailableForPhase,
  height = 500,
  filterOffered,
  scheduleData,
}: GridVisualizerProps) {
  const studentStore = useStudentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(800);

  const parsedSchedule = useMemo(() => {
    if (scheduleData) {
      return parsescheduleData(scheduleData);
    }
    return null;
  }, [scheduleData]);

  // Calculate the courses and map from student info and potentially curriculum
  const { curriculumElectiveCourses, studentPlanCourseMap } = useMemo(() => {
    const electiveCourses: Course[] = []; // Array to store elective Course objects
    const map = new Map<string, StudentCourse>(); // Map for all courses in the plan

    // Step 1: Populate map with courses from the student's current plan
    if (studentInfo && studentInfo.currentPlan != null && studentInfo.plans) {
      const currentPlan = studentInfo.plans[studentInfo.currentPlan];

      if (currentPlan && currentPlan.semesters) {
        currentPlan.semesters
          .flatMap((semester) => semester.courses)
          .forEach((sc) => {
            map.set(sc.course.id, sc);
          });
      }
    }

    // Step 2: Get all 'optional' courses from the curriculum
    if (curriculum && curriculum.courses) {
      curriculum.courses.forEach((course) => {
        // Filter out placeholders
        const isPlaceholder =
          /^OPT\d{4}$/.test(course.id) || /^[-.]+$/.test(course.id);

        let isOffered = true;
        if (filterOffered && parsedSchedule) {
          if (!parsedSchedule.professors[course.id]) {
            isOffered = false;
          }
        }

        if (course.type === "optional" && !isPlaceholder && isOffered) {
          electiveCourses.push(course);
        }
      });
    }

    // Return both results
    return {
      curriculumElectiveCourses: electiveCourses, // Source now includes curriculum
      studentPlanCourseMap: map,
    };
  }, [curriculum, studentInfo, filterOffered, parsedSchedule]); // Dependencies include both sources

  // Detect container width
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateContainerWidth();
    const resizeObserver = new ResizeObserver(updateContainerWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate optimal box width and columns
  const { boxWidth, columns } = useMemo(() => {
    const maxPossibleColumns = Math.floor(
      (containerWidth - GRID.PADDING * 2) /
        (COURSE_BOX.MIN_WIDTH + COURSE_BOX.MARGIN),
    );
    const optimalColumns = Math.max(
      GRID.MIN_COLUMNS,
      Math.min(maxPossibleColumns, GRID.MAX_COLUMNS),
    );
    const availableWidth = containerWidth - GRID.PADDING; // Corrected calculation
    const optimalBoxWidth = Math.floor(
      availableWidth / optimalColumns - COURSE_BOX.MARGIN, // Corrected calculation
    );
    return {
      boxWidth: Math.max(COURSE_BOX.MIN_WIDTH, optimalBoxWidth),
      columns: optimalColumns,
    };
  }, [containerWidth]);

  // Calculate positions for each elective course from the curriculumElectiveCourses list
  const positions = useMemo(() => {
    const result: CoursePosition[] = [];
    curriculumElectiveCourses.forEach((course, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = GRID.PADDING + col * (boxWidth + COURSE_BOX.MARGIN); // Corrected calculation
      const y = GRID.PADDING + row * (COURSE_BOX.HEIGHT + COURSE_BOX.MARGIN); // Corrected calculation
      result.push({
        courseId: course.id,
        x,
        y,
        width: boxWidth,
        height: COURSE_BOX.HEIGHT,
      });
    });
    return result;
  }, [curriculumElectiveCourses, columns, boxWidth]);

  // Calculate the total required height
  const totalRows =
    columns > 0 ? Math.ceil(curriculumElectiveCourses.length / columns) : 0;

  const calculatedGridHeight = useMemo(() => {
    if (totalRows === 0) {
      return GRID.PADDING * 2; // Only padding if no courses
    }
    // Height of all boxes + height of all inter-box margins + top/bottom padding
    const heightOfBoxes = totalRows * COURSE_BOX.HEIGHT;
    const heightOfMargins = (totalRows - 1) * COURSE_BOX.MARGIN;
    return GRID.PADDING * 2 + heightOfBoxes + heightOfMargins;
  }, [totalRows, columns]); // Added columns to dependencies as totalRows depends on it

  return (
    <div className="flex flex-col w-full" style={{ height: `${height}px` }}>
      <div
        className="relative flex-1 overflow-auto bg-background"
        ref={containerRef}
      >
        <div
          className="relative dashboard-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: "0 0",
            height: `${calculatedGridHeight}px`,
          }}
        >
          {/* Highlight Overlay */}
          {highlightAvailableForPhase !== undefined &&
            highlightAvailableForPhase !== null && (
              <div className="absolute inset-0 bg-background/80 z-[5] transition-opacity duration-300 pointer-events-none backdrop-blur-[1px]" />
            )}

          {/* Grid of courses */}
          {positions.map((position) => {
            // Find the original curriculum course for this position
            const electiveCourse = curriculumElectiveCourses.find(
              (c) => c.id === position.courseId,
            );
            if (!electiveCourse) return null;

            // Check if this elective is in the student's plan to get its status
            const studentCourseFromPlan = studentPlanCourseMap.get(
              electiveCourse.id,
            );

            let isHighlighted = false;
            let isDimmed = false;

            if (highlightAvailableForPhase != null) {
              const isAlreadyDoneOrPlanned =
                studentCourseFromPlan &&
                studentCourseFromPlan.status !== CourseStatus.DEFAULT;
              if (isAlreadyDoneOrPlanned) {
                isDimmed = true;
              } else {
                const equivalenceMap = generateEquivalenceMap(
                  curriculum?.courses || [],
                );
                const { satisfied } = checkPrerequisites(
                  electiveCourse,
                  highlightAvailableForPhase,
                  studentStore.studentInfo,
                  equivalenceMap,
                );
                isHighlighted = satisfied;
                isDimmed = !satisfied;
              }
            }

            const viewCourse: ViewStudentCourse = studentCourseFromPlan
              ? { ...studentCourseFromPlan, course: electiveCourse, isHighlighted, isDimmed }
              : { course: electiveCourse, status: CourseStatus.DEFAULT, isHighlighted, isDimmed };

            return (
              <CourseBox
                key={`${electiveCourse.id}-${position.x}-${position.y}`}
                position={position}
                isFromCurriculum={true}
                studentCourse={viewCourse}
                isEmpty={false}
                isDraggable={true}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
