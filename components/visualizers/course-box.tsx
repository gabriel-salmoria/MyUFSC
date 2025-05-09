"use client";

// react apenas
import { Check, Clock, AlertTriangle } from "lucide-react";
import { useRef, useEffect } from "react";

// utils
import { cn } from "@/components/ui/utils";

// tipos de dados
import type { Course } from "@/types/curriculum";
import type { CoursePosition } from "@/types/visualization";
import type { StudentCourse } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";

// config
import { COURSE_BOX } from "@/styles/visualization";
import {
  STATUS_CLASSES,
  CSS_CLASSES,
  STATUS_COLORS,
} from "@/styles/course-theme";

// store
import { useStudentStore } from "@/lib/student-store"; // Added

interface CourseBoxProps {
  position: CoursePosition;
  studentCourse: StudentCourse;
  isEmpty?: boolean;
  isDraggable?: boolean;
  onDragStart?: (course: StudentCourse) => void; // Corrected type
  isFromCurriculum?: boolean; // Added
}

// quadradinho de cada disciplina, que aparece nos visualizadores
// recebe um course e uma posicao, e renderiza o quadradinho
// so tem bastantinho switch case pra decidir a cor e o icone dele
export default function CourseBox({
  position,
  studentCourse,
  isEmpty = false,
  isDraggable = false,
  onDragStart,
  isFromCurriculum, // Include in destructured props
}: CourseBoxProps) {
  const courseBoxRef = useRef<HTMLDivElement>(null);
  const studentStore = useStudentStore(); // Added

  // Get appropriate status class based on course status
  const getStatusClass = () => {
    if (isEmpty) {
      return isEmpty ? STATUS_CLASSES.EMPTY : STATUS_CLASSES.EMPTY_ALT;
    }

    if (isFromCurriculum && studentCourse.status != CourseStatus.COMPLETED) {
      return STATUS_CLASSES.DEFAULT;
    }

    if (studentCourse.status === CourseStatus.COMPLETED) {
      return STATUS_CLASSES.COMPLETED;
    } else if (studentCourse.status === CourseStatus.IN_PROGRESS) {
      return STATUS_CLASSES.IN_PROGRESS;
    } else if (studentCourse.status === CourseStatus.FAILED) {
      return STATUS_CLASSES.FAILED;
    } else if (studentCourse.status === CourseStatus.PLANNED) {
      return STATUS_CLASSES.PLANNED;
    } else {
      return STATUS_CLASSES.DEFAULT;
    }
  };

  // Get appropriate status icon based on course status
  const getStatusIcon = () => {
    if (isEmpty) return null;
    if (isFromCurriculum) return null;

    switch (studentCourse.status) {
      case CourseStatus.COMPLETED:
        return (
          <Check
            className="w-3 h-3"
            style={{ color: STATUS_COLORS.COMPLETED.icon }}
          />
        );
      case CourseStatus.IN_PROGRESS:
        return (
          <Clock
            className="w-3 h-3"
            style={{ color: STATUS_COLORS.IN_PROGRESS.icon }}
          />
        );
      case CourseStatus.FAILED:
        return (
          <AlertTriangle
            className="w-3 h-3"
            style={{ color: STATUS_COLORS.FAILED.icon }}
          />
        );
      case CourseStatus.PLANNED:
        return (
          <Clock
            className="w-3 h-3"
            style={{ color: STATUS_COLORS.PLANNED.icon }}
          />
        );
      default:
        return null;
    }
  };

  // Set up drag events
  useEffect(() => {
    const el = courseBoxRef.current;
    if (!el || !isDraggable || isEmpty) return;

    const handleDragStart = (e: DragEvent) => {
      if (!e.dataTransfer) return;

      // Set effects
      e.dataTransfer.effectAllowed = "move";

      // Create a ghost image for dragging
      const ghostEl = document.createElement("div");
      ghostEl.className = `${CSS_CLASSES.COURSE_BOX} ${getStatusClass()}`;
      ghostEl.style.width = `${position.width}px`;
      ghostEl.style.height = `${position.height}px`;
      ghostEl.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="${CSS_CLASSES.COURSE_ID}">${studentCourse.course.id}</div>
        </div>
        <div class="${CSS_CLASSES.COURSE_NAME}">${studentCourse.course.name}</div>
      `;

      // Position off-screen to not interfere with the actual drag
      ghostEl.style.position = "absolute";
      ghostEl.style.left = "-9999px";
      document.body.appendChild(ghostEl);

      // Set the drag image
      e.dataTransfer.setDragImage(
        ghostEl,
        position.width / 2,
        position.height / 2,
      );

      // Set the drag data - include both application/json and text/plain
      const dragData = JSON.stringify({
        studentCourse,
        sourceVisualizer: isFromCurriculum ? "curriculum" : "progress", // Use new prop
      });

      e.dataTransfer.setData("application/json", dragData);
      e.dataTransfer.setData("text/plain", dragData);

      // Call the drag start handler if provided
      if (onDragStart) {
        onDragStart(studentCourse.course);
      }

      // Clean up the ghost element after a short delay
      setTimeout(() => {
        document.body.removeChild(ghostEl);
      }, 100);
    };

    el.addEventListener("dragstart", handleDragStart);

    return () => {
      el.removeEventListener("dragstart", handleDragStart);
    };
  }, [
    studentCourse,
    position,
    isDraggable,
    isEmpty,
    onDragStart,
    getStatusClass,
  ]); // Added studentCourse to dependency array

  const handleCourseClick = () => {
    // Added
    console.log("CourseBox clicked:", studentCourse);
    if (!isEmpty) {
      studentStore.selectCourse(studentCourse);
    }
  };

  return (
    <div
      ref={courseBoxRef}
      className={cn(
        CSS_CLASSES.COURSE_BOX,
        getStatusClass(),
        isDraggable && !isEmpty && CSS_CLASSES.DRAGGABLE,
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        opacity: isEmpty && !studentCourse ? 0.4 : 1,
      }}
      onClick={handleCourseClick} // Re-attached internal handler
      data-course-id={studentCourse.course.id}
      draggable={isDraggable && !isEmpty}
      role={isDraggable && !isEmpty ? "button" : undefined}
      aria-label={
        isDraggable && !isEmpty
          ? `Drag course ${studentCourse.course.id}`
          : undefined
      }
    >
      {!isEmpty && (
        <>
          <div className="flex items-center justify-between">
            <div className={CSS_CLASSES.COURSE_ID}>
              {studentCourse.course.id}
            </div>
            {getStatusIcon()}
          </div>
          <div className={CSS_CLASSES.COURSE_NAME}>
            {studentCourse.course.name}
          </div>
        </>
      )}
    </div>
  );
}
