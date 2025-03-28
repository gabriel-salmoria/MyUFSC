"use client"

import { useEffect, RefObject } from 'react'
import type { Course } from '@/types/curriculum'
import { DEPTH_COLORS } from './ConnectionLines'
import { HIGHLIGHT } from "@/styles/visualization"

interface CourseHighlighterProps {
  dashboardRef: RefObject<Element | null>
  courseElements: Map<string, Element[]>
  course: Course
  prerequisiteCourses: Course[]
  coursesDepth: Map<string, number>
}

export default function CourseHighlighter({ 
  dashboardRef, 
  courseElements, 
  course, 
  prerequisiteCourses, 
  coursesDepth 
}: CourseHighlighterProps) {
  // Use effect to apply and clean up highlights
  useEffect(() => {
    if (!dashboardRef.current || courseElements.size === 0) return
    
    // Add styles to document head for consistent rendering across environments
    addHighlightStyles()
    
    // First apply all transitions before changing visual properties
    applyTransitions()
    
    // Then apply the visual changes
    requestAnimationFrame(() => {
      highlightMainCourse()
      highlightPrerequisites()
      dimNonHighlightedCourses()
    })

    // Clean up on unmount
    return () => {
      cleanupHighlights()
      removeHighlightStyles()
    }
  }, [dashboardRef.current, courseElements, course.id, prerequisiteCourses])
  
  // Add CSS styles to document to ensure consistent rendering across environments
  const addHighlightStyles = () => {
    const styleId = 'dependency-tree-highlight-styles'
    
    // Only add if not already present
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .course-transition {
          transition: all ${HIGHLIGHT.TRANSITION_DURATION} ease !important;
        }
        
        .course-highlight-main {
          z-index: 30 !important;
          transform: scale(${HIGHLIGHT.MAIN_SCALE}) !important;
          filter: brightness(${HIGHLIGHT.MAIN_BRIGHTNESS}) contrast(${HIGHLIGHT.MAIN_CONTRAST}) !important;
          box-shadow: ${HIGHLIGHT.MAIN_SHADOW} !important;
        }
        
        .course-highlight-prereq {
          z-index: 20 !important;
          transform: scale(${HIGHLIGHT.PREREQ_SCALE}) !important;
          filter: brightness(${HIGHLIGHT.PREREQ_BRIGHTNESS}) !important;
          box-shadow: ${HIGHLIGHT.PREREQ_SHADOW} !important;
        }
        
        .course-highlight-dimmed {
          opacity: ${HIGHLIGHT.DIM_OPACITY} !important;
          z-index: 1 !important;
          background-color: ${HIGHLIGHT.DIM_BACKGROUND} !important;
          filter: brightness(${HIGHLIGHT.DIM_BRIGHTNESS}) !important;
        }
      `
      document.head.appendChild(style)
    }
  }
  
  // Apply transitions first before any visual changes to prevent flashing
  const applyTransitions = () => {
    if (!dashboardRef.current) return
    
    // Add transitions to all course elements first
    dashboardRef.current.querySelectorAll('[data-course-id]').forEach(element => {
      if (element instanceof HTMLElement) {
        element.classList.add('course-transition')
      }
    })
  }
  
  // Remove added styles when component unmounts
  const removeHighlightStyles = () => {
    const styleElement = document.getElementById('dependency-tree-highlight-styles')
    if (styleElement) {
      styleElement.remove()
    }
  }
  
  // Highlight the main/selected course
  const highlightMainCourse = () => {
    const mainCourseElements = courseElements.get(course.id) || []
    mainCourseElements.forEach(element => {
      if (element instanceof HTMLElement) {
        // Add Tailwind classes and our custom class
        element.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-75', 'course-highlight-main')
      }
    })
  }
  
  // Highlight prerequisite courses with depth-based colors
  const highlightPrerequisites = () => {
    prerequisiteCourses.forEach(prereq => {
      const prereqElements = courseElements.get(prereq.id) || []
      const depth = coursesDepth.get(prereq.id) || 1
      const colorIndex = Math.min(depth, DEPTH_COLORS.length - 1)
      
      prereqElements.forEach(element => {
        if (element instanceof HTMLElement) {
          element.classList.add('ring-2', 'shadow-lg', 'course-highlight-prereq')
          element.style.setProperty('--tw-ring-color', DEPTH_COLORS[colorIndex])
          element.style.setProperty('--tw-ring-opacity', '0.75')
        }
      })
    })
  }
  
  const dimNonHighlightedCourses = () => {
    if (!dashboardRef.current) return
    
    const highlightedCourseIds = new Set([course.id, ...prerequisiteCourses.map(c => c.id)])
    
    dashboardRef.current.querySelectorAll('[data-course-id]').forEach(element => {
      const courseId = element.getAttribute('data-course-id')
      if (courseId && !highlightedCourseIds.has(courseId)) {
        if (element instanceof HTMLElement) {
          element.classList.add('course-highlight-dimmed')
        }
      }
    })
  }
  
  const cleanupHighlights = () => {
    document.querySelectorAll('[data-course-id]').forEach(element => {
      // Remove all classes including our custom ones
      element.classList.remove(
        'ring-4', 'ring-2', 'ring-blue-500', 'ring-green-500', 
        'ring-opacity-75', 'z-30', 'z-20', 'z-10', 'opacity-40', 
        'shadow-lg', 'bg-white', 'bg-gray-100',
        'course-highlight-main', 'course-highlight-prereq', 'course-highlight-dimmed',
        'course-transition'
      )
      
      // Remove inline styles
      if (element instanceof HTMLElement) {
        element.style.removeProperty('--tw-ring-color')
        element.style.removeProperty('--tw-ring-opacity')
        element.style.removeProperty('transform')
        element.style.removeProperty('transition')
        element.style.removeProperty('filter')
        element.style.removeProperty('box-shadow')
        element.style.removeProperty('background-color')
        element.style.removeProperty('opacity')
        element.style.removeProperty('z-index')
      }
    })
  }
  
  // This component doesn't render any visible elements
  // It only applies DOM manipulations through effects
  return null
} 