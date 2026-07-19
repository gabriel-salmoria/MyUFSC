"use client";

import {
  useCallback,
  useEffect,
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
// A standard UFSC period is 50 min and occupies one grid row. We size event
// boxes at this constant scale (px per minute) so a box's height reflects its
// duration and never changes as it moves — unlike the grid's own rows, whose
// time spans are irregular (60/70/80-min blocks and the lunch gap).
const SLOT_SPAN_MIN = 50;
const MIN_EVENT_MIN = 15; // shortest event the user can resize to

type GestureMode = "move" | "resize";

interface Gesture {
  id: string;
  mode: GestureMode;
  day: number;
  startMin: number;
  endMin: number;
  origDay: number;
  origStartMin: number;
  origEndMin: number;
  moved: boolean;
}

interface Geometry {
  top: number;
  left: number;
  width: number;
  height: number;
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

// A free-positioned, draggable/resizable layer of custom events drawn on top of
// the (period-based) timetable grid. Event vertical position follows the grid
// rows (so a box starts where its time sits in the grid), but its height is a
// constant function of duration — and it can be dragged across days/times and
// resized from the bottom edge like a calendar event.
export default function CustomEventsOverlay({
  entries,
  tbodyRef,
  onEntryClick,
  onEntryMove,
}: CustomEventsOverlayProps) {
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  // The just-dropped position, held until the store update flows back through
  // props — prevents a one-frame flash at the old position after a drag.
  const [pending, setPending] = useState<Gesture | null>(null);

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

  // Clear the optimistic "pending" position once the real entry matches it.
  useEffect(() => {
    if (!pending) return;
    const e = entries.find((x) => x.id === pending.id);
    if (
      e &&
      e.day === pending.day &&
      toMinutes(e.startTime) === pending.startMin &&
      toMinutes(e.endTime) === pending.endMin
    ) {
      setPending(null);
    }
  }, [entries, pending]);

  const dayCount = TIMETABLE.DAYS.length;
  const colWidth = geo ? (geo.width - TIME_COL_WIDTH) / dayCount : 0;
  const rowHeight = geo ? geo.height / TOTAL_ROWS : 0;
  const pxPerMin = rowHeight / SLOT_SPAN_MIN;

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent, entry: CustomScheduleEntry, mode: GestureMode) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointerStart.current = { x: e.clientX, y: e.clientY };
      const startMin = toMinutes(entry.startTime);
      const endMin = toMinutes(entry.endTime);
      const next: Gesture = {
        id: entry.id,
        mode,
        day: entry.day,
        startMin,
        endMin,
        origDay: entry.day,
        origStartMin: startMin,
        origEndMin: endMin,
        moved: false,
      };
      gestureRef.current = next;
      setGesture(next);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const start = pointerStart.current;
      const g = gestureRef.current;
      if (!start || !g || rowHeight <= 0 || colWidth <= 0) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (
        !g.moved &&
        Math.abs(dx) < DRAG_THRESHOLD &&
        Math.abs(dy) < DRAG_THRESHOLD
      )
        return;

      let next: Gesture;
      if (g.mode === "resize") {
        // Bottom edge → change end time only, at the constant px/min scale.
        const duration = Math.max(
          MIN_EVENT_MIN,
          snapMinutes(g.origEndMin - g.origStartMin + dy / pxPerMin, 5),
        );
        const endMin = Math.min(GRID_END_MIN, g.origStartMin + duration);
        next = { ...g, endMin, moved: true };
      } else {
        // Body → move across days (whole columns) and times (grid rows).
        const day = Math.max(
          0,
          Math.min(dayCount - 1, g.origDay + Math.round(dx / colWidth)),
        );
        const duration = g.origEndMin - g.origStartMin;
        const rawStart = rowsToMinutes(
          minutesToRows(g.origStartMin) + dy / rowHeight,
        );
        const startMin = Math.max(
          GRID_START_MIN,
          Math.min(GRID_END_MIN - duration, snapMinutes(rawStart, 5)),
        );
        next = { ...g, day, startMin, endMin: startMin + duration, moved: true };
      }
      gestureRef.current = next;
      setGesture(next);
    },
    [rowHeight, colWidth, pxPerMin, dayCount],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent, entry: CustomScheduleEntry) => {
      const g = gestureRef.current;
      pointerStart.current = null;
      gestureRef.current = null;
      setGesture(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may already be released */
      }
      if (!g) return;

      if (g.moved) {
        // Hold the new position optimistically until props catch up.
        setPending(g);
        onEntryMove(entry, g.day, toHHMM(g.startMin), toHHMM(g.endMin));
      } else if (g.mode === "move") {
        // A press that never crossed the threshold is a click → edit.
        onEntryClick(entry);
      }
    },
    [onEntryMove, onEntryClick],
  );

  if (!geo) return null;

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ top: geo.top, left: geo.left, width: geo.width, height: geo.height }}
    >
      {entries.map((entry) => {
        const active =
          gesture?.id === entry.id
            ? gesture
            : pending?.id === entry.id
              ? pending
              : null;
        const day = active ? active.day : entry.day;
        const startMin = active ? active.startMin : toMinutes(entry.startTime);
        const endMin = active ? active.endMin : toMinutes(entry.endTime);
        const isDragging = gesture?.id === entry.id;

        const top = minutesToRows(startMin) * rowHeight;
        // Height is a pure function of duration → constant while moving.
        const height = Math.max(pxPerMin * MIN_EVENT_MIN, (endMin - startMin) * pxPerMin);
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
            onPointerDown={(e) => handlePointerDown(e, entry, "move")}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => handlePointerUp(e, entry)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEntryClick(entry);
              }
            }}
          >
            {/* Title on its own line so it never gets squeezed by the time,
                which sits on the second line (like a calendar event). */}
            <div className="text-[0.75rem] font-bold leading-tight truncate">
              {entry.title}
            </div>
            <div className="text-[0.625rem] font-medium opacity-80 tabular-nums leading-tight truncate">
              {toHHMM(startMin)}–{toHHMM(endMin)}
            </div>
            {entry.subtitle && height > pxPerMin * 45 && (
              <div className="text-[0.7rem] leading-tight truncate opacity-90">
                {entry.subtitle}
              </div>
            )}

            {/* Bottom resize handle — drag to change the end time. */}
            <div
              className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
              onPointerDown={(e) => handlePointerDown(e, entry, "resize")}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, entry)}
            >
              <div className="mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-current opacity-40" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
