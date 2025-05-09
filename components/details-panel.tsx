"use client";

import { useState, useEffect } from "react";
import type { Course } from "@/types/curriculum";
import { type StudentCourse, CourseStatus } from "@/types/student-plan";
import { Button } from "@/components/ui/button";
import { X, Check, Clock, AlertTriangle, GitGraph, Save } from "lucide-react";
import { getCourseInfo } from "@/parsers/curriculum-parser";
import { useStudentStore } from "@/lib/student-store"; // Changed from StudentStore to useStudentStore
import { STATUS_CLASSES } from "@/styles/course-theme";

interface StudentCourseDetailsPanelProps {
  setDependencyState: React.Dispatch<
    React.SetStateAction<{
      showDependencyTree: boolean;
      dependencyCourse: Course | null;
    }>
  >; // ADDED - To control dependency tree visibility
}

// painel de detalhes da disciplina, que aparece quando
// clica no quadradinho da disciplina
export default function StudentCourseDetailsPanel({
  setDependencyState,
}: StudentCourseDetailsPanelProps) {
  const studentStore = useStudentStore();

  const {
    selectedCourse,
    selectedStudentCourse,
    clearSelection,
    setCourseGrade,
    changeCourseStatus,
  } = studentStore;

  const course = selectedCourse;
  const studentCourse = selectedStudentCourse;

  if (!course || !studentCourse) {
    return null;
  }

  // State for grade input
  const [gradeInput, setGradeInput] = useState<string>(
    studentCourse?.grade !== undefined ? studentCourse.grade.toString() : "",
  );
  const [isEditingGrade, setIsEditingGrade] = useState<boolean>(false);
  const [gradeError, setGradeError] = useState<string>("");

  useEffect(() => {
    if (studentCourse?.grade !== undefined) {
      setGradeInput(studentCourse.grade.toString());
    } else {
      setGradeInput("");
    }

    // Simplified logic: Editing is allowed only if status is COMPLETED and grade is undefined
    setIsEditingGrade(
      (studentCourse?.status === CourseStatus.COMPLETED ||
        studentCourse?.status === CourseStatus.DEFAULT) &&
        studentCourse?.grade === undefined,
    );
    setGradeError("");
  }, [studentCourse]); // studentCourse from store is now the dependency

  // Handle saving the grade
  const handleSaveGrade = () => {
    if (!studentCourse) {
      console.error("handleSaveGrade: studentCourse is undefined"); // Keep error logs
      return;
    }

    const parseResult = parseFloat(gradeInput);
    if (isNaN(parseResult) || parseResult < 0 || parseResult > 10) {
      setGradeError("Grade must be between 0 and 10.");
      return;
    }
    setGradeError("");
    const grade = Math.round(parseResult * 2) / 2;

    // Use setCourseGrade from the store
    setCourseGrade(studentCourse, grade);
    setIsEditingGrade(false);
  };

  const handleClose = () => {
    clearSelection(); // Use clearSelection from the store
  };

  // Handle viewing dependencies
  const handleViewDependenciesClick = () => {
    if (course) {
      setDependencyState({
        showDependencyTree: true,
        dependencyCourse: course,
      });
      studentStore.clearSelection(); // Clear main selection when viewing dependencies
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40"
        onClick={handleClose} // Use internal handleClose
      />
      <div
        className="fixed right-0 top-0 h-full bg-background shadow-lg border-l border-border p-4 z-50 overflow-y-auto transform translate-x-0 transition-transform duration-200"
        style={{ width: "480px" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">
            {course?.id ?? "N/A"}
          </h3>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            {" "}
            {/* Use internal handleClose */}
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Course Name
            </h4>
            <p className="text-foreground">{course?.name ?? "N/A"}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Credits
            </h4>
            <p className="text-foreground">{course?.credits ?? "N/A"}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Workload
            </h4>
            <p className="text-foreground">
              {course?.workload ? `${course.workload} hours` : "N/A"}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Recommended Phase
            </h4>
            <p className="text-foreground">{course?.phase ?? "N/A"}</p>
          </div>

          {studentCourse?.grade !== undefined && !isEditingGrade && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Grade
              </h4>
              <div className="flex items-center gap-2">
                <p
                  className={
                    studentCourse.grade >= 6.0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {studentCourse.grade.toFixed(1)}
                </p>
                {(studentCourse.status === CourseStatus.COMPLETED ||
                  studentCourse.status === CourseStatus.FAILED) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingGrade(true)}
                    className="h-6 px-2 text-xs"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          )}

          {(isEditingGrade ||
            (studentCourse?.status === CourseStatus.COMPLETED &&
              studentCourse?.grade === undefined)) && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Grade
              </h4>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={gradeInput}
                    onChange={(e) => {
                      setGradeInput(e.target.value);
                      setGradeError("");
                    }}
                    onBlur={handleSaveGrade}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveGrade();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={`border rounded px-2 py-1 w-20 text-sm bg-background text-foreground
                      ${gradeError ? "border-red-500 dark:border-red-400 focus:border-red-500 focus:ring-red-500" : "border-input focus:border-blue-500 focus:ring-blue-500"}
                      focus:outline-none focus:ring-1`}
                    placeholder="0-10"
                    disabled={!studentCourse}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveGrade}
                    className="h-8 px-3"
                    disabled={!studentCourse || gradeError !== ""}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </div>
                {gradeError && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                    {gradeError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Enter a grade between 0-10 (rounded to nearest 0.5).
                  {parseFloat(gradeInput) >= 0 &&
                    !isNaN(parseFloat(gradeInput)) &&
                    parseFloat(gradeInput) <= 10 && (
                      <span className="font-medium">
                        {" "}
                        Value will be saved as:{" "}
                        {Math.round(parseFloat(gradeInput) * 2) / 2}
                      </span>
                    )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Grades ≥ 6.0 will mark the course as{" "}
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Completed
                  </span>
                  , grades &lt; 6.0 will mark the course as{" "}
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    Failed
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Equivalents
            </h4>
            {course?.equivalents && course.equivalents.length > 0 ? (
              <ul className="list-disc pl-5 text-foreground">
                {course.equivalents.map((eq) => {
                  const equivalentCourse = getCourseInfo(eq);
                  return (
                    <li key={eq}>
                      {eq}{" "}
                      {equivalentCourse?.name
                        ? `- ${equivalentCourse.name}`
                        : ""}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-foreground">No equivalents</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Prerequisites
            </h4>
            {course?.prerequisites && course.prerequisites.length > 0 ? (
              <ul className="list-disc pl-5 text-foreground">
                {course.prerequisites.map((prereq) => {
                  const prerequisiteCourse = getCourseInfo(prereq);
                  return (
                    <li key={prereq}>
                      {prereq}{" "}
                      {prerequisiteCourse?.name
                        ? `- ${prerequisiteCourse.name}`
                        : ""}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-foreground">No prerequisites</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">
              Description
            </h4>
            <ul className="list-disc pl-5 text-foreground">
              {course?.description ?? "No description"}
            </ul>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {course?.prerequisites && course.prerequisites.length > 0 && (
            <Button
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
              onClick={handleViewDependenciesClick} // Use the new internal handler
            >
              <GitGraph className="h-4 w-4" />
              View Dependency Tree
            </Button>
          )}

          <Button
            className="w-full"
            variant={
              studentCourse?.status === CourseStatus.IN_PROGRESS
                ? "default"
                : "outline"
            }
            onClick={() =>
              changeCourseStatus(
                // Use changeCourseStatus from the store
                studentCourse!,
                CourseStatus.IN_PROGRESS,
              )
            }
            disabled={!studentCourse}
          >
            Mark as In Progress
          </Button>

          <Button
            variant={
              studentCourse?.status === CourseStatus.COMPLETED
                ? "default"
                : "outline"
            }
            className="w-full"
            onClick={() => {
              // Toggle editing grade if already completed with a grade
              if (
                studentCourse?.status === CourseStatus.COMPLETED &&
                studentCourse?.grade !== undefined
              ) {
                setIsEditingGrade(!isEditingGrade);
              } else {
                // If changing status to COMPLETED, or if grade is undefined, enable editing
                setIsEditingGrade(true);
                // Set input value based on potential existing grade
                setGradeInput(
                  studentCourse?.grade !== undefined
                    ? studentCourse.grade.toString()
                    : "",
                );
              }
            }}
            disabled={!studentCourse}
          >
            Mark as Completed
          </Button>

          <Button
            variant={
              studentCourse?.status === CourseStatus.PLANNED
                ? "default"
                : "outline"
            }
            className="w-full"
            onClick={() => {
              if (!studentCourse) return;
              changeCourseStatus(studentCourse, CourseStatus.PLANNED); // Use changeCourseStatus from the store
              setGradeInput("");
              setIsEditingGrade(false);
            }}
            disabled={!studentCourse}
          >
            Mark as Planned
          </Button>
        </div>
      </div>
    </>
  );
}
