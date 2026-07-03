"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/components/ui/utils";

const MIN_HEIGHT = 220;
const MAX_HEIGHT = 1600;

// Classic corner "grip" glyph (three diagonal strokes), same idea as the
// native textarea resize handle. Mirrored for the left corner.
function ResizeGrip({ mirrored }: { mirrored?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={cn(
        "text-muted-foreground/50 transition-colors group-hover:text-muted-foreground",
        mirrored && "-scale-x-100",
      )}
    >
      <path
        d="M11 1L1 11M11 5L5 11M11 9L9 11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ResizablePanelProps {
  // Distinct localStorage key per panel so each one remembers its own height.
  storageKey: string;
  defaultHeight?: number;
  className?: string;
  children: React.ReactNode;
}

// Wraps a visualizer in a `.panel` box with a user-draggable height, with
// grip handles in both bottom corners (per design ask) and a persisted
// height so each user's preferred size sticks across visits.
export default function ResizablePanel({
  storageKey,
  defaultHeight = 600,
  className,
  children,
}: ResizablePanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isNaN(parsed)) {
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed)));
    }
  }, [storageKey]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    setHeight(
      Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startHeight + delta)),
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setHeight((h) => {
      window.localStorage.setItem(storageKey, String(h));
      return h;
    });
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handlePointerMove, storageKey]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: height };
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [height, handlePointerMove, handlePointerUp],
  );

  // Safety net in case the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div className="relative">
      <div className={cn("panel overflow-auto", className)} style={{ height }}>
        {children}
      </div>

      <div
        onPointerDown={handlePointerDown}
        title="Arraste para redimensionar"
        aria-label="Redimensionar altura do painel"
        role="separator"
        aria-orientation="horizontal"
        className="group absolute bottom-0 left-0 z-10 flex h-6 w-6 cursor-ns-resize items-end justify-start rounded-tr-md pb-1 pl-1"
      >
        <ResizeGrip mirrored />
      </div>
      <div
        onPointerDown={handlePointerDown}
        title="Arraste para redimensionar"
        aria-label="Redimensionar altura do painel"
        role="separator"
        aria-orientation="horizontal"
        className="group absolute bottom-0 right-0 z-10 flex h-6 w-6 cursor-ns-resize items-end justify-end rounded-tl-md pb-1 pr-1"
      >
        <ResizeGrip />
      </div>

      <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground/60">
        Arraste os cantos para redimensionar
      </div>
    </div>
  );
}
