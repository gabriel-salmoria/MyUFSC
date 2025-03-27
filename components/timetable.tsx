"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import CourseStats from "@/components/course-stats"
import type { Course } from "@/types/curriculum"
import type { StudentInfo, StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"
import scheduleData from "@/data/schedule.json"
import { TIMETABLE } from "@/styles/visualization"
import { CSS_CLASSES, STATUS_CLASSES } from "@/styles/course-theme"
import { parseMatrufscData } from "@/lib/parsers/matrufsc-parser"

// Define course color classes to use for timetable
const TIMETABLE_COLORS = [
  STATUS_CLASSES.IN_PROGRESS,
  STATUS_CLASSES.EXEMPTED,
  STATUS_CLASSES.COMPLETED,
  STATUS_CLASSES.PLANNED,
  STATUS_CLASSES.FAILED,
  STATUS_CLASSES.DEFAULT,
] as const

interface TimetableProps {
  studentInfo: StudentInfo
  matrufscData?: any // Optional MatrUFSC data that can be parsed
  onCourseClick?: (course: StudentCourse) => void
  onAddCourse?: (course: Course) => void
  selectedCampus: string
  isLoadingMatrufscData: boolean
  onCampusChange: (campus: string) => void
}

// Type for professor schedule data
type ScheduleEntry = {
  day: number;
  startTime: string;
  endTime?: string;
};

// Type for professor overrides
type ProfessorOverride = {
  courseId: string;
  professorId: string;
  schedule: ScheduleEntry[];
};

// Type for professors data
interface Professor {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
}

// Type for schedule data
interface ScheduleData {
  [courseId: string]: ScheduleEntry[] | { [key: string]: Professor[] };
  professors: {
    [courseId: string]: Professor[];
  };
}

export default function Timetable({ 
  studentInfo, 
  matrufscData, 
  onCourseClick, 
  onAddCourse,
  selectedCampus,
  isLoadingMatrufscData,
  onCampusChange
}: TimetableProps) {
  // State for professor overrides
  const [professorOverrides, setProfessorOverrides] = useState<ProfessorOverride[]>([]);
  // State for selected phase
  const [selectedPhase, setSelectedPhase] = useState<number>(1);

  // Use either the parsed MatrUFSC data or the default schedule data
  const timetableData = useMemo(() => {
    if (matrufscData) {
      return parseMatrufscData(matrufscData);
    }
    return scheduleData as unknown as ScheduleData;
  }, [matrufscData]);

  // Get all courses from the selected phase for the Course Stats
  const selectedPhaseCourses = useMemo(() => {
    if (!studentInfo?.currentPlan) return []
    
    // Get the semester that matches the selected phase
    const semester = studentInfo.currentPlan.semesters.find(s => s.number === selectedPhase)
    if (!semester) return []
    
    return semester.courses
  }, [studentInfo, selectedPhase])

  // Get only courses that have a professor selected for the timetable
  const scheduledCourses = useMemo(() => {
    return selectedPhaseCourses.filter(course => {
      const hasOverride = professorOverrides.some(o => o.courseId === course.course.id)
      return hasOverride
    })
  }, [selectedPhaseCourses, professorOverrides])

  // Handle professor selection
  const handleProfessorSelect = (course: StudentCourse, professorId: string) => {
    // Get the professor data - use the parsed data if available
    const professorsForCourse = timetableData.professors[course.course.id];
    const professorData = professorsForCourse?.find(
      (p) => p.professorId === professorId
    );
    
    if (!professorData) return;
    
    // Parse the professor's schedule
    const scheduleText = professorData.schedule;
    
    // Create new schedule entries in the exact same format as the default schedule
    const scheduleEntries: ScheduleEntry[] = [];
    
    // Parse schedule text that can contain multiple time slots like "Terça 15:10-16:50, Sexta 09:10-11:40"
    if (scheduleText) {
      // Split by comma to handle multiple time slots
      const timeSlots = scheduleText.split(',').map(s => s.trim());
      
      timeSlots.forEach(timeSlot => {
        const parts = timeSlot.split(' ');
        if (parts.length >= 2) {
          const dayName = parts[0];
          const timePart = parts[1];
          const [startTime, endTime] = timePart.split('-');
          
          const dayIndex = TIMETABLE.DAYS_MAP[dayName as keyof typeof TIMETABLE.DAYS_MAP];
          if (dayIndex === undefined || !startTime || !endTime) return;
          
          scheduleEntries.push({
            day: dayIndex,
            startTime: startTime,
            endTime: endTime
          });
        }
      });
    }
    
    // Update professor overrides
    setProfessorOverrides(prev => 
      prev.filter(o => o.courseId !== course.course.id).concat({
        courseId: course.course.id,
        professorId,
        schedule: scheduleEntries
      })
    );
  };
  
  // Create a mapping of time slots to courses
  const courseSchedule = useMemo(() => {
    const schedule: Record<string, Record<string, StudentCourse>> = {}
    
    // Initialize empty schedule grid
    TIMETABLE.TIME_SLOTS.forEach(slot => {
      schedule[slot.id] = {}
    })
    
    // Clear existing schedule first
    TIMETABLE.TIME_SLOTS.forEach(slot => {
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        schedule[slot.id][dayIndex] = undefined as any;
      });
    });
    
    // Process professor overrides (only show courses with selected professors)
    professorOverrides.forEach(override => {
      const course = selectedPhaseCourses.find(c => c.course.id === override.courseId);
      if (!course) return;
      
      // Process each schedule entry
      override.schedule.forEach(entry => {
        const { day, startTime, endTime } = entry;
        if (!endTime) return;

        // Find the start and end slot indices
        const startSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(slot => slot.id === startTime);
        const endSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(slot => {
          // Convert time strings to comparable values (e.g., "13:30" -> 1330)
          const slotTime = parseInt(slot.id.replace(':', ''));
          const endTime = parseInt(entry.endTime!.replace(':', ''));
          return slotTime >= endTime;
        });
        
        if (startSlotIndex === -1) return;
        const lastSlotIndex = endSlotIndex === -1 ? TIMETABLE.TIME_SLOTS.length : endSlotIndex;
        
        // Fill all slots between start and end time
        for (let i = startSlotIndex; i < lastSlotIndex; i++) {
          const slotId = TIMETABLE.TIME_SLOTS[i].id;
          schedule[slotId][day] = course;
        }
      });
    });
    
    return schedule;
  }, [selectedPhaseCourses, professorOverrides]);

  // Create a map of course IDs to color indices
  const courseColorMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    scheduledCourses.forEach((course, index) => {
      const colorIndex = index % TIMETABLE_COLORS.length;
      colorMap.set(course.course.id, TIMETABLE_COLORS[colorIndex]);
    });
    return colorMap;
  }, [scheduledCourses]);

  // Get the color for a course based on its index
  const getCourseColor = (courseId: string) => {
    return courseColorMap.get(courseId) || STATUS_CLASSES.DEFAULT;
  };

  const [selectedCourse, setSelectedCourse] = useState<StudentCourse | null>(null)

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Timetable - 2/3 width */}
      <div className="w-full md:w-2/3">
        {/* Header with title, campus selector, and phase selector */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Weekly Schedule</h2>
            <div className="flex items-center gap-2">
              <select 
                value={selectedCampus}
                onChange={(e) => onCampusChange(e.target.value)}
                className="bg-white border rounded px-3 py-1 text-sm"
              >
                <option value="FLO">Florianópolis</option>
                <option value="BLN">Blumenau</option>
                <option value="JOI">Joinville</option>
                <option value="CBS">Curitibanos</option>
                <option value="ARA">Araranguá</option>
              </select>
              {isLoadingMatrufscData && <span className="text-sm text-gray-500">(Loading...)</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="phase-select" className="text-sm font-medium text-gray-600">
              Select Phase:
            </label>
            <select
              id="phase-select"
              value={selectedPhase}
              onChange={(e) => setSelectedPhase(Number(e.target.value))}
              className="block w-36 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-50"
            >
              {studentInfo?.currentPlan?.semesters.map((semester) => (
                <option key={semester.number} value={semester.number}>
                  Phase {semester.number}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                      const course = courseSchedule[slot.id]?.[dayIndex];
                      if (!course) return <td key={dayIndex} className={CSS_CLASSES.TIMETABLE_CELL} />;

                      return (
                        <td
                          key={dayIndex}
                          className={CSS_CLASSES.TIMETABLE_CELL}
                          onClick={() => {
                            setSelectedCourse(course);
                            onCourseClick?.(course);
                          }}
                        >
                          <div
                            className={cn(
                              CSS_CLASSES.TIMETABLE_COURSE,
                              getCourseColor(course.course.id),
                              selectedCourse?.course.id === course.course.id && CSS_CLASSES.COURSE_SELECTED
                            )}
                          >
                            <div className={CSS_CLASSES.COURSE_ID}>{course.course.id}</div>
                            <div className={CSS_CLASSES.COURSE_NAME}>{course.course.name}</div>
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
      </div>

      {/* Course Stats - 1/3 width */}
      <div className="w-full md:w-1/3">
        <CourseStats
          courses={selectedPhaseCourses}
          timetableData={timetableData}
          onCourseClick={(course) => {
            setSelectedCourse(course);
            onCourseClick?.(course);
          }}
          onAddCourse={onAddCourse}
          onProfessorSelect={handleProfessorSelect}
        />
      </div>
    </div>
  )
}