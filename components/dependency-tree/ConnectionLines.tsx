"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Connection } from "@/hooks/useDependencyGraph";

// Color gradient for prerequisite (backward) depths
export const DEPTH_COLORS = [
  "#4287f5", // brighter blue (root)
  "#9d6ffd", // brighter violet (depth 1)
  "#ff59a8", // brighter pink (depth 2)
  "#ff8534", // brighter orange (depth 3+)
];

// Color gradient for dependent (forward) depths — kept in a distinct green
// family so the two directions are easy to tell apart at a glance.
export const DEPENDENT_DEPTH_COLORS = [
  "#22c55e", // green (root)
  "#14b8a6", // teal (depth 1)
  "#06b6d4", // cyan (depth 2)
  "#84cc16", // lime (depth 3+)
];

interface ConnectionLinesProps {
  connections: Connection[];
  courseElements: Map<string, Element[]>;
}

export default function ConnectionLines({
  connections,
  courseElements,
}: ConnectionLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // The SVG is portaled INTO the `.dashboard-content` scroll-content container
  // that holds the course boxes, and endpoints are computed relative to that
  // container. So the lines share the boxes' coordinate space and scroll with
  // them natively in BOTH directions — the panels scroll internally via
  // overflow-auto, so window scroll offsets don't capture horizontal movement.
  // No per-frame JS, so the lines stay perfectly locked (no jitter). Only a
  // resize needs a recompute (layout reflow moves the boxes).
  const [, setTick] = useState(0);
  // Once the initial draw animation has played, later re-renders paint the lines
  // fully drawn (no re-animation flicker on a recompute).
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    let raf = 0;
    const reposition = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    window.addEventListener("resize", reposition);
    // Longest line animation = depth*0.2s delay + 0.2s draw; settle after ~1s.
    const doneId = setTimeout(() => setHasAnimated(true), 1000);
    return () => {
      window.removeEventListener("resize", reposition);
      cancelAnimationFrame(raf);
      clearTimeout(doneId);
    };
  }, []);

  // The scroll-content container the course boxes live in. All connected boxes
  // share one `.dashboard-content` (per useDashboardRef, which scopes the tree
  // to a single dashboard panel). Portaling the SVG here makes it scroll with them.
  const firstEl = courseElements.values().next().value?.[0] as
    | Element
    | undefined;
  const container =
    (firstEl?.closest(".dashboard-content") as HTMLElement | null) ?? null;

  // Calculate connection line positions
  const calculateConnectionLines = () => {
    if (!container || courseElements.size === 0) return null;
    const containerRect = container.getBoundingClientRect();

    const lines = connections
      .map((connection, index) => {
        const sourceElements = courseElements.get(connection.from) || [];
        const targetElements = courseElements.get(connection.to) || [];

        if (sourceElements.length === 0 || targetElements.length === 0)
          return null;

        const sourceElement = sourceElements[0];
        const targetElement = targetElements[0];

        // Get element rects
        const sourceRect = sourceElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();

        // Get color based on depth and direction
        const palette =
          connection.direction === "dependent" ? DEPENDENT_DEPTH_COLORS : DEPTH_COLORS;
        const colorIndex = Math.min(connection.depth, palette.length - 1);
        const strokeColor = palette[colorIndex];

        // Calculate centers relative to the container's content box. Both rects
        // are viewport-relative and shift together on scroll, so the difference
        // is the box's stable offset within `.dashboard-content` — where the
        // portaled SVG is anchored, so lines track the boxes under any scroll.
        const sourceCenterX =
          sourceRect.left - containerRect.left + sourceRect.width / 2;
        const sourceCenterY =
          sourceRect.top - containerRect.top + sourceRect.height / 2;
        const targetCenterX =
          targetRect.left - containerRect.left + targetRect.width / 2;
        const targetCenterY =
          targetRect.top - containerRect.top + targetRect.height / 2;

        // Calculate vector between centers
        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;

        // Edge gap
        const edgeGap = 4;

        // Normalize direction vector
        const distance = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / distance;
        const dirY = dy / distance;

        // Calculate intersection points with source box
        const sourceHalfWidth = sourceRect.width / 2;
        const sourceHalfHeight = sourceRect.height / 2;

        const txVert = dirX === 0 ? Infinity : sourceHalfWidth / Math.abs(dirX);
        const tyHor = dirY === 0 ? Infinity : sourceHalfHeight / Math.abs(dirY);

        let x1, y1;

        if (txVert < tyHor) {
          x1 = sourceCenterX + (sourceHalfWidth + edgeGap) * Math.sign(dirX);
          y1 = sourceCenterY + dirY * (txVert + edgeGap);
        } else {
          x1 = sourceCenterX + dirX * (tyHor + edgeGap);
          y1 = sourceCenterY + (sourceHalfHeight + edgeGap) * Math.sign(dirY);
        }

        // Calculate intersection points with target box
        const targetHalfWidth = targetRect.width / 2;
        const targetHalfHeight = targetRect.height / 2;

        const txVertTarget =
          dirX === 0 ? Infinity : targetHalfWidth / Math.abs(dirX);
        const tyHorTarget =
          dirY === 0 ? Infinity : targetHalfHeight / Math.abs(dirY);

        let x2, y2;

        if (txVertTarget < tyHorTarget) {
          x2 = targetCenterX - (targetHalfWidth + edgeGap) * Math.sign(dirX);
          y2 = targetCenterY - dirY * (txVertTarget + edgeGap);
        } else {
          x2 = targetCenterX - dirX * (tyHorTarget + edgeGap);
          y2 = targetCenterY - (targetHalfHeight + edgeGap) * Math.sign(dirY);
        }

        const lineWidth = 5 - Math.min(connection.depth, 2);
        const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

        return (
          <line
            // Matches the dedupe key in `useDependencyGraph` exactly, so the
            // uniqueness guarantee lives in one place.
            key={`${connection.direction}:${connection.from}->${connection.to}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={strokeColor}
            strokeWidth={lineWidth}
            strokeDasharray={hasAnimated ? undefined : length}
            strokeDashoffset={hasAnimated ? 0 : length}
            style={{
              opacity: 0.4,
              animation: hasAnimated
                ? undefined
                : `drawLine 0.2s ease-out ${connection.depth * 0.2}s forwards`,
            }}
          />
        );
      })
      .filter(Boolean);

    return lines;
  };

  if (!container) return null;

  return createPortal(
    <svg
      ref={svgRef}
      className="absolute top-0 left-0 pointer-events-none z-[15]"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      <defs>
        <style>{`@keyframes drawLine { to { stroke-dashoffset: 0; } }`}</style>
      </defs>
      {calculateConnectionLines()}
    </svg>,
    container,
  );
}
