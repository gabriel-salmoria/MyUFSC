// components/visualizers/phase.tsx
"use client";

import { useMemo } from "react";
import { MousePointerClick } from "lucide-react";
import type { ViewStudentCourse } from "@/types/visualization";
import { COURSE_BOX, PHASE } from "@/styles/visualization";
import CourseBox from "@/components/visualizers/course-box";
import GhostCourseBox from "@/components/visualizers/ghost-box";
import { cn } from "@/components/ui/utils";

interface PhaseProps {
  semesterNumber: number;
  studentCourses: ViewStudentCourse[];
  width?: number;
  isFromCurriculum?: boolean;
  totalSlots?: number;
  onHeaderClick?: () => void;
}

export default function Phase({
  semesterNumber,
  studentCourses,
  width = PHASE.MIN_WIDTH,
  isFromCurriculum = true,
  totalSlots: explicitTotalSlots,
  onHeaderClick,
}: PhaseProps) {
  const boxWidth = useMemo(() => {
    return Math.max(COURSE_BOX.MIN_WIDTH, width * COURSE_BOX.WIDTH_FACTOR);
  }, [width]);

  // Calculate horizontal centering offset for the boxes
  const xOffset = useMemo(() => {
    return (width - boxWidth) / 2;
  }, [width, boxWidth]);

  // Stable position objects so CourseBox drag useEffect doesn't re-run on every render
  const positions = useMemo(() =>
    studentCourses.map((sc, index) => ({
      // Use instanceId as the position key so two instances of the same course
      // don't share a React identity. Fall back to courseId+index for legacy data.
      courseId: sc.instanceId ?? `${sc.course.id}-${index}`,
      x: xOffset,
      y: index * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
      width: boxWidth,
      height: COURSE_BOX.HEIGHT,
    })),
    [studentCourses, xOffset, boxWidth],
  );

  // Estimate header height (adjust if needed)
  const headerHeight = 0; // px, adjust to match your actual header height

  // Calculate dynamic slots
  const minSlots = 6;
  const utilizedSlots = studentCourses.length;

  // Use explicit total slots if provided, otherwise calculate locally
  const totalSlots =
    explicitTotalSlots || Math.max(minSlots, utilizedSlots + 1);

  // Calculate total phase height:
  // Last box bottom = totalSlots * SPACING_Y + HEIGHT
  // Add some bottom padding
  const bottomPadding = 30;
  const phaseHeight =
    totalSlots * COURSE_BOX.SPACING_Y + COURSE_BOX.HEIGHT + bottomPadding;

  return (
    <div
      className="relative border border-border"
      style={{ width: `${width}px`, height: `${phaseHeight}px` }}
    >
      {/* Phase header */}
      <div
        className={cn(
          "sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-2 py-3 border-b border-border transition-all flex items-center justify-center gap-1 group",
          onHeaderClick
            ? "cursor-pointer hover:bg-primary/5 hover:text-primary hover:border-primary/30"
            : "",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onHeaderClick?.();
        }}
        title={onHeaderClick ? "Clique para ver dependências" : undefined}
      >
        <span className="font-medium">Fase {semesterNumber}</span>
        {onHeaderClick && (
          <MousePointerClick className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Course boxes - positioned dynamically within the phase */}
      {studentCourses.map((studentCourse: ViewStudentCourse, index) => (
        <CourseBox
          key={studentCourse.instanceId ?? `${semesterNumber}-${studentCourse.course.id}-${index}`}
          studentCourse={studentCourse}
          position={positions[index]}
          isEmpty={false}
          isDraggable={true}
          isFromCurriculum={isFromCurriculum}
        />
      ))}

      {/* Add ghost boxes for empty slots if it's an actual semester (progress view) */}
      {!isFromCurriculum &&
        Array.from({
          length: totalSlots - utilizedSlots,
        }).map((_, index) => {
          const positionIndex = utilizedSlots + index;
          const position = {
            courseId: `ghost-${semesterNumber}-${positionIndex}`, // Unique ID for ghost
            x: xOffset,
            y: positionIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
            width: boxWidth,
            height: COURSE_BOX.HEIGHT,
            isGhost: true,
          };

          return (
            <GhostCourseBox
              key={`ghost-${semesterNumber}-${positionIndex}`}
              position={position}
              semesterNumber={semesterNumber}
              positionIndex={positionIndex}
            />
          );
        })}
    </div>
  );
}
