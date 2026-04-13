"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { StudentCourse } from "@/types/student-plan";
import type { CustomScheduleEntry } from "@/types/student-plan";
import { TIMETABLE } from "@/styles/visualization";
import { useStudentStore } from "@/lib/student-store";

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
        customEntries: CustomScheduleEntry[];
      }
    >
  >;
  getCourseColor: (courseId: string) => string;
  onEmptyCellClick: (day: number, slotId: string) => void;
  onCustomEntryClick: (entry: CustomScheduleEntry) => void;
}

export default function TimetableGrid({
  courseSchedule,
  getCourseColor,
  onEmptyCellClick,
  onCustomEntryClick,
}: TimetableGridProps) {
  const { selectedStudentCourse, selectCourse } = useStudentStore();

  // Render a single course item inside a cell
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
          selectedStudentCourse?.course.id === courseData.course.course.id &&
          CSS_CLASSES.COURSE_SELECTED,
        )}
        onClick={() => selectCourse(courseData.course)}
      >
        <div className="flex items-center justify-between">
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

  // Render a custom event entry inside a cell
  const renderCustomEntry = (entry: CustomScheduleEntry, idx: number) => (
    <div
      key={`custom-${entry.id}-${idx}`}
      className={cn(
        CSS_CLASSES.TIMETABLE_COURSE,
        "flex-1 min-w-0 cursor-pointer overflow-hidden",
        entry.color,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onCustomEntryClick(entry);
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[0.75rem] opacity-90 truncate font-bold">
          {entry.title}
        </div>
      </div>
      <div className={cn(CSS_CLASSES.COURSE_NAME, "truncate min-h-[1.125rem]")}>
        {entry.subtitle || ""}
      </div>
    </div>
  );

  // Render a table cell for a specific time slot and day
  const renderTimeSlotCell = (slot: any, dayIndex: number) => {
    const cellData = courseSchedule[slot.id]?.[dayIndex];
    const hasCourses = !!cellData?.courses.length;
    const hasCustom = !!cellData?.customEntries.length;

    if (!hasCourses && !hasCustom) {
      return (
        <td
          key={dayIndex}
          className={cn(CSS_CLASSES.TIMETABLE_CELL, "cursor-pointer group")}
          onClick={() => onEmptyCellClick(dayIndex, slot.id)}
        >
          {/* subtle hover indicator */}
          <div className="h-full w-full group-hover:bg-muted/40 rounded transition-colors" />
        </td>
      );
    }

    const hasMultiple =
      cellData.courses.length + cellData.customEntries.length > 1;

    return (
      <td
        key={dayIndex}
        className={cn(
          CSS_CLASSES.TIMETABLE_CELL,
          hasMultiple && "p-0",
        )}
      >
        <div
          className={cn(
            "flex gap-[1px]",
            hasMultiple && "h-full",
          )}
        >
          {cellData.courses.map((courseData, idx) =>
            renderCourseItem(courseData, idx),
          )}
          {cellData.customEntries.map((entry, idx) =>
            renderCustomEntry(entry, idx),
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
