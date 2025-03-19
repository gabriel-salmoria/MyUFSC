"use client"

import type { Course } from "@/types/curriculum"
import type { CoursePosition } from "@/types/visualization"
import { cn } from "@/lib/utils"

interface CourseBoxProps {
  course: Course
  position: CoursePosition
  onClick?: () => void
}

export default function CourseBox({ course, position, onClick }: CourseBoxProps) {
  return (
    <div
      className={cn(
        "absolute border-2 border-gray-500 rounded p-2 cursor-pointer transition-all shadow-sm hover:shadow-md bg-gray-100"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
      }}
      onClick={onClick}
    >
      <div className="text-xs font-bold">{course.id}</div>
      <div className="text-xs truncate">{course.name}</div>
    </div>
  )
}

