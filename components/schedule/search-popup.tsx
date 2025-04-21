"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/curriculum";
import type { StudentCourse } from "@/types/student-plan";
import { courseMap } from "@/lib/parsers/curriculum-parser";
import { useStudentStore } from "@/lib/student-store";

interface SearchPopupProps {
  searchTerm: string;
  onClose: () => void;
  onSelect: (course: StudentCourse | Course, isCurrentCourse: boolean) => void;
}

// Result entry for display in search popup
interface SearchResult {
  id: string;
  name: string;
  credits: number;
  isCurrentCourse: boolean;
  originalCourse: StudentCourse | Course;
}

export default function SearchPopup({
  searchTerm: initialSearchTerm,
  onClose,
  onSelect,
}: SearchPopupProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [localSearchTerm, setLocalSearchTerm] = useState(initialSearchTerm);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const studentStore = useStudentStore();

  // Focus search input when popup opens
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Handle escape key to close popup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && searchResults.length > 0) {
        const result = searchResults[activeIndex];
        onSelect(result.originalCourse, result.isCurrentCourse);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, searchResults, activeIndex, onSelect]);

  // Extract current courses from the student info
  const currentCourses = useMemo(() => {
    if (!studentStore.studentInfo?.plans[studentStore.studentInfo.currentPlan])
      return [];

    // Get all courses from all semesters
    return studentStore.studentInfo.plans[
      studentStore.studentInfo.currentPlan
    ].semesters.flatMap((semester) => semester.courses);
  }, [studentStore.studentInfo]);

  // Filter courses based on search term
  useEffect(() => {
    // Map of current course IDs for quick lookup
    const currentCourseIds = new Set(
      currentCourses.map((c: StudentCourse) => c.course.id),
    );

    // Prepare results array
    const results: SearchResult[] = [];

    if (!localSearchTerm.trim()) {
      // Show all available courses from the curriculum when no search term
      const allCourses = Array.from(courseMap.values())
        // Filter out "Optativa X" placeholder courses
        .filter((course) => !course.id.includes("Optativa"));

      // First add current courses
      currentCourses.forEach((course: StudentCourse) => {
        // Skip placeholder optativa courses
        if (course.course.id.includes("Optativa")) return;

        results.push({
          id: course.course.id,
          name: course.course.name,
          credits: course.course.credits,
          isCurrentCourse: true,
          originalCourse: course,
        });
      });

      // Then add all other available courses
      allCourses.forEach((course) => {
        // Skip if already in current courses
        if (currentCourseIds.has(course.id)) return;

        results.push({
          id: course.id,
          name: course.name,
          credits: course.credits,
          isCurrentCourse: false,
          originalCourse: course,
        });
      });

      setSearchResults(results);
      return;
    }

    // Search term exists, filter based on it
    const term = localSearchTerm.toLowerCase();

    // First check current courses
    currentCourses.forEach((course: StudentCourse) => {
      // Skip placeholder optativa courses
      if (course.course.id.includes("Optativa")) return;

      if (
        course.course.id.toLowerCase().includes(term) ||
        course.course.name.toLowerCase().includes(term)
      ) {
        results.push({
          id: course.course.id,
          name: course.course.name,
          credits: course.course.credits,
          isCurrentCourse: true,
          originalCourse: course,
        });
      }
    });

    // Then check all available courses in the curriculum
    courseMap.forEach((course) => {
      // Skip if already in current courses or if it's an optativa placeholder
      if (currentCourseIds.has(course.id) || course.id.includes("Optativa"))
        return;

      if (
        course.id.toLowerCase().includes(term) ||
        course.name.toLowerCase().includes(term)
      ) {
        results.push({
          id: course.id,
          name: course.name,
          credits: course.credits,
          isCurrentCourse: false,
          originalCourse: course,
        });
      }
    });

    setSearchResults(results);
    setActiveIndex(0);
  }, [localSearchTerm, currentCourses]);

  // Initialize local search term on initial prop change
  useEffect(() => {
    setLocalSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSearchTerm(e.target.value);
  };

  return (
    <div className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]">
      <div
        ref={popupRef}
        className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden transition-all"
        style={{ maxHeight: "60vh" }}
      >
        <div className="p-3 bg-background-secondary border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
            <div className="text-sm text-muted-foreground">
              Showing {searchResults.length} result
              {searchResults.length !== 1 ? "s" : ""}
            </div>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search courses by name or code..."
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={localSearchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div
          className="overflow-y-auto"
          style={{ maxHeight: "calc(60vh - 100px)" }}
        >
          {searchResults.length > 0 ? (
            <div className="p-1">
              {searchResults.map((result, index) => (
                <div
                  key={`${result.id}-${result.isCurrentCourse}`}
                  className={cn(
                    "p-2 rounded-md cursor-pointer hover:bg-accent",
                    index === activeIndex &&
                      "bg-primary/10 hover:bg-primary/10",
                  )}
                  onClick={() => {
                    onSelect(result.originalCourse, result.isCurrentCourse);
                    onClose();
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-foreground">
                      {result.id}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {result.credits} cr
                    </div>
                  </div>
                  <div className="text-sm text-foreground-secondary">
                    {result.name}
                  </div>
                  {result.isCurrentCourse && (
                    <div className="mt-1 text-xs text-primary font-medium">
                      Currently in your plan
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No courses found matching "{localSearchTerm}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
