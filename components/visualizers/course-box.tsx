"use client";

// react apenas
import { Check, Clock, AlertTriangle, Lock } from "lucide-react";
import React, { useRef, useEffect, useMemo, memo } from "react";

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

// drag-and-drop (pointer-events based, see lib/course-drag.ts for why)
import {
  setCourseDragPayload,
  COURSE_DRAG_START,
  COURSE_DRAG_END,
  COURSE_DRAG_ENTER,
  COURSE_DRAG_LEAVE,
  COURSE_DROP,
  type DragSourceVisualizer,
} from "@/lib/course-drag";

function blocksCountStyle(count: number): React.CSSProperties {
  if (count >= 9) return { color: "#dc2626", backgroundColor: "#fee2e2" };
  if (count >= 4) return { color: "#ea580c", backgroundColor: "#ffedd5" };
  return { color: "#d97706", backgroundColor: "#fef3c7" };
}

// Distance the pointer has to travel before a press turns into a drag,
// so a plain click still opens the details panel instead of starting one.
const DRAG_THRESHOLD = 5;
// How close (in px) to the top/bottom of the viewport triggers autoscroll.
const EDGE_SIZE = 140;
// Autoscroll speed (px/frame) at the very edge of the viewport.
const MAX_SPEED = 20;
// Autoscroll is suppressed within this margin of the trash drop zone, so
// hovering over it (which sits near the bottom of the screen) doesn't also
// drag the page down.
const TRASH_EXCLUSION_MARGIN = 60;

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
  // A drag that just ended fires a synthetic click right after pointerup;
  // this suppresses that one click so dragging doesn't also open the details panel.
  const suppressClickRef = useRef(false);

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

  // Set up drag via Pointer Events instead of native HTML5 drag-and-drop.
  useEffect(() => {
    const el = courseBoxRef.current;
    if (!el || !isDraggable || isEmpty) return;

    const sourceVisualizer: DragSourceVisualizer = isFromCurriculum ? "curriculum" : "progress";

    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let clientX = 0;
    let clientY = 0;
    let ghostEl: HTMLDivElement | null = null;
    let currentTarget: HTMLElement | null = null;
    let rafId: number | null = null;

    const moveGhost = () => {
      if (!ghostEl) return;
      ghostEl.style.transform = `translate(${clientX - position.width / 2}px, ${clientY - position.height / 2}px)`;
    };

    const findDropTarget = (x: number, y: number): HTMLElement | null => {
      const hit = document.elementFromPoint(x, y);
      return (hit as HTMLElement | null)?.closest<HTMLElement>("[data-drop-target]") ?? null;
    };

    const isNearTrash = (x: number, y: number) => {
      const trashEl = document.querySelector<HTMLElement>('[data-drop-target="trash"]');
      if (!trashEl) return false;
      const rect = trashEl.getBoundingClientRect();
      return (
        x >= rect.left - TRASH_EXCLUSION_MARGIN &&
        x <= rect.right + TRASH_EXCLUSION_MARGIN &&
        y >= rect.top - TRASH_EXCLUSION_MARGIN &&
        y <= rect.bottom + TRASH_EXCLUSION_MARGIN
      );
    };

    const scrollTick = () => {
      if (!dragging) return;
      if (!isNearTrash(clientX, clientY)) {
        const { innerHeight } = window;
        let speed = 0;
        if (clientY < EDGE_SIZE) {
          const intensity = (EDGE_SIZE - clientY) / EDGE_SIZE;
          speed = -Math.ceil(intensity * intensity * MAX_SPEED);
        } else if (clientY > innerHeight - EDGE_SIZE) {
          const intensity = (clientY - (innerHeight - EDGE_SIZE)) / EDGE_SIZE;
          speed = Math.ceil(intensity * intensity * MAX_SPEED);
        }
        if (speed !== 0) window.scrollBy(0, speed);
      }
      rafId = requestAnimationFrame(scrollTick);
    };

    const setTarget = (target: HTMLElement | null) => {
      if (target === currentTarget) return;
      if (currentTarget) currentTarget.dispatchEvent(new CustomEvent(COURSE_DRAG_LEAVE));
      currentTarget = target;
      if (currentTarget) currentTarget.dispatchEvent(new CustomEvent(COURSE_DRAG_ENTER));
    };

    const startDrag = () => {
      dragging = true;
      setCourseDragPayload({ studentCourse, sourceVisualizer });

      if (pointerId !== null) {
        try { el.setPointerCapture(pointerId); } catch { /* no-op */ }
      }

      ghostEl = document.createElement("div");
      ghostEl.className = `${CSS_CLASSES.COURSE_BOX} ${statusClass}`;
      ghostEl.style.width = `${position.width}px`;
      ghostEl.style.height = `${position.height}px`;
      ghostEl.style.position = "fixed";
      ghostEl.style.left = "0px";
      ghostEl.style.top = "0px";
      ghostEl.style.zIndex = "9999";
      ghostEl.style.pointerEvents = "none";
      ghostEl.style.opacity = "0.9";
      ghostEl.style.transition = "none";
      ghostEl.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="${CSS_CLASSES.COURSE_ID}">${studentCourse.course.id}</div>
        </div>
        <div class="${CSS_CLASSES.COURSE_NAME}">${studentCourse.course.name}</div>
      `;
      document.body.appendChild(ghostEl);
      moveGhost();

      window.dispatchEvent(new CustomEvent(COURSE_DRAG_START, { detail: { sourceVisualizer } }));
      if (onDragStart) onDragStart(studentCourse.course);

      rafId = requestAnimationFrame(scrollTick);
    };

    const endDrag = (dropped: boolean) => {
      if (dragging) {
        if (dropped && currentTarget) currentTarget.dispatchEvent(new CustomEvent(COURSE_DROP));
        setTarget(null);
        window.dispatchEvent(new CustomEvent(COURSE_DRAG_END));
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 0);
      }
      if (ghostEl?.parentNode) ghostEl.parentNode.removeChild(ghostEl);
      ghostEl = null;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      if (pointerId !== null) {
        try { el.releasePointerCapture(pointerId); } catch { /* no-op */ }
      }
      setCourseDragPayload(null);
      dragging = false;
      pointerId = null;
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
    };

    const handlePointerMove = (e: PointerEvent) => {
      clientX = e.clientX;
      clientY = e.clientY;

      if (!dragging) {
        if (Math.hypot(clientX - startX, clientY - startY) < DRAG_THRESHOLD) return;
        startDrag();
      }

      e.preventDefault();
      moveGhost();
      setTarget(findDropTarget(clientX, clientY));
    };

    const handlePointerUp = (e: PointerEvent) => {
      clientX = e.clientX;
      clientY = e.clientY;
      endDrag(dragging);
    };

    const handlePointerCancel = () => endDrag(false);

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      clientX = e.clientX;
      clientY = e.clientY;
      pointerId = e.pointerId;
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerCancel);
    };

    el.addEventListener("pointerdown", handlePointerDown);
    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (ghostEl?.parentNode) ghostEl.parentNode.removeChild(ghostEl);
    };
  }, [studentCourse, position, isDraggable, isEmpty, onDragStart, statusClass, isFromCurriculum]);

  const isStub =
    /OPT/i.test(studentCourse.course.id) ||
    /optativa/i.test(studentCourse.course.name ?? "");

  const handleCourseClick = () => {
    if (suppressClickRef.current) return;
    if (!isEmpty && !isStub) selectCourse(studentCourse, studentCourse.course);
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
        touchAction: isDraggable && !isEmpty ? "none" : undefined,
      }}
      onClick={handleCourseClick}
      data-course-id={studentCourse.course.id}
      role={isDraggable && !isEmpty ? "button" : undefined}
      aria-label={isDraggable && !isEmpty ? `Drag course ${studentCourse.course.id}` : undefined}
    >
      {!isEmpty && (
        <>
          <div className="flex items-center justify-between">
            <div className={CSS_CLASSES.COURSE_ID}>{studentCourse.course.id}</div>
            <div className="flex items-center gap-0.5">
              {studentCourse.blocksCount != null && studentCourse.blocksCount > 0 && (
                <span
                  className="flex items-center gap-0.5 text-xs font-semibold leading-none px-1.5 py-1 rounded"
                  style={blocksCountStyle(studentCourse.blocksCount)}
                  title={`Desbloqueia ${studentCourse.blocksCount} disciplina${studentCourse.blocksCount !== 1 ? "s" : ""}`}
                >
                  <Lock className="w-3 h-3" />
                  {studentCourse.blocksCount}
                </span>
              )}
              {statusIcon}
            </div>
          </div>
          <div className={CSS_CLASSES.COURSE_NAME}>{studentCourse.course.name}</div>
        </>
      )}
    </div>
  );
});

export default CourseBox;
