"use client";

import { useRef } from "react";
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

  // Calculate connection line positions
  const calculateConnectionLines = () => {
    if (courseElements.size === 0) return null;

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

        // Calculate centers
        const sourceCenterX = sourceRect.left + sourceRect.width / 2;
        const sourceCenterY = sourceRect.top + sourceRect.height / 2;
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;

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
            key={`${connection.from}-${connection.to}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={strokeColor}
            strokeWidth={lineWidth}
            strokeDasharray={length}
            strokeDashoffset={length}
            style={{
              opacity: 0.4,
              animation: `drawLine 0.2s ease-out ${connection.depth * 0.2}s forwards`,
            }}
          />
        );
      })
      .filter(Boolean);

    return lines;
  };

  return (
    <svg
      className="fixed inset-0 pointer-events-none z-[15]"
      style={{ width: "100vw", height: "100vh" }}
    >
      <defs>
        <style>{`@keyframes drawLine { to { stroke-dashoffset: 0; } }`}</style>
      </defs>
      {calculateConnectionLines()}
    </svg>
  );
}
