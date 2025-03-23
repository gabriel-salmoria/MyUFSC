"use client"

import { useEffect, RefObject } from 'react'
import type { Course } from '@/types/curriculum'
import { DEPTH_COLORS } from './ConnectionLines'

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
    
    // Apply highlights
    applyHighlights()
    
    // Clean up on unmount
    return () => {
      cleanupHighlights()
    }
  }, [dashboardRef.current, courseElements, course.id, prerequisiteCourses])
  
  // Apply highlighting to courses
  const applyHighlights = () => {
    // Highlight main course
    highlightMainCourse()
    
    // Highlight prerequisites
    highlightPrerequisites()
    
    // Dim non-highlighted courses
    dimNonHighlightedCourses()
  }
  
  // Highlight the main/selected course
  const highlightMainCourse = () => {
    const mainCourseElements = courseElements.get(course.id) || []
    mainCourseElements.forEach(element => {
      if (element instanceof HTMLElement) {
        // Add Tailwind classes
        element.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-75', 'bg-white')
        
        // Add styling that's not easily done with Tailwind
        element.style.zIndex = '30'
        element.style.transform = 'scale(1.02)'
        element.style.transition = 'all 0.3s ease'
        element.style.filter = 'brightness(1.1) contrast(1.05)'
        element.style.boxShadow = '0 0 25px rgba(66, 135, 245, 0.5), 0 0 10px rgba(255, 255, 255, 0.8)'
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
          element.classList.add('ring-2', 'z-10')
          element.style.setProperty('--tw-ring-color', DEPTH_COLORS[colorIndex])
          element.style.setProperty('--tw-ring-opacity', '0.75')
        }
      })
    })
  }
  
  // Dim courses that are not part of the dependency tree
  const dimNonHighlightedCourses = () => {
    if (!dashboardRef.current) return
    
    const highlightedCourseIds = new Set([course.id, ...prerequisiteCourses.map(c => c.id)])
    
    dashboardRef.current.querySelectorAll('[data-course-id]').forEach(element => {
      const courseId = element.getAttribute('data-course-id')
      if (courseId && !highlightedCourseIds.has(courseId)) {
        if (element instanceof HTMLElement) {
          element.classList.add('opacity-40', 'bg-gray-100')
          element.style.transition = 'all 0.3s ease'
          element.style.zIndex = '1'
        }
      } else if (courseId && highlightedCourseIds.has(courseId) && courseId !== course.id) {
        // Add extra styling to other highlighted courses (prerequisites)
        if (element instanceof HTMLElement) {
          element.classList.add('shadow-lg', 'bg-white')
          element.style.zIndex = '20'
          element.style.transform = 'scale(1.01)'
          element.style.transition = 'all 0.3s ease'
          element.style.filter = 'brightness(1.05)'
          element.style.boxShadow = '0 0 15px rgba(66, 135, 245, 0.4)'
        }
      }
    })
  }
  
  // Clean up all highlights
  const cleanupHighlights = () => {
    document.querySelectorAll('[data-course-id]').forEach(element => {
      // Remove Tailwind classes
      element.classList.remove(
        'ring-4', 'ring-2', 'ring-blue-500', 'ring-green-500', 
        'ring-opacity-75', 'z-30', 'z-20', 'z-10', 'opacity-40', 
        'shadow-lg', 'bg-white', 'bg-gray-100'
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