import { useRef, useState, useEffect } from 'react'
import type { Course } from "@/types/curriculum"

export const useDashboardRef = (course: Course | null, isVisible: boolean) => {
  const dashboardRef = useRef<Element | null>(null)
  const [courseElements, setCourseElements] = useState<Map<string, Element[]>>(new Map())
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!course || !isVisible) {
      setIsReady(false)
      return
    }

    // Find the dashboard containing the course
    const findSourceDashboard = () => {
      const dashboardContainers = document.querySelectorAll('.border.rounded-lg.overflow-hidden.shadow-md')

      for (const dashboard of dashboardContainers) {
        const courseElement = dashboard.querySelector(`[data-course-id="${course.id}"]`)
        if (courseElement) {
          dashboardRef.current = dashboard
          // Apply dashboard highlight
          dashboard.classList.add('ring-1', 'ring-inset', 'ring-blue-300')
          return true
        }
      }
      return false
    }

    // Find all course elements in the dashboard
    const findCourseElements = () => {
      if (!dashboardRef.current) return false

      const newCourseElements = new Map<string, Element[]>()
      dashboardRef.current.querySelectorAll('[data-course-id]').forEach(element => {
        const id = element.getAttribute('data-course-id')
        if (id) {
          if (!newCourseElements.has(id)) {
            newCourseElements.set(id, [])
          }
          newCourseElements.get(id)?.push(element)
        }
      })

      setCourseElements(newCourseElements)
      return newCourseElements.size > 0
    }

    // Add background overlay to dashboard
    const addBackgroundOverlay = () => {
      if (!dashboardRef.current) return false

      const bgElement = dashboardRef.current.querySelector('.dashboard-content') || dashboardRef.current.querySelector('.relative')
      if (bgElement instanceof HTMLElement) {
        const overlay = document.createElement('div')
        overlay.className = 'absolute inset-0 pointer-events-none z-0'
        // Ensure overlay covers full content height even when scrolling
        overlay.style.height = `${bgElement.scrollHeight}px`
        overlay.style.backgroundColor = 'rgba(17, 24, 39, 0.1)'
        overlay.style.transition = 'opacity 0.3s ease'
        overlay.id = 'dashboard-overlay'

        if (bgElement.firstChild) {
          bgElement.insertBefore(overlay, bgElement.firstChild)
        } else {
          bgElement.appendChild(overlay)
        }
        return true
      }
      return false
    }

    // Initialize dashboard and course elements with a small delay
    // to ensure DOM is ready
    setTimeout(() => {
      if (findSourceDashboard() && findCourseElements() && addBackgroundOverlay()) {
        setIsReady(true)
      }
    }, 100)

    // Cleanup function
    return () => {
      setIsReady(false)
    }
  }, [course, isVisible])

  return {
    dashboardRef,
    courseElements,
    isReady
  }
} 