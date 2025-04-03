"use client"

import React from 'react'
import { cn } from "@/lib/utils"
import { CSS_CLASSES } from "@/styles/course-theme"
import type { StudentCourse } from "@/types/student-plan"
import { TIMETABLE } from "@/styles/visualization"

interface TimetableGridProps {
  courseSchedule: Record<string, Record<string, {
    courses: {
      course: StudentCourse;
      isConflicting: boolean;
      location?: string;
    }[];
  }>>
  onCourseClick: (course: StudentCourse) => void
  selectedCourse: StudentCourse | null
  getCourseColor: (courseId: string) => string
}

export default function TimetableGrid({
  courseSchedule,
  onCourseClick,
  selectedCourse,
  getCourseColor
}: TimetableGridProps) {
  return (
    <div className={CSS_CLASSES.TIMETABLE_CONTAINER}>
      <div className="w-full overflow-auto">
        <table className={CSS_CLASSES.TIMETABLE_TABLE}>
          <colgroup>
            <col style={{ width: '80px' }} />
            {TIMETABLE.DAYS.map((_, index) => (
              <col key={index} style={{ width: `${100 / TIMETABLE.DAYS.length}%` }} />
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
                {/* Time label */}
                <td className={CSS_CLASSES.TIMETABLE_TIME_CELL}>
                  {slot.label}
                </td>
                {/* Course cells */}
                {TIMETABLE.DAYS.map((_, dayIndex) => {
                  const cellData = courseSchedule[slot.id]?.[dayIndex];
                  if (!cellData?.courses.length) return <td key={dayIndex} className={CSS_CLASSES.TIMETABLE_CELL} />;

                  return (
                    <td
                      key={dayIndex}
                      className={cn(
                        CSS_CLASSES.TIMETABLE_CELL,
                        cellData.courses.length > 1 && "p-0" // Remove padding for conflict cells
                      )}
                    >
                      <div className={cn(
                        "flex gap-[1px]",
                        cellData.courses.length > 1 && "h-full"
                      )}>
                        {cellData.courses.map((courseData, idx) => {
                          // Get the location directly from course data
                          const location = courseData.location;
                          
                          return (
                            <div
                              key={`${courseData.course.course.id}-${idx}`}
                              className={cn(
                                CSS_CLASSES.TIMETABLE_COURSE,
                                "flex-1 min-w-0", // Allow shrinking
                                courseData.isConflicting && "border-[3px] border-red-600",
                                getCourseColor(courseData.course.course.id),
                                selectedCourse?.course.id === courseData.course.course.id && CSS_CLASSES.COURSE_SELECTED
                              )}
                              onClick={() => onCourseClick(courseData.course)}
                            >
                              <div className="flex items-center justify-between">
                                <div className={cn(
                                  CSS_CLASSES.COURSE_ID,
                                  "truncate flex-shrink" // Prevent text overflow
                                )}>
                                  {courseData.course.course.id}
                                </div>
                                {location && (
                                  <div className="text-[0.65rem] ml-0 opacity-90 whitespace-nowrap font-medium">
                                    {location}
                                  </div>
                                )}
                              </div>
                              <div className={cn(
                                CSS_CLASSES.COURSE_NAME,
                                "truncate" // Prevent text overflow
                              )}>
                                {courseData.course.course.name}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 