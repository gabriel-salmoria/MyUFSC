"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { CustomScheduleEntry } from "@/types/student-plan";
import type { ViewStudentCourse } from "@/types/visualization";
import { TIMETABLE } from "@/styles/visualization";
import { useStudentStore } from "@/lib/student-store";

interface CellCourse {
  course: ViewStudentCourse;
  isConflicting: boolean;
  location?: string;
}

interface CellCustomEntry {
  entry: CustomScheduleEntry;
}

interface TimetableGridProps {
  courseSchedule: Record<
    string,
    Record<
      string,
      { courses: CellCourse[]; customEntries: CellCustomEntry[] }
    >
  >;
  getCourseColor: (courseId: string) => string;
  onEmptyCellClick: (day: number, slotId: string) => void;
  onCustomEntryClick: (entry: CustomScheduleEntry) => void;
}

// Memoized so unrelated store updates elsewhere in the app (which don't
// change this specific phase's schedule) don't force a full re-diff of the
// ~84-cell table. Only effective as long as the caller passes stable
// references for courseSchedule/getCourseColor/the click handlers.
const TimetableGrid = React.memo(function TimetableGrid({
  courseSchedule,
  getCourseColor,
  onEmptyCellClick,
  onCustomEntryClick,
}: TimetableGridProps) {
  const selectedStudentCourse = useStudentStore((s) => s.selectedStudentCourse);
  const selectCourse = useStudentStore((s) => s.selectCourse);

  // Render a single course item inside a cell
  const renderCourseItem = (courseData: CellCourse, idx: number) => {
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

  // A custom event occupies whole cells, like a class section.
  //
  // Title only — deliberately ONE line, in every covered cell including the
  // first. An extra time line made the starting box taller, and because an HTML
  // table row shares a single height across all its cells, that one box
  // stretched its entire row: the event's first block came out visibly bigger
  // than its own continuation blocks and than the courses beside it. The full
  // range lives in the tooltip and in the edit modal instead.
  const renderCustomEntry = ({ entry }: CellCustomEntry) => (
    <div
      key={entry.id}
      role="button"
      tabIndex={0}
      className={cn(
        CSS_CLASSES.TIMETABLE_COURSE,
        "flex-1 min-w-0 cursor-pointer",
        entry.color,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onCustomEntryClick(entry);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCustomEntryClick(entry);
        }
      }}
      title={`${entry.title} · ${entry.startTime}–${entry.endTime}${
        entry.subtitle ? ` · ${entry.subtitle}` : ""
      }`}
    >
      <div className="text-[0.75rem] font-bold leading-tight truncate">
        {entry.title}
      </div>
    </div>
  );

  // Render a table cell for a specific time slot and day
  const renderTimeSlotCell = (slot: { id: string }, dayIndex: number) => {
    const cellData = courseSchedule[slot.id]?.[dayIndex];
    const courses = cellData?.courses ?? [];
    const customEntries = cellData?.customEntries ?? [];
    const isEmpty = courses.length === 0 && customEntries.length === 0;

    if (isEmpty) {
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

    return (
      <td key={dayIndex} className={cn(CSS_CLASSES.TIMETABLE_CELL, "p-0")}>
        {/*
          `absolute inset-0` (the cell is already `position: relative`) is what
          gives this wrapper a DEFINITE height — the row's — instead of one
          derived from its own content. That matters because
          `.timetable-course` sizes itself with `height: 100%`, and a
          percentage height against a content-sized parent resolves to `auto`.
          The practical effect was that a box's height came from its text: a
          two-line course filled its row while a one-line custom event sat
          short inside it, so the two never matched.

          Taking the boxes out of flow also pins every row to the `h-14` on the
          <tr>, so content can no longer stretch a row (HTML table rows share
          one height across all their cells).

          Padding moves from the cell to this wrapper so the boxes keep their
          inset while still measuring against the full cell. Classes and custom
          events share the width when they collide, so neither hides the other.
        */}
        <div className="absolute inset-0 flex gap-[1px] p-1">
          {courses.map((courseData, idx) => renderCourseItem(courseData, idx))}
          {customEntries.map((item) => renderCustomEntry(item))}
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
});

export default TimetableGrid;
