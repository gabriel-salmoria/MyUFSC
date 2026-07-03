"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useStudentStore } from "@/lib/student-store";
import {
  getCourseDragPayload,
  COURSE_DRAG_START,
  COURSE_DRAG_END,
  COURSE_DRAG_ENTER,
  COURSE_DRAG_LEAVE,
  COURSE_DROP,
} from "@/lib/course-drag";

export default function TrashDropZone() {
  const removeCourse = useStudentStore((s) => s.removeCourse);
  const [isDragging, setIsDragging] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isFromProgress, setIsFromProgress] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

  // Track drag lifecycle globally — the drag source tells us up front
  // (via the event detail) whether it started in the progress visualizer,
  // so we only need to show the trash for those drags.
  useEffect(() => {
    const handleDragStart = (e: Event) => {
      const detail = (e as CustomEvent<{ sourceVisualizer: string }>).detail;
      setIsDragging(true);
      setIsFromProgress(detail?.sourceVisualizer === "progress");
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      setIsActive(false);
      setIsFromProgress(false);
    };

    window.addEventListener(COURSE_DRAG_START, handleDragStart);
    window.addEventListener(COURSE_DRAG_END, handleDragEnd);
    return () => {
      window.removeEventListener(COURSE_DRAG_START, handleDragStart);
      window.removeEventListener(COURSE_DRAG_END, handleDragEnd);
    };
  }, []);

  // Hover feedback + the actual drop, scoped to the drop-target element itself.
  useEffect(() => {
    const el = zoneRef.current;
    if (!el || !isDragging || !isFromProgress) return;

    const handleEnter = () => setIsActive(true);
    const handleLeave = () => setIsActive(false);
    const handleDrop = () => {
      setIsActive(false);
      const data = getCourseDragPayload();
      if (!data) return;
      if (data.sourceVisualizer === "progress") {
        removeCourse(data.studentCourse);
        setIsDragging(false);
        setIsFromProgress(false);
      }
    };

    el.addEventListener(COURSE_DRAG_ENTER, handleEnter);
    el.addEventListener(COURSE_DRAG_LEAVE, handleLeave);
    el.addEventListener(COURSE_DROP, handleDrop);
    return () => {
      el.removeEventListener(COURSE_DRAG_ENTER, handleEnter);
      el.removeEventListener(COURSE_DRAG_LEAVE, handleLeave);
      el.removeEventListener(COURSE_DROP, handleDrop);
    };
  }, [isDragging, isFromProgress, removeCourse]);

  // Don't render if no drag or not from progress visualizer
  if (!isDragging || !isFromProgress) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div
          ref={zoneRef}
          data-drop-target="trash"
          className={`
            flex flex-col items-center justify-center
            w-36 h-36 rounded-full shadow-lg border-2
            ${isActive
              ? "bg-destructive text-destructive-foreground border-destructive-foreground/40 scale-110"
              : "bg-muted text-muted-foreground border-muted-foreground/30 scale-100"}
            transition-all duration-200
          `}
        >
          <Trash2 size={44} className={isActive ? "animate-bounce" : ""} />
          <div className="text-sm mt-1 font-medium text-center px-2">
            {isActive ? "Soltar para remover" : "Arraste aqui para remover"}
          </div>
        </div>
      </div>
    </div>
  );
}
