"use client"

import type { Course } from "@/types/curriculum"
import { type StudentCourse, CourseStatus } from "@/types/student-plan"
import { Button } from "@/components/ui/button"
import { X, Check, Clock, AlertTriangle } from "lucide-react"

interface StudentCourseDetailsPanelProps {
  course: Course
  studentCourse?: StudentCourse
  onClose: () => void
  onStatusChange?: (courseId: string, status: CourseStatus) => void
}

export default function StudentCourseDetailsPanel({
  course,
  studentCourse,
  onClose,
  onStatusChange,
}: StudentCourseDetailsPanelProps) {
  // Add safety check to prevent rendering if course is undefined
  if (!course) {
    return null
  }

  const getStatusBadge = () => {
    if (!studentCourse){
      console.log("No student course found", course)
       return null
    }

    switch (studentCourse.status) {
      case CourseStatus.COMPLETED:
        return (
          <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs">
            <Check className="w-3 h-3" />
            Completed
          </div>
        )
      case CourseStatus.IN_PROGRESS:
        return (
          <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs">
            <Clock className="w-3 h-3" />
            In Progress
          </div>
        )
      case CourseStatus.PLANNED:
        return (
          <div className="flex items-center gap-1 text-purple-600 bg-purple-50 px-2 py-1 rounded-full text-xs">
            <Clock className="w-3 h-3" />
            Planned
          </div>
        )
      case CourseStatus.FAILED:
        return (
          <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </div>
        )
      default:
        return null
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-lg border-l p-4 z-50 overflow-y-auto transform translate-x-0 transition-transform duration-200">
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

          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Prerequisites</h4>
            {course.prerequisites.length > 0 ? (
              <ul className="list-disc pl-5">
                {course.prerequisites.map((prereq) => (
                  <li key={prereq}>{prereq}</li>
                ))}
              </ul>
            ) : (
              <p>No prerequisites</p>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {!studentCourse || studentCourse.status === CourseStatus.PLANNED ? (
            <Button className="w-full" onClick={() => onStatusChange?.(course.id, CourseStatus.IN_PROGRESS)}>
              Mark as In Progress
            </Button>
          ) : null}

          {!studentCourse || studentCourse.status !== CourseStatus.COMPLETED ? (
            <Button
              variant={!studentCourse || studentCourse.status === CourseStatus.PLANNED ? "outline" : "default"}
              className="w-full"
              onClick={() => onStatusChange?.(course.id, CourseStatus.COMPLETED)}
            >
              Mark as Completed
            </Button>
          ) : null}

          {studentCourse && studentCourse.status !== CourseStatus.PLANNED ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onStatusChange?.(course.id, CourseStatus.PLANNED)}
            >
              Mark as Planned
            </Button>
          ) : null}
        </div>
      </div>
    </>
  )
}

