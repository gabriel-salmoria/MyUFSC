"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import { COURSE_BOX } from "@/styles/visualization";
import {
  getCourseDragPayload,
  COURSE_DRAG_ENTER,
  COURSE_DRAG_LEAVE,
  COURSE_DROP,
} from "@/lib/course-drag";

// GhostCourseBox Component
interface GhostCourseBoxProps {
  position: {
    courseId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  semesterNumber: number;
  positionIndex: number;
}

export default function GhostCourseBox({
  position,
  semesterNumber,
  positionIndex,
}: GhostCourseBoxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleEnter = () => setIsDragOver(true);
    const handleLeave = () => setIsDragOver(false);

    const handleDrop = () => {
      setIsDragOver(false);
      const data = getCourseDragPayload();
      if (!data) return;

      if (data.sourceVisualizer === "progress") {
        window.dispatchEvent(
          new CustomEvent("request-course-drop", {
            detail: { type: "move", studentCourse: data.studentCourse, phase: semesterNumber },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("request-course-drop", {
            detail: { type: "add", course: data.studentCourse.course, phase: semesterNumber },
          })
        );
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
  }, [semesterNumber]);

  return (
    <div
      className="absolute"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div
        ref={ref}
        className={cn(CSS_CLASSES.GHOST_BOX, isDragOver && CSS_CLASSES.GHOST_BOX_DRAG_OVER)}
        style={{
          width: `${position.width}px`,
          height: `${position.height}px`,
          opacity: COURSE_BOX.GHOST_OPACITY,
        }}
        data-drop-target="ghost"
        data-semester={semesterNumber}
        data-position={positionIndex}
      ></div>
    </div>
  );
}
