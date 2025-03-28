"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import CourseStats from "@/components/class-schedule/course-stats"
import type { Course } from "@/types/curriculum"
import type { StudentInfo, StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"

import { TIMETABLE } from "@/styles/visualization"
import { CSS_CLASSES, TIMETABLE_COLOR_CLASSES, STATUS_CLASSES } from "@/styles/course-theme"
import { parseMatrufscData } from "@/lib/parsers/matrufsc-parser"

// Define course color classes to use for timetable
const TIMETABLE_COLORS = TIMETABLE_COLOR_CLASSES;

// Default empty schedule data (used when no data is loaded yet)
const emptyScheduleData = {
  professors: {}
};

interface TimetableProps {
  studentInfo: StudentInfo
  matrufscData?: any // Optional MatrUFSC data that can be parsed
  onCourseClick?: (course: StudentCourse) => void
  onAddCourse?: (course: Course) => void
  selectedCampus: string
  selectedSemester: string
  isLoadingMatrufscData: boolean
  onCampusChange: (campus: string) => void
  onSemesterChange: (semester: string) => void
}

// Type for professor schedule data
type ScheduleEntry = {
  day: number;
  startTime: string;
  endTime?: string;
  location?: string; // Add location field to match what's coming from the parser
};

// Type for professor overrides
type ProfessorOverride = {
  courseId: string;
  professorId: string;
  schedule: ScheduleEntry[];
  classNumber: string;
  location: string; // Add location field for classroom building/room
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

// Type for conflicts tracking
type ConflictKey = `${string}-${number}-${string}`;
type ConflictMap = Map<ConflictKey, Set<string>>;

export default function Timetable({ 
  studentInfo, 
  matrufscData, 
  onCourseClick, 
  onAddCourse,
  selectedCampus,
  selectedSemester,
  isLoadingMatrufscData,
  onCampusChange,
  onSemesterChange
}: TimetableProps) {
  // State for professor overrides
  const [professorOverrides, setProfessorOverrides] = useState<ProfessorOverride[]>([]);
  // State for selected phase
  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  // State to maintain consistent colors for courses
  const [courseColors] = useState(() => new Map<string, string>());
  // State to track conflicting slots
  const [conflicts, setConflicts] = useState<Map<string, Set<string>>>(new Map());

  // Use either the parsed MatrUFSC data or the default empty data
  const timetableData = useMemo(() => {
    if (matrufscData) {
      return parseMatrufscData(matrufscData);
    }
    return emptyScheduleData as ScheduleData;
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
    
    // Helper function to convert time string to minutes since midnight
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Parse schedule text that can contain multiple time slots
    if (scheduleText) {
      const timeSlots = scheduleText.split(',').map(s => s.trim());
      
      timeSlots.forEach(timeSlot => {
        // Split by spaces but preserve location information
        // Format could be like "Segunda/Quarta 13:30-15:10 CTC-CTC102"
        // We need to extract days, time range, and location
        const daysAndTimeMatch = timeSlot.match(/^(.+?) (\d+:\d+-\d+:\d+)(.*)$/);
        
        if (daysAndTimeMatch) {
          const [_, daysStr, timeRange, locationPart] = daysAndTimeMatch;
          const days = daysStr.split('/');
          const [startTime, endTime] = timeRange.split('-');
          
          // Extract location (trim any leading spaces)
          const slotLocation = locationPart ? locationPart.trim() : "";
          
          days.forEach(dayName => {
            const dayIndex = TIMETABLE.DAYS_MAP[dayName.trim() as keyof typeof TIMETABLE.DAYS_MAP];
            if (dayIndex === undefined || !startTime || !endTime) return;
            
            scheduleEntries.push({
              day: dayIndex,
              startTime: startTime,
              endTime: endTime,
              location: slotLocation
            });
          });
        }
      });
    }

    // Update professor overrides first
    const newProfessorOverrides = [
      ...professorOverrides.filter(o => o.courseId !== course.course.id),
      {
        courseId: course.course.id,
        professorId,
        schedule: scheduleEntries,
        classNumber: professorData.classNumber,
        location: scheduleEntries[scheduleEntries.length - 1].location || ""
      }
    ];

    // Clear existing conflicts and rebuild from scratch
    const newConflicts = new Map<string, Set<string>>();
    
    // Check all courses against each other for conflicts
    for (let i = 0; i < newProfessorOverrides.length; i++) {
      for (let j = i + 1; j < newProfessorOverrides.length; j++) {
        const override1 = newProfessorOverrides[i];
        const override2 = newProfessorOverrides[j];
        
        override1.schedule.forEach(entry1 => {
          if (!entry1.endTime) return;
          
          override2.schedule.forEach(entry2 => {
            if (!entry2.endTime || entry1.day !== entry2.day) return;
            
            const start1 = timeToMinutes(entry1.startTime);
            const end1 = timeToMinutes(entry1.endTime as string);
            const start2 = timeToMinutes(entry2.startTime);
            const end2 = timeToMinutes(entry2.endTime as string);
            
            // Check for overlap
            if ((start1 >= start2 && start1 < end2) || 
                (end1 > start2 && end1 <= end2) || 
                (start1 < start2 && end1 > end2)) {
              // Add conflict for both courses
              const key1 = `${override1.courseId}-${entry1.day}-${entry1.startTime}`;
              const key2 = `${override2.courseId}-${entry2.day}-${entry2.startTime}`;
              
              if (!newConflicts.has(key1)) {
                newConflicts.set(key1, new Set());
              }
              if (!newConflicts.has(key2)) {
                newConflicts.set(key2, new Set());
              }
              
              newConflicts.get(key1)!.add(override2.courseId);
              newConflicts.get(key2)!.add(override1.courseId);
            }
          });
        });
      }
    }

    // Update both states
    setProfessorOverrides(newProfessorOverrides);
    setConflicts(newConflicts);
  };
  
  // Create a mapping of time slots to courses
  const courseSchedule = useMemo(() => {
    const schedule: Record<string, Record<string, {
      courses: {
        course: StudentCourse;
        isConflicting: boolean;
        location?: string; // Add location to course data
      }[];
    }>> = {}
    
    // Initialize empty schedule grid
    TIMETABLE.TIME_SLOTS.forEach(slot => {
      schedule[slot.id] = {}
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        schedule[slot.id][dayIndex] = {
          courses: []
        };
      });
    });
    
    // First pass: Place all courses in their slots
    professorOverrides.forEach(override => {
      const course = selectedPhaseCourses.find(c => c.course.id === override.courseId);
      if (!course) return;
      
      override.schedule.forEach(entry => {
        const { day, startTime, endTime, location } = entry;
        if (!endTime) return;

        const startSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(slot => slot.id === startTime);
        if (startSlotIndex === -1) return;
        
        const endSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(slot => {
          const slotTime = parseInt(slot.id.replace(':', ''));
          const endTime = parseInt(entry.endTime!.replace(':', ''));
          return slotTime >= endTime;
        });
        const lastSlotIndex = endSlotIndex === -1 ? TIMETABLE.TIME_SLOTS.length : endSlotIndex;
        
        // Fill all slots between start and end time
        for (let i = startSlotIndex; i < lastSlotIndex; i++) {
          const slotId = TIMETABLE.TIME_SLOTS[i].id;
          schedule[slotId][day].courses.push({
            course,
            isConflicting: false, // Initially set to false, will update in second pass
            location: location // Pass location to the schedule
          });
        }
      });
    });
    
    // Second pass: Check for conflicts within each time slot
    TIMETABLE.TIME_SLOTS.forEach(slot => {
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        const cellCourses = schedule[slot.id][dayIndex].courses;
        
        // If there's more than one course in this slot, they're all conflicting
        if (cellCourses.length > 1) {
          cellCourses.forEach(courseData => {
            courseData.isConflicting = true;
          });
        }
      });
    });
    
    return schedule;
  }, [selectedPhaseCourses, professorOverrides]);

  // Create a map of course IDs to color indices
  const courseColorMap = useMemo(() => {
    // For any new courses that don't have a color yet, assign them one
    selectedPhaseCourses.forEach((course) => {
      if (!courseColors.has(course.course.id)) {
        const colorIndex = courseColors.size % TIMETABLE_COLORS.length;
        courseColors.set(course.course.id, TIMETABLE_COLORS[colorIndex]);
      }
    });
    return courseColors;
  }, [selectedPhaseCourses, courseColors]);

  // Get the color for a course based on conflicts
  const getCourseColor = (courseId: string) => {
    return courseColors.get(courseId) || STATUS_CLASSES.DEFAULT;
  };

  const [selectedCourse, setSelectedCourse] = useState<StudentCourse | null>(null)

  // Handle removing a course from the timetable
  const handleRemoveCourse = (courseId: string) => {
    setProfessorOverrides(prev => prev.filter(o => o.courseId !== courseId));
    setConflicts(new Map()); // Reset conflicts when removing a course
  };

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Timetable - 2/3 width */}
      <div className="w-full md:w-2/3">
        {/* Header with title, campus selector, and phase selector */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-foreground">Weekly Schedule</h2>
            <div className="flex items-center gap-2">
              <select 
                value={selectedCampus}
                onChange={(e) => onCampusChange(e.target.value)}
                className="bg-background border border-border rounded px-3 py-1 text-sm text-foreground"
              >
                <option value="FLO">Florianópolis</option>
                <option value="BLN">Blumenau</option>
                <option value="JOI">Joinville</option>
                <option value="CBS">Curitibanos</option>
                <option value="ARA">Araranguá</option>
              </select>
              <select 
                value={selectedSemester}
                onChange={(e) => onSemesterChange(e.target.value)}
                className="bg-background border border-border rounded px-3 py-1 text-sm text-foreground"
              >
                <option value="20251">2025.1</option>
                <option value="20243">2024.3</option>
                <option value="20242">2024.2</option>
                <option value="20241">2024.1</option>
              </select>
              {isLoadingMatrufscData && <span className="text-sm text-muted-foreground">(Loading...)</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="phase-select" className="text-sm font-medium text-muted-foreground">
              Select Phase:
            </label>
            <select
              id="phase-select"
              value={selectedPhase}
              onChange={(e) => setSelectedPhase(Number(e.target.value))}
              className="block w-36 rounded-md border border-border bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
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
                                  onClick={() => {
                                    setSelectedCourse(courseData.course);
                                    onCourseClick?.(courseData.course);
                                  }}
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
          coursesInTimetable={professorOverrides.map(o => o.courseId)}
          courseColors={courseColors}
          onRemoveCourse={handleRemoveCourse}
        />
      </div>
    </div>
  )
}