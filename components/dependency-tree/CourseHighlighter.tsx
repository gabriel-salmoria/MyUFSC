"use client";

import { useEffect, useRef, RefObject } from "react";
import type { Course } from "@/types/curriculum";
import { DEPTH_COLORS } from "./ConnectionLines";

const STEP_MS = 200;

interface CourseHighlighterProps {
  dashboardRef: RefObject<Element | null>;
  courseElements: Map<string, Element[]>;
  course: Course;
  prerequisiteCourses: Course[];
  dependentCourses: Course[];
  coursesDepth: Map<string, number>;
}

export default function CourseHighlighter({
  dashboardRef,
  courseElements,
  course,
  prerequisiteCourses,
  dependentCourses,
  coursesDepth,
}: CourseHighlighterProps) {
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!dashboardRef.current || courseElements.size === 0) return;

    addHighlightStyles();
    applyTransitions();
    addOverlay();

    // Group prerequisites AND dependents by depth so each depth level of
    // both directions reveals on the same timer, at the same time.
    const byDepth = new Map<number, { id: string; direction: "prereq" | "dependent" }[]>();
    const addToDepth = (id: string, direction: "prereq" | "dependent") => {
      const d = coursesDepth.get(id) ?? 1;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push({ id, direction });
    };
    prerequisiteCourses.forEach((prereq) => addToDepth(prereq.id, "prereq"));
    dependentCourses.forEach((dep) => addToDepth(dep.id, "dependent"));

    requestAnimationFrame(() => {
      // Highlight main course immediately
      (courseElements.get(course.id) ?? []).forEach((el) => {
        if (el instanceof HTMLElement) el.classList.add("course-highlight-main");
      });

      // Dim everything except the main course — prerequisites start dimmed too
      dashboardRef.current!.querySelectorAll("[data-course-id]").forEach((el) => {
        const id = el.getAttribute("data-course-id");
        if (id && id !== course.id && el instanceof HTMLElement) {
          el.classList.add("course-highlight-dimmed");
        }
      });

      // BFS reveal: un-dim each depth level on its own timer — both
      // directions share the same depth -> timer mapping, so e.g. the first
      // prerequisite layer and the first dependent layer reveal together.
      byDepth.forEach((entries, depth) => {
        const timerId = setTimeout(() => {
          entries.forEach(({ id, direction }) => {
            (courseElements.get(id) ?? []).forEach((el) => {
              if (el instanceof HTMLElement) {
                el.classList.remove("course-highlight-dimmed");
                el.classList.add(
                  direction === "dependent" ? "course-highlight-dependent" : "course-highlight-prereq",
                );
              }
            });
          });
        }, depth * STEP_MS);
        timerIds.current.push(timerId);
      });
    });

    return () => {
      timerIds.current.forEach(clearTimeout);
      timerIds.current = [];
      cleanupHighlights();
      removeHighlightStyles();
      removeOverlay();
    };
  }, [dashboardRef.current, courseElements, course.id, prerequisiteCourses, dependentCourses]);

  const addHighlightStyles = () => {
    if (document.getElementById("dependency-tree-highlight-styles")) return;
    const style = document.createElement("style");
    style.id = "dependency-tree-highlight-styles";
    style.textContent = `
      .course-transition { transition: all 0.3s ease !important; }
      .course-highlight-main { z-index: 30 !important; transform: scale(1.03) !important; }
      .course-highlight-prereq { z-index: 20 !important; transform: scale(1.02) !important; }
      .course-highlight-dependent { z-index: 20 !important; transform: scale(1.02) !important; }
      .course-highlight-dimmed { opacity: 0.15 !important; pointer-events: none !important; }
    `;
    document.head.appendChild(style);
  };

  const removeHighlightStyles = () => {
    document.getElementById("dependency-tree-highlight-styles")?.remove();
  };

  const addOverlay = () => {
    if (!dashboardRef.current || document.getElementById("dependency-tree-overlay")) return;
    const contentArea =
      dashboardRef.current.querySelector(".dashboard-content") ?? dashboardRef.current;
    const overlay = document.createElement("div");
    overlay.id = "dependency-tree-overlay";
    overlay.className =
      "absolute inset-0 bg-background/80 z-[5] transition-opacity duration-300 pointer-events-none backdrop-blur-[1px]";
    contentArea.appendChild(overlay);
  };

  const removeOverlay = () => {
    document.getElementById("dependency-tree-overlay")?.remove();
  };

  const applyTransitions = () => {
    dashboardRef.current?.querySelectorAll("[data-course-id]").forEach((el) => {
      if (el instanceof HTMLElement) el.classList.add("course-transition");
    });
  };

  const cleanupHighlights = () => {
    document.querySelectorAll("[data-course-id]").forEach((el) => {
      el.classList.remove(
        "course-highlight-main",
        "course-highlight-prereq",
        "course-highlight-dependent",
        "course-highlight-dimmed",
        "course-transition",
      );
    });
  };

  return null;
}
