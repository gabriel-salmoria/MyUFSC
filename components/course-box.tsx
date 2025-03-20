"use client"

import type { Course } from "@/types/curriculum"
import type { CoursePosition } from "@/types/visualization"
import type { StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import { cn } from "@/lib/utils"
import { Check, Clock, AlertTriangle } from "lucide-react"

interface CourseBoxProps {
  course: Course
  position: CoursePosition
  onClick?: () => void
  studentCourse?: StudentCourse
}

export default function CourseBox({ course, position, onClick, studentCourse }: CourseBoxProps) {
  const getStatusColor = () => {
    if (!studentCourse) return "border-gray-500 bg-gray-100"

    switch (studentCourse.status) {
      case CourseStatus.COMPLETED:
        return "border-green-500 bg-green-50"
      case CourseStatus.IN_PROGRESS:
        return "border-blue-500 bg-blue-50"
      case CourseStatus.FAILED:
        return "border-red-500 bg-red-50"
      case CourseStatus.PLANNED:
        return "border-purple-500 bg-purple-50"
      case CourseStatus.EXEMPTED:
        return "border-yellow-500 bg-yellow-50"
      default:
        return "border-gray-500 bg-gray-100"
    }
  }

  const getStatusIcon = () => {
    if (!studentCourse) return null

    switch (studentCourse.status) {
      case CourseStatus.COMPLETED:
        return <Check className="w-3 h-3 text-green-600" />
      case CourseStatus.IN_PROGRESS:
        return <Clock className="w-3 h-3 text-blue-600" />
      case CourseStatus.FAILED:
        return <AlertTriangle className="w-3 h-3 text-red-600" />
      case CourseStatus.PLANNED:
        return <Clock className="w-3 h-3 text-purple-600" />
      case CourseStatus.EXEMPTED:
        return <Check className="w-3 h-3 text-yellow-600" />
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        "absolute border-2 rounded p-2 cursor-pointer transition-all shadow-sm hover:shadow-md",
        getStatusColor()
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
      }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold">{course.id}</div>
        {getStatusIcon()}
      </div>
      <div className="text-xs truncate">{course.name}</div>
    </div>
  )
}

