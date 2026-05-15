import { useRef, useState, useEffect } from "react";
import type { Course } from "@/types/curriculum";

export const useDashboardRef = (course: Course | null, isVisible: boolean) => {
  const dashboardRef = useRef<Element | null>(null);
  const [courseElements, setCourseElements] = useState<Map<string, Element[]>>(
    new Map(),
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!course || !isVisible) {
      setIsReady(false);
      return;
    }

    // Find the dashboard containing the course
    const findSourceDashboard = () => {
      const dashboardContainers = document.querySelectorAll(".panel");

      for (const dashboard of dashboardContainers) {
        const courseElement = dashboard.querySelector(
          `[data-course-id="${course.id}"]`,
        );
        if (courseElement) {
          dashboardRef.current = dashboard;
          // Apply dashboard highlight
          dashboard.classList.add("ring-1", "ring-inset", "ring-blue-300");
          return true;
        }
      }
      return false;
    };

    // Find all course elements in the dashboard
    const findCourseElements = () => {
      if (!dashboardRef.current) return false;

      const newCourseElements = new Map<string, Element[]>();
      dashboardRef.current
        .querySelectorAll("[data-course-id]")
        .forEach((element) => {
          const id = element.getAttribute("data-course-id");
          if (id) {
            if (!newCourseElements.has(id)) {
              newCourseElements.set(id, []);
            }
            newCourseElements.get(id)?.push(element);
          }
        });

      setCourseElements(newCourseElements);
      return newCourseElements.size > 0;
    };

    // rAF ensures the browser has painted the current frame before we query positions
    const rafId = requestAnimationFrame(() => {
      if (findSourceDashboard() && findCourseElements()) {
        setIsReady(true);
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      setIsReady(false);
    };
  }, [course, isVisible]);

  return {
    dashboardRef,
    courseElements,
    isReady,
  };
};
