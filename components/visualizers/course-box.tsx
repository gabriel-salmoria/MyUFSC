"use client";

// react apenas
import { Check, Clock, AlertTriangle } from "lucide-react";
import { useRef, useEffect, useMemo, memo } from "react";

// utils
import { cn } from "@/components/ui/utils";

// tipos de dados
import type { CoursePosition, ViewStudentCourse } from "@/types/visualization";
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
import { useStudentStore } from "@/lib/student-store";

interface CourseBoxProps {
  position: CoursePosition;
  studentCourse: ViewStudentCourse;
  isEmpty?: boolean;
  isDraggable?: boolean;
  onDragStart?: (course: import("@/types/curriculum").Course) => void;
  isFromCurriculum?: boolean;
}

// quadradinho de cada disciplina, que aparece nos visualizadores
// recebe um course e uma posicao, e renderiza o quadradinho
// so tem bastantinho switch case pra decidir a cor e o icone dele
const CourseBox = memo(function CourseBox({
  position,
  studentCourse,
  isEmpty = false,
  isDraggable = false,
  onDragStart,
  isFromCurriculum,
}: CourseBoxProps) {
  const courseBoxRef = useRef<HTMLDivElement>(null);
  const selectCourse = useStudentStore((s) => s.selectCourse);

  const statusClass = useMemo(() => {
    if (isEmpty) return STATUS_CLASSES.EMPTY;
    switch (studentCourse.status) {
      case CourseStatus.COMPLETED: return STATUS_CLASSES.COMPLETED;
      case CourseStatus.IN_PROGRESS: return STATUS_CLASSES.IN_PROGRESS;
      case CourseStatus.FAILED: return STATUS_CLASSES.FAILED;
      case CourseStatus.PLANNED: return STATUS_CLASSES.PLANNED;
      default: return STATUS_CLASSES.DEFAULT;
    }
  }, [isEmpty, studentCourse.status]);

  const statusIcon = useMemo(() => {
    if (isEmpty) return null;
    switch (studentCourse.status) {
      case CourseStatus.COMPLETED:
        return <Check className="w-3 h-3" style={{ color: STATUS_COLORS.COMPLETED.icon }} />;
      case CourseStatus.IN_PROGRESS:
        return <Clock className="w-3 h-3" style={{ color: STATUS_COLORS.IN_PROGRESS.icon }} />;
      case CourseStatus.FAILED:
        return <AlertTriangle className="w-3 h-3" style={{ color: STATUS_COLORS.FAILED.icon }} />;
      case CourseStatus.PLANNED:
        return <Clock className="w-3 h-3" style={{ color: STATUS_COLORS.PLANNED.icon }} />;
      default:
        return null;
    }
  }, [isEmpty, studentCourse.status]);

  // Set up drag events
  useEffect(() => {
    const el = courseBoxRef.current;
    if (!el || !isDraggable || isEmpty) return;

    const handleDragStart = (e: DragEvent) => {
      if (!e.dataTransfer) return;

      e.dataTransfer.effectAllowed = "move";

      const ghostEl = document.createElement("div");
      ghostEl.className = `${CSS_CLASSES.COURSE_BOX} ${statusClass}`;
      ghostEl.style.width = `${position.width}px`;
      ghostEl.style.height = `${position.height}px`;
      ghostEl.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="${CSS_CLASSES.COURSE_ID}">${studentCourse.course.id}</div>
        </div>
        <div class="${CSS_CLASSES.COURSE_NAME}">${studentCourse.course.name}</div>
      `;

      ghostEl.style.position = "absolute";
      ghostEl.style.left = "-9999px";
      document.body.appendChild(ghostEl);

      e.dataTransfer.setDragImage(ghostEl, position.width / 2, position.height / 2);

      const dragData = JSON.stringify({
        studentCourse,
        sourceVisualizer: isFromCurriculum ? "curriculum" : "progress",
      });

      e.dataTransfer.setData("application/json", dragData);
      e.dataTransfer.setData("text/plain", dragData);

      if (onDragStart) onDragStart(studentCourse.course);

      setTimeout(() => {
        document.body.removeChild(ghostEl);
      }, 100);
    };

    el.addEventListener("dragstart", handleDragStart);
    return () => { el.removeEventListener("dragstart", handleDragStart); };
  }, [studentCourse, position, isDraggable, isEmpty, onDragStart, statusClass, isFromCurriculum]);

  const handleCourseClick = () => {
    if (!isEmpty) selectCourse(studentCourse, studentCourse.course);
  };

  return (
    <div
      ref={courseBoxRef}
      className={cn(
        CSS_CLASSES.COURSE_BOX,
        statusClass,
        isDraggable && !isEmpty && CSS_CLASSES.DRAGGABLE,
        studentCourse?.isHighlighted && "ring-2 ring-primary ring-offset-1 ring-offset-background scale-[1.03] z-10 shadow-lg shadow-primary/20",
        studentCourse?.isDimmed && "opacity-30 saturate-50 pointer-events-none"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        opacity: isEmpty && !studentCourse ? 0.4 : 1,
      }}
      onClick={handleCourseClick}
      data-course-id={studentCourse.course.id}
      draggable={isDraggable && !isEmpty}
      role={isDraggable && !isEmpty ? "button" : undefined}
      aria-label={isDraggable && !isEmpty ? `Drag course ${studentCourse.course.id}` : undefined}
    >
      {!isEmpty && (
        <>
          <div className="flex items-center justify-between">
            <div className={CSS_CLASSES.COURSE_ID}>{studentCourse.course.id}</div>
            {statusIcon}
          </div>
          <div className={CSS_CLASSES.COURSE_NAME}>{studentCourse.course.name}</div>
        </>
      )}
    </div>
  );
});

export default CourseBox;
