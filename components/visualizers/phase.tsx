// components/visualizers/phase.tsx
"use client";

import { useMemo } from "react";
import { CircleDot, MousePointerClick } from "lucide-react";
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
  /** This is the semester the student is enrolled in right now. */
  isCurrentPhase?: boolean;
  /** Declare this semester the current one. Omitted in the curriculum grid. */
  onMarkCurrentPhase?: () => void;
  onHeaderClick?: () => void;
}

export default function Phase({
  semesterNumber,
  studentCourses,
  width = PHASE.MIN_WIDTH,
  isFromCurriculum = true,
  totalSlots: explicitTotalSlots,
  isCurrentPhase = false,
  onMarkCurrentPhase,
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
    // Only a right-side divider here — this column stretches to fill
    // whatever height the row ends up with (flex align-items: stretch), so a
    // fixed `height` would leave its border floating above the row's actual
    // bottom whenever the row is taller than this phase's own content (e.g.
    // a user-resized panel, or a taller sibling phase). The top/bottom/left
    // frame around the whole grid lives on the row itself, one level up.
    <div
      className="group/phase relative border-r border-border"
      style={{ width: `${width}px`, minHeight: `${phaseHeight}px` }}
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
        {/* Current-phase marker. Rendered for EVERY phase (invisible via opacity
            when it isn't the current one) rather than conditionally, so it
            always occupies its slot and "Fase N" sits at the same x in every
            column — a conditional icon would nudge the label sideways on
            whichever phase happens to be current. */}
        {onMarkCurrentPhase && (
          <button
            type="button"
            aria-pressed={isCurrentPhase}
            aria-label={
              isCurrentPhase
                ? `Fase ${semesterNumber} é a fase que você está cursando`
                : `Marcar a fase ${semesterNumber} como a que estou cursando`
            }
            onClick={(e) => {
              e.stopPropagation();
              onMarkCurrentPhase();
            }}
            title={
              isCurrentPhase
                ? "Fase que você está cursando"
                : "Marcar como a fase que estou cursando"
            }
            className={cn(
              // Opacity is driven by the column hover, colour by the button's
              // own hover — two different properties, so neither has to
              // out-specify the other (no `!important`, which Tailwind v4 spells
              // as a suffix anyway).
              "shrink-0 rounded-full transition-all",
              isCurrentPhase
                ? "text-primary opacity-100"
                : "text-muted-foreground opacity-0 hover:text-primary group-hover/phase:opacity-60 focus-visible:opacity-100",
            )}
          >
            <CircleDot className="h-3.5 w-3.5" />
          </button>
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
