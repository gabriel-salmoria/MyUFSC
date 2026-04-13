"use client";

import { useEffect, RefObject } from "react";
import type { Course } from "@/types/curriculum";
import { DEPTH_COLORS } from "./ConnectionLines";
import { HIGHLIGHT } from "@/styles/visualization";

interface CourseHighlighterProps {
  dashboardRef: RefObject<Element | null>;
  courseElements: Map<string, Element[]>;
  course: Course;
  prerequisiteCourses: Course[];
  coursesDepth: Map<string, number>;
}

export default function CourseHighlighter({
  dashboardRef,
  courseElements,
  course,
  prerequisiteCourses,
  coursesDepth,
}: CourseHighlighterProps) {
  // Use effect to apply and clean up highlights
  useEffect(() => {
    if (!dashboardRef.current || courseElements.size === 0) return;

    // Add styles to document head for consistent rendering across environments
    addHighlightStyles();

    // First apply all transitions before changing visual properties
    applyTransitions();

    // Add the overlay for blur/obfuscation
    addOverlay();

    // Then apply the visual changes
    requestAnimationFrame(() => {
      highlightMainCourse();
      highlightPrerequisites();
      dimNonHighlightedCourses();
    });

    // Clean up on unmount
    return () => {
      cleanupHighlights();
      removeHighlightStyles();
      removeOverlay();
    };
  }, [dashboardRef.current, courseElements, course.id, prerequisiteCourses]);

  // Add CSS styles to document to ensure consistent rendering across environments
  const addHighlightStyles = () => {
    const styleId = "dependency-tree-highlight-styles";

    // Only add if not already present
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .course-transition {
          transition: all 0.3s ease !important;
        }

        .course-highlight-main {
          z-index: 30 !important;
          transform: scale(1.03) !important;
        }

        .course-highlight-prereq {
          z-index: 20 !important;
          transform: scale(1.02) !important;
        }

        .course-highlight-dimmed {
          opacity: 0.3 !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  };

  const addOverlay = () => {
    if (!dashboardRef.current) return;
    const contentArea =
      dashboardRef.current.querySelector(".dashboard-content") ||
      dashboardRef.current;

    if (!document.getElementById("dependency-tree-overlay")) {
      const overlay = document.createElement("div");
      overlay.id = "dependency-tree-overlay";
      // Match the phase clicking effect overlay exactly
      overlay.className =
        "absolute inset-0 bg-background/80 z-[5] transition-opacity duration-300 pointer-events-none backdrop-blur-[1px]";

      contentArea.appendChild(overlay);
    }
  };

  const removeOverlay = () => {
    const overlay = document.getElementById("dependency-tree-overlay");
    if (overlay) {
      overlay.remove();
    }
  };

  // Apply transitions first before any visual changes to prevent flashing
  const applyTransitions = () => {
    if (!dashboardRef.current) return;

    // Add transitions to all course elements first
    dashboardRef.current
      .querySelectorAll("[data-course-id]")
      .forEach((element) => {
        if (element instanceof HTMLElement) {
          element.classList.add("course-transition");
        }
      });
  };

  // Remove added styles when component unmounts
  const removeHighlightStyles = () => {
    const styleElement = document.getElementById(
      "dependency-tree-highlight-styles",
    );
    if (styleElement) {
      styleElement.remove();
    }
  };

  // Highlight the main/selected course
  const highlightMainCourse = () => {
    const mainCourseElements = courseElements.get(course.id) || [];
    mainCourseElements.forEach((element) => {
      if (element instanceof HTMLElement) {
        // Add Tailwind classes and our custom class matching the phase box hover
        element.classList.add("course-highlight-main");
      }
    });
  };

  // Highlight prerequisite courses with depth-based colors
  const highlightPrerequisites = () => {
    prerequisiteCourses.forEach((prereq) => {
      const prereqElements = courseElements.get(prereq.id) || [];
      const depth = coursesDepth.get(prereq.id) || 1;

      prereqElements.forEach((element) => {
        if (element instanceof HTMLElement) {
          element.classList.add("course-highlight-prereq");
        }
      });
    });
  };

  const dimNonHighlightedCourses = () => {
    if (!dashboardRef.current) return;

    const highlightedCourseIds = new Set([
      course.id,
      ...prerequisiteCourses.map((c) => c.id),
    ]);

    dashboardRef.current
      .querySelectorAll("[data-course-id]")
      .forEach((element) => {
        const courseId = element.getAttribute("data-course-id");
        if (courseId && !highlightedCourseIds.has(courseId)) {
          if (element instanceof HTMLElement) {
            element.classList.add("course-highlight-dimmed");
          }
        }
      });
  };

  const cleanupHighlights = () => {
    document.querySelectorAll("[data-course-id]").forEach((element) => {
      // Remove all classes including our custom ones
      element.classList.remove(
        "course-highlight-main",
        "course-highlight-prereq",
        "course-highlight-dimmed",
        "course-transition",
      );
    });
  };

  // This component doesn't render any visible elements
  // It only applies DOM manipulations through effects
  return null;
}
