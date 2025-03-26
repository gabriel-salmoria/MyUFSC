"use client"

import { useState, useEffect } from "react"
import type { Course } from "@/types/curriculum"
import { type StudentCourse, CourseStatus } from "@/types/student-plan"
import { Button } from "@/components/ui/button"
import { X, Check, Clock, AlertTriangle, GitGraph, Save } from "lucide-react"
import { getCourseInfo } from "@/lib/curriculum-parser"

interface StudentCourseDetailsPanelProps {
  course: Course
  studentCourse?: StudentCourse
  onClose: () => void
  onStatusChange?: (courseId: string, status: CourseStatus) => void
  onGradeChange?: (courseId: string, grade: number) => void
  onViewDependencies?: () => void
}

// painel de detalhes da disciplina, que aparece quando clica no quadradinho da disciplina
export default function StudentCourseDetailsPanel({
  course,
  studentCourse,
  onClose,
  onStatusChange,
  onGradeChange,
  onViewDependencies,
}: StudentCourseDetailsPanelProps) {
  // State for grade input
  const [gradeInput, setGradeInput] = useState<string>(
    studentCourse?.grade !== undefined ? studentCourse.grade.toString() : ''
  );
  const [isEditingGrade, setIsEditingGrade] = useState<boolean>(false);
  const [gradeError, setGradeError] = useState<string>('');



  // Update grade input when studentCourse changes
  useEffect(() => {
    if (studentCourse?.grade !== undefined) {
      setGradeInput(studentCourse.grade.toString());
    } else {
      setGradeInput('');
    }
    
    // If the course is no longer completed, ensure we're not editing the grade
    if (studentCourse?.status !== CourseStatus.COMPLETED) {
      setIsEditingGrade(false);
    }
    
    // Clear any previous errors
    setGradeError('');
  }, [studentCourse]);

  // meio de seguranca, nao renderiza se nao houver course, mas acho q da pra tirar dps
  if (!course) {
    return null
  }

  // Handle saving the grade
  const handleSaveGrade = () => {
    if (!onGradeChange) return;
    
    const parseResult = parseFloat(gradeInput);
    if (!isNaN(parseResult) && parseResult >= 0 && parseResult <= 10) {
      // Clear any previous errors
      setGradeError('');
      
      // Round to the nearest 0.5
      const grade = Math.round(parseResult * 2) / 2;
      
      // First update the grade
      onGradeChange(course.id, grade);
      
      // Then set the appropriate status based on the grade
      if (onStatusChange) {
        const newStatus = grade >= 6.0 ? CourseStatus.COMPLETED : CourseStatus.FAILED;
        onStatusChange(course.id, newStatus);
      }
      
      setIsEditingGrade(false);
    } else {
      // If invalid, show error message
      setGradeError('Please enter a valid grade between 0 and 10');
      
      // Reset to the current grade or empty
      setGradeInput(studentCourse?.grade !== undefined ? studentCourse.grade.toString() : '');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full bg-white shadow-lg border-l p-4 z-50 overflow-y-auto transform translate-x-0 transition-transform duration-200" style={{ width: "480px" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{course.id}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Course Name</h4>
            <p>{course.name}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Credits</h4>
            <p>{course.credits}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Workload</h4>
            <p>{course.workload} hours</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Recommended Phase</h4>
            <p>{course.phase}</p>
          </div>

          {studentCourse?.grade !== undefined && !isEditingGrade && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Grade</h4>
              <div className="flex items-center gap-2">
                <p className={studentCourse.grade >= 6.0 ? "text-green-600" : "text-red-600"}>
                  {studentCourse.grade.toFixed(1)}
                </p>
                {studentCourse.status === CourseStatus.COMPLETED && (
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

          {/* Grade input for completed courses */}
          {(isEditingGrade || (studentCourse?.status === CourseStatus.COMPLETED && studentCourse?.grade === undefined)) && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Grade</h4>
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
                      setGradeError('');
                    }}
                    className={`border rounded px-2 py-1 w-20 text-sm ${gradeError ? 'border-red-500' : ''}`}
                    placeholder="0-10"
                  />
                  <Button 
                    size="sm"
                    onClick={handleSaveGrade}
                    className="h-8 px-3"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </div>
                {gradeError && (
                  <p className="text-red-500 text-xs mt-1">{gradeError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Enter a grade between 0-10 (rounded to nearest 0.5). 
                  {parseFloat(gradeInput) >= 0 && !isNaN(parseFloat(gradeInput)) && (
                    <span className="font-medium"> Value will be saved as: {Math.round(parseFloat(gradeInput) * 2) / 2}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Grades ≥ 6.0 will mark the course as <span className="text-green-600 font-medium">Completed</span>, 
                  grades &lt; 6.0 will mark the course as <span className="text-red-600 font-medium">Failed</span>.
                </p>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-muted-foreground"> Equivalents</h4>
            {(course.equivalents?.length ?? 0) > 0 ? (
              <ul className="list-disc pl-5">
                {course.equivalents?.map((eq) => (
                  <li key={eq}>{eq} {getCourseInfo(eq)?.name.toString()}</li>
                ))}
              </ul>
            ) : (
              <p>No equivalents</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Prerequisites</h4>
            {(course.prerequisites?.length ?? 0) > 0 ? (
              <ul className="list-disc pl-5">
                {course.prerequisites?.map((prereq) => (
                  <li key={prereq}>{prereq} - {getCourseInfo(prereq)?.name}</li>
                ))}
              </ul>
            ) : (
              <p>No prerequisites</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
              <ul className="list-disc pl-5">
                {course.description ?? "No description"}
              </ul>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {/* View Dependencies button */}
          {course.prerequisites && course.prerequisites.length > 0 && onViewDependencies && (
            <Button
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
              onClick={onViewDependencies}
            >
              <GitGraph className="h-4 w-4" />
              View Dependency Tree
            </Button>
          )}

          {/* Mark as In Progress button - always show */}
          <Button 
            className="w-full" 
            variant={studentCourse?.status === CourseStatus.IN_PROGRESS ? "default" : "outline"}
            onClick={() => onStatusChange?.(course.id, CourseStatus.IN_PROGRESS)}
          >
            Mark as In Progress
          </Button>

          {/* Mark as Completed button - always show */}
          <Button
            variant={studentCourse?.status === CourseStatus.COMPLETED ? "default" : "outline"}
            className="w-full"
            onClick={() => {
              // Don't immediately mark as completed, just show the grade input
              setIsEditingGrade(true);
            }}
          >
            Mark as Completed
          </Button>

          {/* Mark as Planned button - always show */}
          <Button
            variant={studentCourse?.status === CourseStatus.PLANNED ? "default" : "outline"}
            className="w-full"
            onClick={() => {
              onStatusChange?.(course.id, CourseStatus.PLANNED);
              // Reset the grade input when changing to planned
              setGradeInput('');
              setIsEditingGrade(false);
            }}
          >
            Mark as Planned
          </Button>
        </div>
      </div>
    </>
  )
}

