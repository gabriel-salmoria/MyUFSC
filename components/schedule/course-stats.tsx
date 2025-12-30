"use client";

import { useMemo, useState } from "react";
import { CSS_CLASSES, STATUS_CLASSES } from "@/styles/course-theme";
import type { Course } from "@/types/curriculum";
import type { StudentCourse } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store";

// Import the extracted components
import SearchInput from "./search-input";
import CourseList from "./course-list";
import CreditsSummary from "./credits-summary";
import ProfessorSelector from "./professor-selector";
import SearchPopup from "./search-popup";

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
}: CourseStatsProps) {
  const [selectedProfessor, setSelectedProfessor] = useState<string | null>(
    null,
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const studentStore = useStudentStore();

  const {
    selectedSchedule,
    selectedStudentSchedule,

    selectSchedule,
    clearSchedule,
  } = studentStore;

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
      selectSchedule(course as StudentCourse); // Use local state setter for existing courses
    } else {
      const newCourse = course as Course;
      studentStore.addCourseToSemester(
        newCourse,
        selectedPhase, // Use the selectedPhase prop
      );
    }
    setIsSearchOpen(false); // Close popup after selection/addition
  };

  // Calculate total weekly hours
  const weeklyHours = useMemo(() => {
    return courses.reduce((total, course) => {
      return total + course.course.credits;
    }, 0);
  }, [courses]);

  // Calculate total workload (hours)
  const totalWorkload = useMemo(() => {
    return courses.reduce((total, course) => {
      return total + (course.course.workload || 0);
    }, 0);
  }, [courses]);

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

    // Update selected professor
    setSelectedProfessor(professorId);

    // Call the callback if provided and a course is selected
    if (selectedSchedule && onProfessorSelect) {
      onProfessorSelect(selectedSchedule, professorId);
    }
  };

  // Get professors for the selected course from the store
  const professors = useMemo((): ProfessorData[] => {
    if (!selectedSchedule) return [];

    // Get professors from the schedule data
    const professorsData = scheduleDataToUse.professors?.[selectedSchedule.id];
    return professorsData || [];
  }, [selectedSchedule, scheduleDataToUse]); // Updated dependency array to use selectedSchedule

  return (
    <div className={CSS_CLASSES.STATS_CONTAINER}>
      <h2 className={CSS_CLASSES.STATS_HEADER}>Minhas Matérias</h2>
      <div className="p-4">
        <div className="space-y-6">
          {/* Search Box */}
          <SearchInput
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onOpenSearchPopup={() => setIsSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
          />

          {/* Current Courses Section */}
          <CourseList courses={courses} getCourseColor={getCourseColor} />

          {/* Credits Summary */}
          <CreditsSummary totalCredits={weeklyHours} totalWorkload={totalWorkload} />

          {/* Professor Selection */}
          {selectedSchedule && ( // Use selectedSchedule from the store
            <ProfessorSelector
              professors={professors}
              selectedProfessor={selectedProfessor}
              onProfessorSelect={handleProfessorSelect}
              onRemoveCourse={onRemoveCourse}
              isInTimetable={coursesInTimetable.includes(
                selectedSchedule.id, // Use selectedSchedule
              )}
            />
          )}
        </div>{" "}
      </div>{" "}
      {isSearchOpen && (
        <SearchPopup
          searchTerm={searchTerm}
          onClose={() => setIsSearchOpen(false)}
          selectedPhase={selectedPhase}
        />
      )}
    </div>
  );
}
