"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import CourseStats from "@/components/course-stats"
import type { StudentInfo, StudentCourse } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"
import scheduleData from "@/data/schedule.json"

// Days of the week
const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

// Time slots
const TIME_SLOTS = [
  { id: "07:30", label: "07:30" },
  { id: "08:20", label: "08:20" },
  { id: "09:10", label: "09:10" },
  { id: "10:10", label: "10:10" },
  { id: "11:00", label: "11:00" },
  { id: "13:30", label: "13:30" },
  { id: "14:20", label: "14:20" },
  { id: "15:10", label: "15:10" },
  { id: "16:20", label: "16:20" },
  { id: "17:10", label: "17:10" },
  { id: "18:30", label: "18:30" },
  { id: "19:20", label: "19:20" },
  { id: "20:20", label: "20:20" },
  { id: "21:10", label: "21:10" },
]

// Color palette for courses
const COURSE_COLORS = [
  "border-blue-400 bg-blue-50",
  "border-yellow-400 bg-yellow-50",
  "border-green-400 bg-green-50",
  "border-purple-400 bg-purple-50",
  "border-cyan-400 bg-cyan-50",
  "border-pink-400 bg-pink-50",
  "border-indigo-400 bg-indigo-50",
  "border-orange-400 bg-orange-50",
];

interface TimetableProps {
  studentInfo: StudentInfo
  onCourseClick?: (course: StudentCourse) => void
}

export default function Timetable({ studentInfo, onCourseClick }: TimetableProps) {
  // Get current courses that are in progress
  const currentCourses = useMemo(() => {
    if (!studentInfo?.currentPlan) return []
    
    return studentInfo.currentPlan.inProgressCourses
  }, [studentInfo])

  // Create a mapping of time slots to courses
  const courseSchedule = useMemo(() => {
    const schedule: Record<string, Record<string, StudentCourse>> = {}
    
    // Initialize empty schedule grid
    TIME_SLOTS.forEach(slot => {
      schedule[slot.id] = {}
    })
    
    // Populate schedule based on scheduleData JSON
    currentCourses.forEach(course => {
      const courseId = course.course.id
      const courseTimes = scheduleData[courseId as keyof typeof scheduleData]
      
      if (!courseTimes || !Array.isArray(courseTimes)) return
      
      courseTimes.forEach((timeEntry: any) => {
        const { day, startTime } = timeEntry
        
        // Find all time slots covered by this course session
        const startTimeIndex = TIME_SLOTS.findIndex(slot => slot.id === startTime)
        if (startTimeIndex === -1) return
        
        // Add course to its time slots
        schedule[startTime][day] = course
        
        // For two-hour classes, find the second hour slot
        if (startTimeIndex + 1 < TIME_SLOTS.length) {
          const nextSlotId = TIME_SLOTS[startTimeIndex + 1].id
          schedule[nextSlotId][day] = course
        }
      })
    })
    
    return schedule
  }, [currentCourses])

  // Create a map of course IDs to color indices
  const courseColorMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    currentCourses.forEach((course, index) => {
      const colorIndex = index % COURSE_COLORS.length;
      colorMap.set(course.course.id, COURSE_COLORS[colorIndex]);
    });
    return colorMap;
  }, [currentCourses]);

  // Get the color for a course based on its index
  const getCourseColor = (courseId: string) => {
    return courseColorMap.get(courseId) || "border-gray-300 bg-gray-50";
  };

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Timetable - 2/3 width */}
      <div className="w-full md:w-2/3 rounded-lg border shadow-sm overflow-hidden">
        <div className="w-full overflow-auto">
          <table className="w-full border-collapse bg-white table-fixed">
            <colgroup>
              <col style={{ width: '80px' }} />
              {DAYS.map((_, index) => (
                <col key={index} style={{ width: `${100 / DAYS.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border bg-gray-100 p-2 font-medium"></th>
                {DAYS.map((day, index) => (
                  <th key={index} className="border bg-gray-100 p-3 text-sm font-bold text-center">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((slot) => (
                <tr key={slot.id} className="h-14">
                  {/* Time label */}
                  <td className="border bg-gray-50 p-2 text-xs font-bold text-center">
                    {slot.label}
                  </td>
                  
                  {/* Course cells for each day */}
                  {DAYS.map((_, dayIndex) => {
                    const courseAtSlot = courseSchedule[slot.id][dayIndex]
                    
                    return (
                      <td 
                        key={`${dayIndex}-${slot.id}`} 
                        className="border p-1"
                      >
                        {courseAtSlot && (
                          <div 
                            className={cn(
                              "border-2 rounded p-1 h-full w-full cursor-pointer",
                              getCourseColor(courseAtSlot.course.id)
                            )}
                            onClick={() => onCourseClick && onCourseClick(courseAtSlot)}
                          >
                            <div className="flex justify-between items-center">
                              <div className="text-xs font-bold">{courseAtSlot.course.id}</div>
                              <div className="text-blue-500">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <line x1="12" y1="8" x2="12" y2="12"></line>
                                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                              </div>
                            </div>
                            <div className="text-xs">
                              {courseAtSlot.course.name}
                            </div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Course Stats Sidebar */}
      <div className="w-full md:w-1/3">
        <CourseStats 
          courses={currentCourses} 
          onCourseClick={onCourseClick}
        />
      </div>
    </div>
  )
}