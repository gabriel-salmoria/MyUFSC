"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
// A standard UFSC period is 50 min and occupies one grid row.
const SLOT_SPAN_MIN = 50;
const MIN_EVENT_MIN = 15; // shortest event the user can resize to
// Floor on a box's drawn height, expressed in rows so it scales with the grid.
const MIN_BOX_ROWS = MIN_EVENT_MIN / SLOT_SPAN_MIN;

// How many grid ROWS the interval [startMin, endMin) covers.
//
// Both the top edge and the height MUST come from this one mapping. The grid is
// not a uniform time axis: TIME_SLOTS rows have irregular spans (09:10→10:10 is
// 60 min, 17:10→18:30 is 80, and 11:00→13:30 is a 150-min lunch gap drawn as a
// single row). Sizing a box at a constant px-per-minute while positioning it
// through `minutesToRows` made the two disagree on every non-50-min row — an
// 11:00–13:30 event was positioned on one row but drawn three rows tall, so its
// bottom edge landed nowhere near 13:30. Deriving both from the row mapping
// keeps a box's edges on the same grid lines as the times it claims.
function rowsBetween(startMin: number, endMin: number): number {
  return minutesToRows(endMin) - minutesToRows(startMin);
}

type GestureMode = "move" | "resize";

interface Gesture {
  id: string;
  mode: GestureMode;
  // Active day of the dragged box. Only changes on horizontal drag, which is
  // permitted only for single-day entries (canMoveDay). Multi-day entries lock
  // their weekday set — a body drag adjusts the shared time range only.
  day: number;
  startMin: number;
  endMin: number;
  origDay: number;
  origStartMin: number;
  origEndMin: number;
  canMoveDay: boolean;
  moved: boolean;
}

interface Geometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

// A half-open [startMin, endMin) minute interval — either an occupied class
// section (from the grid underneath) or a custom event box.
interface Interval {
  startMin: number;
  endMin: number;
}

// Result of the per-day column packing for a single (entry × day) box: which
// sub-column it lives in and how many columns its cluster was split into.
interface BoxSlot {
  subColIndex: number;
  cols: number;
}

interface CustomEventsOverlayProps {
  entries: CustomScheduleEntry[];
  // The <tbody> of the timetable — measured to align the overlay with the grid.
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>;
  // Occupied class-section time ranges per weekday (day 0 = Monday). Overlapping
  // custom events are packed into columns to the RIGHT of these, so a custom
  // event that clashes with a class shares the column's width with it instead of
  // hiding it. The class table cell underneath stays full-width (a non-goal to
  // shrink it).
  classIntervalsByDay?: Record<number, Interval[]>;
  onEntryClick: (entry: CustomScheduleEntry) => void;
  onEntryMove: (
    entry: CustomScheduleEntry,
    days: number[],
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
  classIntervalsByDay,
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
    // Multi-day entries keep their weekday set across a drag, so only the shared
    // time range needs to match; single-day entries also match the moved day.
    const daysMatch = pending.canMoveDay
      ? e?.days.length === 1 && e.days[0] === pending.day
      : true;
    if (
      e &&
      daysMatch &&
      toMinutes(e.startTime) === pending.startMin &&
      toMinutes(e.endTime) === pending.endMin
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deferred: avoidable derived-state effect, tracked in #31
      setPending(null);
    }
  }, [entries, pending]);

  const dayCount = TIMETABLE.DAYS.length;
  const colWidth = geo ? (geo.width - TIME_COL_WIDTH) / dayCount : 0;
  const rowHeight = geo ? geo.height / TOTAL_ROWS : 0;

  // Side-by-side layout (#33). Per weekday column, greedily pack that day's
  // overlapping boxes into sub-columns so they render next to each other instead
  // of all stacking at full width. Class-section intervals are seeded first so
  // they claim the leftmost sub-columns and a clashing custom event is pushed to
  // a narrower column on the right (both stay visible/clickable).
  //
  // Keyed by `[entries, classIntervalsByDay]` — deliberately NOT on the live
  // `gesture`/`pending`, so a drag never re-packs every frame; the box being
  // dragged just keeps (or falls back from) its resting slot.
  const boxSlots = useMemo(() => {
    const slots = new Map<string, BoxSlot>();

    for (let day = 0; day < dayCount; day++) {
      // Each item is a box on this day; `key` is null for class intervals, which
      // reserve columns but are never rendered by this overlay.
      type Item = Interval & { key: string | null; isClass: boolean };
      const items: Item[] = [];

      for (const ci of classIntervalsByDay?.[day] ?? []) {
        items.push({ ...ci, key: null, isClass: true });
      }
      for (const entry of entries) {
        if (!entry.days.includes(day)) continue;
        items.push({
          startMin: toMinutes(entry.startTime),
          endMin: toMinutes(entry.endTime),
          key: `${entry.id}-${day}`,
          isClass: false,
        });
      }
      if (items.length === 0) continue;

      // Sort by start asc, then end desc; on a full tie, class before custom so
      // classes always take the leftmost column.
      items.sort(
        (a, b) =>
          a.startMin - b.startMin ||
          b.endMin - a.endMin ||
          (a.isClass === b.isClass ? 0 : a.isClass ? -1 : 1),
      );

      // Flush one cluster [from, to): assign each item to the first column whose
      // last box ended at/before this box's start, else open a new column. Every
      // box in the cluster shares the same `cols` (equal width).
      const flush = (from: number, to: number) => {
        const columnEnds: number[] = [];
        const assigned: number[] = [];
        for (let i = from; i < to; i++) {
          const item = items[i];
          let col = columnEnds.findIndex((end) => end <= item.startMin);
          if (col === -1) col = columnEnds.length;
          columnEnds[col] = item.endMin;
          assigned[i - from] = col;
        }
        const cols = columnEnds.length;
        for (let i = from; i < to; i++) {
          const { key } = items[i];
          if (key) slots.set(key, { subColIndex: assigned[i - from], cols });
        }
      };

      // Cluster: a new cluster starts once a box begins at/after the running max
      // end of every box seen so far in the current cluster.
      let clusterStart = 0;
      let maxEnd = items[0].endMin;
      for (let i = 1; i < items.length; i++) {
        if (items[i].startMin >= maxEnd) {
          flush(clusterStart, i);
          clusterStart = i;
          maxEnd = items[i].endMin;
        } else {
          maxEnd = Math.max(maxEnd, items[i].endMin);
        }
      }
      flush(clusterStart, items.length);
    }

    return slots;
  }, [entries, classIntervalsByDay, dayCount]);

  const handlePointerDown = useCallback(
    (
      e: ReactPointerEvent,
      entry: CustomScheduleEntry,
      day: number,
      mode: GestureMode,
    ) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointerStart.current = { x: e.clientX, y: e.clientY };
      const startMin = toMinutes(entry.startTime);
      const endMin = toMinutes(entry.endTime);
      const next: Gesture = {
        id: entry.id,
        mode,
        day,
        startMin,
        endMin,
        origDay: day,
        origStartMin: startMin,
        origEndMin: endMin,
        canMoveDay: entry.days.length === 1,
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
        // Bottom edge → change end time only. Converted through the same row
        // mapping the box is drawn with, so the edge tracks the pointer instead
        // of drifting wherever a row's real span isn't 50 min.
        const rawEnd = rowsToMinutes(
          minutesToRows(g.origEndMin) + dy / rowHeight,
        );
        const endMin = Math.max(
          g.origStartMin + MIN_EVENT_MIN,
          Math.min(GRID_END_MIN, snapMinutes(rawEnd, 5)),
        );
        next = { ...g, endMin, moved: true };
      } else {
        // Body → move across times (grid rows); day-change is allowed only for
        // single-day entries (multi-day weekday sets are edited via the modal).
        const day = g.canMoveDay
          ? Math.max(
              0,
              Math.min(dayCount - 1, g.origDay + Math.round(dx / colWidth)),
            )
          : g.origDay;
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
    [rowHeight, colWidth, dayCount],
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
        // Single-day entries may have moved to a new weekday; multi-day sets are
        // locked, so their days pass through unchanged.
        const newDays = g.canMoveDay ? [g.day] : entry.days;
        onEntryMove(entry, newDays, toHHMM(g.startMin), toHHMM(g.endMin));
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
      {entries.flatMap((entry) => {
        const active =
          gesture?.id === entry.id
            ? gesture
            : pending?.id === entry.id
              ? pending
              : null;
        const startMin = active ? active.startMin : toMinutes(entry.startTime);
        const endMin = active ? active.endMin : toMinutes(entry.endTime);
        const isDragging = gesture?.id === entry.id;

        const top = minutesToRows(startMin) * rowHeight;
        // Same mapping as `top` (see rowsBetween): the bottom edge lands on the
        // grid line for `endMin`, whatever the rows in between actually span.
        const height =
          Math.max(MIN_BOX_ROWS, rowsBetween(startMin, endMin)) * rowHeight;

        // One box per weekday the event repeats on. While a single-day entry is
        // being dragged horizontally, its (single) box follows the active day;
        // multi-day boxes stay pinned to their own weekdays (day-move locked).
        const renderDays =
          active && active.canMoveDay ? [active.day] : entry.days;

        return renderDays.map((day) => {
          // Resting slot for this box; a box dragged onto a new day (where it has
          // no packed slot yet) falls back to full column width.
          const slot = boxSlots.get(`${entry.id}-${day}`) ?? {
            subColIndex: 0,
            cols: 1,
          };
          const boxWidth = colWidth / slot.cols;
          const left = TIME_COL_WIDTH + day * colWidth + slot.subColIndex * boxWidth;
          return (
            <div
              key={`${entry.id}-${day}`}
              role="button"
              tabIndex={0}
              className={cn(
                CSS_CLASSES.TIMETABLE_COURSE,
                "pointer-events-auto absolute select-none overflow-hidden rounded-md px-1.5 py-1 shadow-sm ring-1 ring-black/10 touch-none",
                "cursor-grab active:cursor-grabbing transition-shadow",
                isDragging &&
                  "z-20 shadow-lg ring-2 ring-foreground/40 opacity-95",
                entry.color,
              )}
              style={{
                top,
                left: left + 1,
                width: boxWidth - 2,
                height: height - 1,
              }}
              onPointerDown={(e) => handlePointerDown(e, entry, day, "move")}
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
              {entry.subtitle && height > rowHeight * 0.9 && (
                <div className="text-[0.7rem] leading-tight truncate opacity-90">
                  {entry.subtitle}
                </div>
              )}

              {/* Bottom resize handle — drag to change the end time. */}
              <div
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                onPointerDown={(e) =>
                  handlePointerDown(e, entry, day, "resize")
                }
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, entry)}
              >
                <div className="mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-current opacity-40" />
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}
