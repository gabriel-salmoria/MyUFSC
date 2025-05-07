"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { StudentCourse } from "@/types/student-plan";
import { TIMETABLE } from "@/styles/visualization";
import { useStudentStore } from "@/lib/student-store"; // Import the store

interface TimetableGridProps {
  courseSchedule: Record<
    string,
    Record<
      string,
      {
        courses: {
          course: StudentCourse;
          isConflicting: boolean;
          location?: string;
        }[];
      }
    >
  >;
  // onCourseClick: (course: StudentCourse) => void // REMOVED
  // selectedCourse: StudentCourse | null // REMOVED - Will derive from store
  getCourseColor: (courseId: string) => string;
}

export default function TimetableGrid({
  courseSchedule,
  // onCourseClick, // REMOVED
  // selectedCourse, // REMOVED
  getCourseColor,
}: TimetableGridProps) {
  const { selectedStudentCourse, selectCourse } = useStudentStore(); // Use the store

  // Render a single course cell
  const renderCourseItem = (courseData: any, idx: number) => {
    const location = courseData.location;

    return (
      <div
        key={`${courseData.course.course.id}-${idx}`}
        className={cn(
          CSS_CLASSES.TIMETABLE_COURSE,
          "flex-1 min-w-0",
          courseData.isConflicting && "border-[3px] border-red-600",
          getCourseColor(courseData.course.course.id),
          // Compare with selectedStudentCourse from the store
          selectedStudentCourse?.course.id === courseData.course.course.id &&
            CSS_CLASSES.COURSE_SELECTED,
        )}
        // Use the store action directly
        onClick={() => selectCourse(courseData.course)}
      >
        <div className="flex items-center justify-between">
          {false && (
            <div className={cn(CSS_CLASSES.COURSE_ID, "truncate flex-shrink")}>
              {courseData.course.course.id}
            </div>
          )}
          {location && (
            <div className="text-[0.75rem] ml-0 opacity-90 whitespace-nowrap font-bold">
              {location}
            </div>
          )}
        </div>
        <div className={cn(CSS_CLASSES.COURSE_NAME, "truncate")}>
          {courseData.course.course.name}
        </div>
      </div>
    );
  };

  // Render a table cell for a specific time slot and day
  const renderTimeSlotCell = (slot: any, dayIndex: number) => {
    const cellData = courseSchedule[slot.id]?.[dayIndex];

    if (!cellData?.courses.length) {
      return <td key={dayIndex} className={CSS_CLASSES.TIMETABLE_CELL} />;
    }

    return (
      <td
        key={dayIndex}
        className={cn(
          CSS_CLASSES.TIMETABLE_CELL,
          cellData.courses.length > 1 && "p-0",
        )}
      >
        <div
          className={cn(
            "flex gap-[1px]",
            cellData.courses.length > 1 && "h-full",
          )}
        >
          {cellData.courses.map((courseData, idx) =>
            renderCourseItem(courseData, idx),
          )}
        </div>
      </td>
    );
  };

  return (
    <div className={CSS_CLASSES.TIMETABLE_CONTAINER}>
      <div className="w-full overflow-auto">
        <table className={CSS_CLASSES.TIMETABLE_TABLE}>
          <colgroup>
            <col style={{ width: "80px" }} />
            {TIMETABLE.DAYS.map((_, index) => (
              <col
                key={index}
                style={{ width: `${100 / TIMETABLE.DAYS.length}%` }}
              />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className={CSS_CLASSES.TIMETABLE_HEADER}></th>
              {TIMETABLE.DAYS.map((day, index) => (
                <th key={index} className={CSS_CLASSES.TIMETABLE_HEADER}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {TIMETABLE.TIME_SLOTS.map((slot) => (
              <tr key={slot.id} className="h-14">
                <td className={CSS_CLASSES.TIMETABLE_TIME_CELL}>
                  {slot.label}
                </td>
                {TIMETABLE.DAYS.map((_, dayIndex) =>
                  renderTimeSlotCell(slot, dayIndex),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
