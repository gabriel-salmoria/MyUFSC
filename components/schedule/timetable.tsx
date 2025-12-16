"use client";

import { useMemo, useState, useEffect } from "react";
import { cn } from "@/components/ui/utils";
import CourseStats from "./course-stats";
import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentCourse } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { TIMETABLE } from "@/styles/visualization";
import {
  CSS_CLASSES,
  TIMETABLE_COLOR_CLASSES,
  STATUS_CLASSES,
} from "@/styles/course-theme";
import { parsescheduleData } from "@/parsers/class-parser";
import { useStudentStore } from "@/lib/student-store"; // Import useStudentStore

// Import the new components
import TimetableHeader from "./timetable-header";
import TimetableGrid from "./timetable-grid";

// Define course color classes to use for timetable
const TIMETABLE_COLORS = TIMETABLE_COLOR_CLASSES;

// Default empty schedule data (used when no data is loaded yet)
const emptyScheduleData = {
  professors: {},
};

interface TimetableProps {
  studentInfo: StudentInfo;
  scheduleState: any;
}

// Type for professor schedule data
type ScheduleEntry = {
  day: number;
  startTime: string;
  endTime?: string;
  location?: string;
};

// Type for professor overrides
type ProfessorOverride = {
  courseId: string;
  professorId: string;
  schedule: ScheduleEntry[];
  classNumber: string;
  location: string;
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
  scheduleState,
}: TimetableProps) {
  // State for professor overrides
  const [professorOverrides, setProfessorOverrides] = useState<
    ProfessorOverride[]
  >([]);

  const studentStore = useStudentStore();

  const {
    scheduleData,
    selectedCampus,
    selectedSemester,
    isLoading: isLoadingscheduleData,
    setScheduleState,
  } = scheduleState;

  const onCampusChange = (campus: string) =>
    setScheduleState((prev: any) => ({ ...prev, selectedCampus: campus }));

  const onSemesterChange = (semester: string) =>
    setScheduleState((prev: any) => ({
      ...prev,
      selectedSemester: semester,
    }));

  // State for selected phase
  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  // State to maintain consistent colors for courses
  const [courseColors] = useState(() => new Map<string, string>());
  // State to track conflicting slots
  const [conflicts, setConflicts] = useState<Map<string, Set<string>>>(
    new Map(),
  );
  // State for the selected course in the timetable
  // REMOVED selectedTimetableCourse state
  let plan = studentInfo.plans[studentInfo.currentPlan];
  // Safeguard against rendering with invalid data
  if (!studentInfo || !plan || !plan.semesters) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">
          Class Schedule
        </h2>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground">
            Loading class schedule data...
          </p>
        </div>
      </div>
    );
  }

  // Use either the parsed MatrUFSC data or the default empty data
  const timetableData = useMemo(() => {
    if (scheduleData) {
      return parsescheduleData(scheduleData);
    }
    return emptyScheduleData as ScheduleData;
  }, [scheduleData]);

  // Get all courses from the selected phase for the Course Stats
  const selectedPhaseCourses = useMemo(() => {
    if (!studentInfo?.plans[studentInfo.currentPlan]) return [];

    // Get the semester that matches the selected phase
    const semester = studentInfo.plans[studentInfo.currentPlan]?.semesters.find(
      (s) => s.number === selectedPhase,
    );
    if (!semester) return [];

    return semester.courses;
  }, [studentInfo, selectedPhase]);

  // Get only courses that have a professor selected for the timetable
  const scheduledCourses = useMemo(() => {
    return selectedPhaseCourses.filter((course) => {
      const hasOverride = professorOverrides.some(
        (o) => o.courseId === course.course.id,
      );
      return hasOverride;
    });
  }, [selectedPhaseCourses, professorOverrides]);

  // Helper function to convert time string to minutes since midnight
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Helper to parse schedule
  const parseScheduleForProfessor = (professorData: Professor, course: StudentCourse): ProfessorOverride | null => {
    const scheduleText = professorData.schedule;
    const scheduleEntries: ScheduleEntry[] = [];

    // Safely get course ID
    const courseId = course.course ? course.course.id : (course as any).id;

    if (scheduleText) {
      const timeSlots = scheduleText.split(",").map((s) => s.trim());

      timeSlots.forEach((timeSlot) => {
        const daysAndTimeMatch = timeSlot.match(
          /^(.+?) (\d+:\d+-\d+:\d+)(.*)$/,
        );

        if (daysAndTimeMatch) {
          const [_, daysStr, timeRange, locationPart] = daysAndTimeMatch;
          const days = daysStr.split("/");
          const [startTime, endTime] = timeRange.split("-");
          const slotLocation = locationPart ? locationPart.trim() : "";

          days.forEach((dayName) => {
            const dayIndex =
              TIMETABLE.DAYS_MAP[
              dayName.trim() as keyof typeof TIMETABLE.DAYS_MAP
              ];
            if (dayIndex === undefined || !startTime || !endTime) return;

            scheduleEntries.push({
              day: dayIndex,
              startTime: startTime,
              endTime: endTime,
              location: slotLocation,
            });
          });
        }
      });
    }

    return {
      courseId: courseId,
      professorId: professorData.professorId,
      schedule: scheduleEntries,
      classNumber: professorData.classNumber,
      location: scheduleEntries[scheduleEntries.length - 1]?.location || "",
    }
  }

  // Effect to sync overrides with selectedPhaseCourses (Source of Truth)
  useEffect(() => {
    if (!timetableData || !selectedPhaseCourses) return;

    const newOverrides: ProfessorOverride[] = [];

    selectedPhaseCourses.forEach(studentCourse => {
      // Check if class is selected (persisted in store)
      // Accessing .class properly - might need 'as any' if types are broken in store but working here
      const classId = (studentCourse as any).class;
      // Safely get course ID
      const courseId = studentCourse.course ? studentCourse.course.id : (studentCourse as any).id;

      if (classId) {
        const profs = timetableData.professors[courseId];
        if (profs) {
          const prof = profs.find((p: Professor) => p.classNumber === classId);
          if (prof) {
            const override = parseScheduleForProfessor(prof, studentCourse);
            if (override) {
              newOverrides.push(override);
            }
          }
        }
      }
    });

    // START CONFLICT CALCULATION (Moved from handleProfessorSelect)
    const newConflicts = new Map<string, Set<string>>();

    for (let i = 0; i < newOverrides.length; i++) {
      for (let j = i + 1; j < newOverrides.length; j++) {
        const override1 = newOverrides[i];
        const override2 = newOverrides[j];

        override1.schedule.forEach((entry1) => {
          if (!entry1.endTime) return;

          override2.schedule.forEach((entry2) => {
            if (!entry2.endTime || entry1.day !== entry2.day) return;

            const start1 = timeToMinutes(entry1.startTime);
            const end1 = timeToMinutes(entry1.endTime as string);
            const start2 = timeToMinutes(entry2.startTime);
            const end2 = timeToMinutes(entry2.endTime as string);

            if (
              (start1 >= start2 && start1 < end2) ||
              (end1 > start2 && end1 <= end2) ||
              (start1 < start2 && end1 > end2)
            ) {
              const key1 = `${override1.courseId}-${entry1.day}-${entry1.startTime}`;
              const key2 = `${override2.courseId}-${entry2.day}-${entry2.startTime}`;

              if (!newConflicts.has(key1)) newConflicts.set(key1, new Set());
              if (!newConflicts.has(key2)) newConflicts.set(key2, new Set());

              newConflicts.get(key1)!.add(override2.courseId);
              newConflicts.get(key2)!.add(override1.courseId);
            }
          });
        });
      }
    }
    // END CONFLICT CALCULATION

    setProfessorOverrides(newOverrides);
    setConflicts(newConflicts);

  }, [selectedPhaseCourses, timetableData]);

  // Handle professor selection - Updates Store
  const handleProfessorSelect = (
    course: StudentCourse,
    professorId: string,
  ) => {
    // Safely get course ID
    const courseId = course.course ? course.course.id : (course as any).id;

    const professorsForCourse = timetableData.professors[courseId]; // Fixed access
    const professorData = professorsForCourse?.find(
      (p) => p.professorId === professorId,
    );

    if (professorData) {
      // Update the store - this will trigger the effect above
      studentStore.setCourseClass(course, professorData.classNumber);
    }
  };

  // Create a mapping of time slots to courses
  const courseSchedule = useMemo(() => {
    const schedule: Record<
      string,
      Record<
        string,
        {
          courses: {
            course: StudentCourse;
            isConflicting: boolean;
            location?: string; // Add location to course data
          }[];
        }
      >
    > = {};

    // Initialize empty schedule grid
    TIMETABLE.TIME_SLOTS.forEach((slot) => {
      schedule[slot.id] = {};
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        schedule[slot.id][dayIndex] = {
          courses: [],
        };
      });
    });

    // First pass: Place all courses in their slots
    professorOverrides.forEach((override) => {
      const course = selectedPhaseCourses.find(
        (c) => c.course.id === override.courseId,
      );
      if (!course) return;

      override.schedule.forEach((entry) => {
        const { day, startTime, endTime, location } = entry;
        if (!endTime) return;

        const startSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(
          (slot) => slot.id === startTime,
        );
        if (startSlotIndex === -1) return;

        const endSlotIndex = TIMETABLE.TIME_SLOTS.findIndex((slot) => {
          const slotTime = parseInt(slot.id.replace(":", ""));
          const endTime = parseInt(entry.endTime!.replace(":", ""));
          return slotTime >= endTime;
        });
        const lastSlotIndex =
          endSlotIndex === -1 ? TIMETABLE.TIME_SLOTS.length : endSlotIndex;

        // Fill all slots between start and end time
        for (let i = startSlotIndex; i < lastSlotIndex; i++) {
          const slotId = TIMETABLE.TIME_SLOTS[i].id;
          schedule[slotId][day].courses.push({
            course,
            isConflicting: false, // Initially set to false, will update in second pass
            location: location, // Pass location to the schedule
          });
        }
      });
    });

    // Second pass: Check for conflicts within each time slot
    TIMETABLE.TIME_SLOTS.forEach((slot) => {
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        const cellCourses = schedule[slot.id][dayIndex].courses;

        // If there's more than one course in this slot, they're all conflicting
        if (cellCourses.length > 1) {
          cellCourses.forEach((courseData) => {
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

  // Handle removing a course from the timetable
  const handleRemoveCourse = (courseId: string) => {
    // Find course object to pass to store
    // We only have ID here, but setCourseClass needs StudentCourse object (mostly for phase/id usually)
    // However, our new setCourseClass might assume it has phase.
    // The current signature of setCourseClass is (course: StudentCourse, classId: string)

    const course = selectedPhaseCourses.find(c => c.course.id === courseId);
    if (course) {
      studentStore.setCourseClass(course, "");
    }
  };

  // Get the list of available phases from the student info
  const availablePhases = useMemo(() => {
    if (!studentInfo?.plans[studentInfo.currentPlan]?.semesters) return [1];
    return studentInfo.plans[studentInfo.currentPlan].semesters.map(
      (s) => s.number,
    );
  }, [studentInfo]);

  // Handle when a course is clicked in the timetable grid
  const handleTimetableCourseClick = (course: StudentCourse) => {
    studentStore.selectCourse(course); // Use store action directly
  };

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Timetable - 2/3 width */}
      <div className="w-full md:w-2/3">
        {/* Header with title, campus selector, and phase selector */}
        <TimetableHeader
          selectedCampus={selectedCampus}
          selectedSemester={selectedSemester}
          selectedPhase={selectedPhase}
          isLoadingData={isLoadingscheduleData}
          onCampusChange={onCampusChange}
          onSemesterChange={onSemesterChange}
          onPhaseChange={setSelectedPhase}
          availablePhases={availablePhases}
        />

        {/* Timetable Grid */}
        <TimetableGrid
          courseSchedule={courseSchedule}
          getCourseColor={getCourseColor}
        />
      </div>

      {/* Course Stats - 1/3 width */}
      <div className="w-full md:w-1/3">
        <CourseStats
          courses={selectedPhaseCourses}
          timetableData={timetableData}
          selectedPhase={selectedPhase} // Pass selectedPhase
          onProfessorSelect={handleProfessorSelect}
          coursesInTimetable={professorOverrides.map((o) => o.courseId)}
          courseColors={courseColors}
          onRemoveCourse={handleRemoveCourse}
        />
      </div>
    </div>
  );
}
