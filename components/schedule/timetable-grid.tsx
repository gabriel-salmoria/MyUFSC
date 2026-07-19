"use client";

import React, { useRef } from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { CustomScheduleEntry } from "@/types/student-plan";
import type { ViewStudentCourse } from "@/types/visualization";
import { TIMETABLE } from "@/styles/visualization";
import { useStudentStore } from "@/lib/student-store";
import CustomEventsOverlay from "./custom-events-overlay";

interface TimetableGridProps {
  courseSchedule: Record<
    string,
    Record<
      string,
      {
        courses: {
          course: ViewStudentCourse;
          isConflicting: boolean;
          location?: string;
        }[];
      }
    >
  >;
  // Custom events are drawn as a free-positioned, draggable overlay (not in
  // cells), so they can sit at any time and move across the grid.
  customEntries: CustomScheduleEntry[];
  getCourseColor: (courseId: string) => string;
  onEmptyCellClick: (day: number, slotId: string) => void;
  onCustomEntryClick: (entry: CustomScheduleEntry) => void;
  onCustomEntryMove: (
    entry: CustomScheduleEntry,
    day: number,
    startTime: string,
    endTime: string,
  ) => void;
}

// Memoized so unrelated store updates elsewhere in the app (which don't
// change this specific phase's schedule) don't force a full re-diff of the
// ~84-cell table. Only effective as long as the caller passes stable
// references for courseSchedule/getCourseColor/the click handlers.
const TimetableGrid = React.memo(function TimetableGrid({
  courseSchedule,
  customEntries,
  getCourseColor,
  onEmptyCellClick,
  onCustomEntryClick,
  onCustomEntryMove,
}: TimetableGridProps) {
  const selectedStudentCourse = useStudentStore((s) => s.selectedStudentCourse);
  const selectCourse = useStudentStore((s) => s.selectCourse);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  // Render a single course item inside a cell
  const renderCourseItem = (courseData: any, idx: number) => {
    const location = courseData.location;

    return (
      <div
        key={`${courseData.course.courseId}-${idx}`}
        className={cn(
          CSS_CLASSES.TIMETABLE_COURSE,
          "flex-1 min-w-0",
          courseData.isConflicting && "border-[3px] border-red-600",
          getCourseColor(courseData.course.courseId),
          selectedStudentCourse?.courseId === courseData.course.courseId &&
          CSS_CLASSES.COURSE_SELECTED,
        )}
        onClick={() => selectCourse(courseData.course, courseData.course.course)}
      >
        <div className="flex items-center justify-between">
          {location && (
            <div className="text-[0.75rem] ml-0 opacity-90 whitespace-nowrap font-bold leading-tight">
              {location}
            </div>
          )}
        </div>
        <div className={cn(CSS_CLASSES.COURSE_NAME, "truncate leading-tight")}>
          {courseData.course.course.name}
        </div>
      </div>
    );
  };

  // Render a table cell for a specific time slot and day
  const renderTimeSlotCell = (slot: any, dayIndex: number) => {
    const cellData = courseSchedule[slot.id]?.[dayIndex];
    const hasCourses = !!cellData?.courses.length;

    if (!hasCourses) {
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

    const hasMultiple = cellData.courses.length > 1;

    return (
      <td
        key={dayIndex}
        className={cn(
          CSS_CLASSES.TIMETABLE_CELL,
          hasMultiple && "p-0",
        )}
      >
        {/* Always h-full (not just when hasMultiple): this is what lets
            `.timetable-course`'s own `height: 100%` resolve to something
            concrete, capping course boxes at the row's height instead of
            letting their own content size dictate it. */}
        <div className="flex gap-[1px] h-full">
          {cellData.courses.map((courseData, idx) =>
            renderCourseItem(courseData, idx),
          )}
        </div>
      </td>
    );
  };

  return (
    <div className={CSS_CLASSES.TIMETABLE_CONTAINER}>
      <div className="relative w-full overflow-auto">
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

          <tbody ref={tbodyRef}>
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

        {/* Free-positioned, draggable custom events layer over the grid. */}
        <CustomEventsOverlay
          entries={customEntries}
          tbodyRef={tbodyRef}
          onEntryClick={onCustomEntryClick}
          onEntryMove={onCustomEntryMove}
        />
      </div>
    </div>
  );
});

export default TimetableGrid;
