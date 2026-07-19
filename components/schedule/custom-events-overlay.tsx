"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import { TIMETABLE } from "@/styles/visualization";
import type { CustomScheduleEntry } from "@/types/student-plan";
import {
  GRID_END_MIN,
  GRID_START_MIN,
  TOTAL_ROWS,
  minutesToRows,
  rowsToMinutes,
  snapMinutes,
  toHHMM,
  toMinutes,
} from "@/lib/timetable-time";

// Width of the leading time-label column (matches the <col> in TimetableGrid).
const TIME_COL_WIDTH = 80;
// Pointer travel (px) before a press is treated as a drag rather than a click.
const DRAG_THRESHOLD = 4;

interface Geometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DragState {
  id: string;
  day: number;
  startMin: number;
  endMin: number;
  moved: boolean;
}

interface CustomEventsOverlayProps {
  entries: CustomScheduleEntry[];
  // The <tbody> of the timetable — measured to align the overlay with the grid.
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>;
  onEntryClick: (entry: CustomScheduleEntry) => void;
  onEntryMove: (
    entry: CustomScheduleEntry,
    day: number,
    startTime: string,
    endTime: string,
  ) => void;
}

// A free-positioned, draggable layer of custom events drawn on top of the
// (period-based) timetable grid. Events are placed by real time via the
// timetable-time geometry helpers, so they are no longer locked to the 50-min
// slot rows — they can start/end at any minute and be dragged across days and
// times (snapped to 5 min).
export default function CustomEventsOverlay({
  entries,
  tbodyRef,
  onEntryClick,
  onEntryMove,
}: CustomEventsOverlayProps) {
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  // Measure the grid body so the overlay tracks its exact position/size, even
  // as the layout reflows (responsive widths, panel resize, font load…).
  useLayoutEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;

    const measure = () => {
      setGeo({
        top: tbody.offsetTop,
        left: tbody.offsetLeft,
        width: tbody.offsetWidth,
        height: tbody.offsetHeight,
      });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(tbody);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tbodyRef, entries.length]);

  const dayCount = TIMETABLE.DAYS.length;

  const colWidth = geo ? (geo.width - TIME_COL_WIDTH) / dayCount : 0;
  const rowHeight = geo ? geo.height / TOTAL_ROWS : 0;

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent, entry: CustomScheduleEntry) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointerStart.current = { x: e.clientX, y: e.clientY };
      const next: DragState = {
        id: entry.id,
        day: entry.day,
        startMin: toMinutes(entry.startTime),
        endMin: toMinutes(entry.endTime),
        moved: false,
      };
      dragRef.current = next;
      setDrag(next);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent, entry: CustomScheduleEntry) => {
      const start = pointerStart.current;
      const current = dragRef.current;
      if (!start || !current || !geo || colWidth <= 0 || rowHeight <= 0) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (
        !current.moved &&
        Math.abs(dx) < DRAG_THRESHOLD &&
        Math.abs(dy) < DRAG_THRESHOLD
      )
        return;

      const origStart = toMinutes(entry.startTime);
      const origEnd = toMinutes(entry.endTime);
      const duration = Math.max(5, origEnd - origStart);

      // Horizontal → day columns (whole steps).
      const dayDelta = Math.round(dx / colWidth);
      const day = Math.max(0, Math.min(dayCount - 1, entry.day + dayDelta));

      // Vertical → time, via the non-uniform row geometry, snapped to 5 min and
      // clamped so the whole event stays inside the grid.
      const origStartRows = minutesToRows(origStart);
      const rawStart = rowsToMinutes(origStartRows + dy / rowHeight);
      let startMin = snapMinutes(rawStart, 5);
      startMin = Math.max(
        GRID_START_MIN,
        Math.min(GRID_END_MIN - duration, startMin),
      );

      const nextDrag: DragState = {
        id: entry.id,
        day,
        startMin,
        endMin: startMin + duration,
        moved: true,
      };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
    },
    [geo, colWidth, rowHeight, dayCount],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent, entry: CustomScheduleEntry) => {
      const current = dragRef.current;
      pointerStart.current = null;
      dragRef.current = null;
      setDrag(null);
      if (!current) return;

      if (current.moved) {
        onEntryMove(
          entry,
          current.day,
          toHHMM(current.startMin),
          toHHMM(current.endMin),
        );
      } else {
        // A press that never crossed the drag threshold is a click → edit.
        onEntryClick(entry);
      }
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may already be released */
      }
    },
    [onEntryMove, onEntryClick],
  );

  if (!geo) {
    // Still render an invisible measuring anchor so geometry can settle.
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ top: geo.top, left: geo.left, width: geo.width, height: geo.height }}
    >
      {entries.map((entry) => {
        const isDragging = drag?.id === entry.id;
        const day = isDragging ? drag!.day : entry.day;
        const startMin = isDragging ? drag!.startMin : toMinutes(entry.startTime);
        const endMin = isDragging ? drag!.endMin : toMinutes(entry.endTime);

        const top = minutesToRows(startMin) * rowHeight;
        const height = Math.max(
          rowHeight * 0.4,
          (minutesToRows(endMin) - minutesToRows(startMin)) * rowHeight,
        );
        const left = TIME_COL_WIDTH + day * colWidth;

        return (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            className={cn(
              CSS_CLASSES.TIMETABLE_COURSE,
              "pointer-events-auto absolute select-none overflow-hidden rounded-md px-1.5 py-1 shadow-sm ring-1 ring-black/10 touch-none",
              "cursor-grab active:cursor-grabbing transition-shadow",
              isDragging && "z-20 shadow-lg ring-2 ring-foreground/40 opacity-95",
              entry.color,
            )}
            style={{
              top,
              left: left + 1,
              width: colWidth - 2,
              height: height - 1,
            }}
            onPointerDown={(e) => handlePointerDown(e, entry)}
            onPointerMove={(e) => handlePointerMove(e, entry)}
            onPointerUp={(e) => handlePointerUp(e, entry)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEntryClick(entry);
              }
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[0.75rem] font-bold leading-tight truncate">
                {entry.title}
              </span>
              <span className="text-[0.625rem] font-medium opacity-80 tabular-nums whitespace-nowrap">
                {toHHMM(startMin)}
              </span>
            </div>
            {entry.subtitle && (
              <div className="text-[0.7rem] leading-tight truncate opacity-90">
                {entry.subtitle}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
