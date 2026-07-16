"use client";

import { useMemo, useState } from "react";
import { CSS_CLASSES, STATUS_CLASSES } from "@/styles/course-theme";
import type { Course } from "@/types/curriculum";
import type { StudentCourse } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store";
import { useCourseMap } from "@/hooks/useCourseMap";

// Import the extracted components
import SearchInput from "./search-input";
import CourseList from "./course-list";
import CreditsSummary from "./credits-summary";
import ProfessorSelector from "./professor-selector";
import SearchPopup from "./search-popup";
import { ProfessorSearch } from "@/components/professors/professor-search";
import { AnimatePresence, motion } from "framer-motion";

// Default empty schedule data
const emptyScheduleData = {
  professors: {},
};

interface CourseStatsProps {
  courses: StudentCourse[];
  timetableData?: any; // Optional timetable data (parsed MatrUFSC or default)
  selectedPhase: number; // ADDED
  onProfessorSelect?: (course: StudentCourse, professorId: string) => void;
  coursesInTimetable?: string[]; // New prop with IDs of courses in timetable
  courseColors?: Map<string, string>; // Color map from timetable component
  onRemoveCourse?: (courseId: string) => void; // New prop for removing a course
  professorAggregates?: Record<string, any>;
  onProfessorClick?: (professorName: string) => void;
  searchRefreshTrigger?: number;
}

// Type for professor data
type ProfessorData = {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
};

export default function CourseStats({
  courses,
  timetableData,
  selectedPhase,
  onProfessorSelect,
  coursesInTimetable = [],
  courseColors,
  onRemoveCourse,
  professorAggregates,
  onProfessorClick,
  searchRefreshTrigger,
}: CourseStatsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const courseMap = useCourseMap();
  const selectedSchedule = useStudentStore((s) => s.selectedSchedule);
  const selectedStudentSchedule = useStudentStore((s) => s.selectedStudentSchedule);
  const selectSchedule = useStudentStore((s) => s.selectSchedule);
  const clearSchedule = useStudentStore((s) => s.clearSchedule);
  const addCourseToSemester = useStudentStore((s) => s.addCourseToSemester);

  // Use provided timetable data or fall back to empty data
  const scheduleDataToUse = timetableData || emptyScheduleData;

  // Handle key press for search input
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/") {
      e.preventDefault();
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
    } else if (e.key !== "Escape" && e.key !== "Tab") {
      setIsSearchOpen(true);
    }
  };

  const handleSelectSearchedCourse = (
    course: StudentCourse | Course,
    isCurrentCourse: boolean,
  ) => {
    if (isCurrentCourse) {
      selectSchedule(course as StudentCourse, null);
    } else {
      const newCourse = course as Course;
      addCourseToSemester(
        newCourse,
        selectedPhase, // Use the selectedPhase prop
      );
    }
    setIsSearchOpen(false); // Close popup after selection/addition
  };

  // Calculate total weekly hours
  const weeklyHours = useMemo(() => {
    return courses.reduce((total, course) => {
      return total + course.credits;
    }, 0);
  }, [courses]);

  // Calculate total workload (hours)
  const totalWorkload = useMemo(() => {
    return courses.reduce((total, course) => {
      return total + (courseMap.get(course.courseId)?.workload || 0);
    }, 0);
  }, [courses, courseMap]);

  // Get the course color based on its ID
  const getCourseColor = (courseId: string) => {
    if (courseColors && coursesInTimetable.includes(courseId)) {
      return courseColors.get(courseId) || STATUS_CLASSES.DEFAULT;
    }
    return STATUS_CLASSES.DEFAULT;
  };

  const handleProfessorSelect = (
    professorId: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();

    // Call the callback if provided and a course is selected
    if (selectedStudentSchedule && onProfessorSelect) {
      onProfessorSelect(selectedStudentSchedule, professorId);
    }
  };

  // Get professors for the selected course from the store
  const professors = useMemo((): ProfessorData[] => {
    if (!selectedSchedule) return [];

    // Get professors from the schedule data
    const professorsData = scheduleDataToUse.professors?.[selectedSchedule.id];
    return professorsData || [];
  }, [selectedSchedule, scheduleDataToUse]); // Updated dependency array to use selectedSchedule

  // Derived (not manually tracked) so it always reflects the actually
  // persisted choice — recomputes on course switch, reload, and pick alike,
  // instead of a click-only local state that went stale on course switch.
  const selectedProfessor = useMemo((): string | null => {
    if (!selectedStudentSchedule) return null;

    const liveCourse = selectedStudentSchedule.instanceId
      ? courses.find((c) => c.instanceId === selectedStudentSchedule.instanceId)
      : courses.find(
          (c) => c.courseId === selectedStudentSchedule.courseId && !c.instanceId,
        );
    const classId = liveCourse?.class;
    if (!classId) return null;

    return professors.find((p) => p.classNumber === classId)?.professorId ?? null;
  }, [courses, selectedStudentSchedule, professors]);

  return (
    <div className={CSS_CLASSES.STATS_CONTAINER}>
      <div className="p-4">
        <div>
          {/* Discipline + professor search, side by side */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <SearchInput
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onOpenSearchPopup={() => setIsSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {onProfessorClick && (
              <div className="flex-1">
                <ProfessorSearch
                  onSelect={onProfessorClick}
                  refreshTrigger={searchRefreshTrigger}
                />
              </div>
            )}
          </div>

          {/* Current Courses Section */}
          <div className="mt-3">
            <CourseList courses={courses} getCourseColor={getCourseColor} />
          </div>

          {/* Credits Summary */}
          <div className="mt-6">
            <CreditsSummary
              totalCredits={weeklyHours}
              totalWorkload={totalWorkload}
            />
          </div>

          {/* Professor Selection — keyed by a STABLE string (not course id
              or `layout`/`popLayout`). Switching between two already-shown
              courses just updates this same mounted instance's content
              instantly, with no exit/enter cycle and no Framer Motion layout
              measurement (that measurement forces a synchronous reflow, and
              paying it on every professor click — right when the schedule
              grid below is *also* changing — was adding real, felt latency
              for a comparatively small visual win). The fade only plays for
              the actual show/hide transition (picking a course from none, or
              clearing one via a phase/semester change), which is cheap
              because it's a plain opacity mount/unmount, not a tracked
              layout animation. */}
          <AnimatePresence>
            {selectedSchedule && (
              <motion.div
                key="professor-selector"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="mt-6"
              >
                <ProfessorSelector
                  courseId={selectedSchedule.id}
                  professors={professors}
                  selectedProfessor={selectedProfessor}
                  onProfessorSelect={handleProfessorSelect}
                  onRemoveCourse={onRemoveCourse}
                  isInTimetable={coursesInTimetable.includes(selectedSchedule.id)}
                  professorAggregates={professorAggregates}
                  onProfessorClick={onProfessorClick}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>{" "}
      </div>{" "}
      <AnimatePresence>
        {isSearchOpen && (
          <SearchPopup
            key="search-popup"
            searchTerm={searchTerm}
            onClose={() => setIsSearchOpen(false)}
            selectedPhase={selectedPhase}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
