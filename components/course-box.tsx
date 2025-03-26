"use client"

// react apenas
import { Check, Clock, AlertTriangle } from "lucide-react"
import { useRef, useEffect } from "react"

// utils
import { cn } from "@/lib/utils"

// tipos de dados
import type { Course } from "@/types/curriculum"
import type { CoursePosition } from "@/types/visualization"
import type { StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"

// config
import { COURSE_BOX } from "@/config/visualization"

interface CourseBoxProps {
  course: Course
  position: CoursePosition
  onClick?: () => void
  studentCourse?: StudentCourse
  isPlaceholder?: boolean
  isEmpty?: boolean
  isDraggable?: boolean
  onDragStart?: (course: Course) => void
}


// quadradinho de cada disciplina, que aparece nos visualizadores
// recebe um course e uma posicao, e renderiza o quadradinho
// so tem bastantinho switch case pra decidir a cor e o icone dele
export default function CourseBox({ 
  course, 
  position, 
  onClick, 
  studentCourse,
  isEmpty = false,
  isDraggable = false,
  onDragStart,
}: CourseBoxProps) {
  const courseBoxRef = useRef<HTMLDivElement>(null)

  // pega cor
  const getStatusColor = () => {
    if (isEmpty) {
      return isEmpty 
        ? "course-empty"
        : "course-empty-alt"
    }

    if (!studentCourse) return "course-default"

    switch (studentCourse.status) {
      case CourseStatus.COMPLETED:
        return "course-completed"
      case CourseStatus.IN_PROGRESS:
        return "course-in-progress"
      case CourseStatus.FAILED:
        return "course-failed"
      case CourseStatus.PLANNED:
        return "course-planned"
      case CourseStatus.EXEMPTED:
        return "course-exempted"
      default:
        return "course-default"
    }
  }

  // pega icone
  const getStatusIcon = () => {
    if (isEmpty) return null
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

  // Set up drag events
  useEffect(() => {
    const el = courseBoxRef.current
    if (!el || !isDraggable || isEmpty) return

    const handleDragStart = (e: DragEvent) => {
      // Create a ghost image for dragging
      const ghostEl = document.createElement('div')
      ghostEl.className = `rounded p-2 shadow-md ${getStatusColor()}`
      ghostEl.style.width = `${position.width}px`
      ghostEl.style.height = `${position.height}px`
      ghostEl.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold">${course.id}</div>
        </div>
        <div class="text-xs truncate">${course.name}</div>
      `
      
      // Position off-screen to not interfere with the actual drag
      ghostEl.style.position = 'absolute'
      ghostEl.style.left = '-9999px'
      document.body.appendChild(ghostEl)
      
      // Set the drag image
      e.dataTransfer?.setDragImage(ghostEl, position.width / 2, position.height / 2)
      
      // Set the drag data
      e.dataTransfer?.setData('application/json', JSON.stringify({
        courseId: course.id,
        courseName: course.name,
        coursePhase: course.phase,
        courseCredits: course.credits,
        sourceVisualizer: studentCourse ? 'progress' : 'curriculum'
      }))
      
      // Call the drag start handler if provided
      if (onDragStart) {
        onDragStart(course)
      }
      
      // Clean up the ghost element after a short delay
      setTimeout(() => {
        document.body.removeChild(ghostEl)
      }, 100)
    }

    el.addEventListener('dragstart', handleDragStart)
    
    return () => {
      el.removeEventListener('dragstart', handleDragStart)
    }
  }, [course, position, isDraggable, isEmpty, onDragStart, getStatusColor])

  return (
    <div
      ref={courseBoxRef}
      className={cn(
        "absolute rounded p-2 transition-all",
        !isEmpty && "cursor-pointer shadow-sm hover:shadow-md",
        isDraggable && !isEmpty && "cursor-grab active:cursor-grabbing",
        getStatusColor()
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        opacity: isEmpty && !studentCourse ? 0.4 : 1,
      }}
      onClick={!isEmpty ? onClick : undefined}
      data-course-id={course.id}
      draggable={isDraggable && !isEmpty}
      role={isDraggable && !isEmpty ? "button" : undefined}
      aria-label={isDraggable && !isEmpty ? `Drag course ${course.id}` : undefined}
    >
      {!isEmpty && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold">{course.id}</div>
            {getStatusIcon()}
          </div>
          <div className="text-xs truncate">{course.name}</div>
        </>
      )}
    </div>
  )
}

