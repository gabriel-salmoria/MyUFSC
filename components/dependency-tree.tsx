"use client"

import { useRef, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

// Types
import type { Course } from "@/types/curriculum"
import { courseMap } from "@/lib/curriculum-parser"

interface DependencyTreeProps {
  course: Course
  isVisible: boolean
  onClose: () => void
}

interface Connection {
  from: string
  to: string
  depth: number // Add depth to track connection level
}

// Define color gradient for different depths
const DEPTH_COLORS = [
  '#3b82f6', // blue-500 (root)
  '#8b5cf6', // violet-500 (depth 1)
  '#ec4899', // pink-500 (depth 2)
  '#f97316', // orange-500 (depth 3+)
]

export default function DependencyTree({ course, isVisible, onClose }: DependencyTreeProps) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [clickedCourse, setClickedCourse] = useState<Course | null>(null)
  const [prerequisiteCourses, setPrerequisiteCourses] = useState<Course[]>([])
  // Map to store course depth information
  const [coursesDepth, setCoursesDepth] = useState<Map<string, number>>(new Map())
  
  // Find all prerequisites when the selected course changes
  useEffect(() => {
    if (!course || !isVisible) return
    
    setClickedCourse(course)
    
    // Find all prerequisites
    const prerequisites: Course[] = []
    const connections: Connection[] = []
    const visitedIds = new Set<string>()
    const depthMap = new Map<string, number>()
    
    const findPrerequisites = (currentCourse: Course, depth: number = 0) => {
      if (!currentCourse.prerequisites || currentCourse.prerequisites.length === 0) return
      
      currentCourse.prerequisites.forEach(prereqId => {
        const prereqCourse = courseMap.get(prereqId)
        if (!prereqCourse) return
        
        // Add connection with depth information
        connections.push({
          from: currentCourse.id,
          to: prereqCourse.id,
          depth: depth
        })
        
        // Only add to prerequisites list if not already visited or found at lower depth
        if (!visitedIds.has(prereqCourse.id) || depthMap.get(prereqCourse.id)! > depth + 1) {
          // If first time visiting, add to prerequisites array
          if (!visitedIds.has(prereqCourse.id)) {
            prerequisites.push(prereqCourse)
          }
          
          // Mark as visited and store depth
          visitedIds.add(prereqCourse.id)
          depthMap.set(prereqCourse.id, depth + 1)
          
          // Recursively find prerequisites of this course
          findPrerequisites(prereqCourse, depth + 1)
        }
      })
    }
    
    // Start recursive search
    findPrerequisites(course)
    setCoursesDepth(depthMap)
    setPrerequisiteCourses(prerequisites)
    setConnections(connections)
    
    // Store the panel source to know where the course was clicked
    const sourcePanel = document.querySelector('.fixed.inset-0.bg-black\\/50.z-50')
    if (sourcePanel) {
      // Close the details panel after storing its source
      sourcePanel.remove()
    }
    
    // Apply highlight effect to all course nodes that are prerequisites
    setTimeout(() => {
      // Find dashboard containers - these are the main visualization containers
      const dashboardContainers = document.querySelectorAll('.border.rounded-lg.overflow-hidden.shadow-md')
      if (!dashboardContainers.length) return
      
      // Determine which dashboard container is the source of the click
      let sourceDashboard: Element | null = null
      
      // First, find which dashboard contains the clicked course
      for (const dashboard of dashboardContainers) {
        const courseElement = dashboard.querySelector(`[data-course-id="${course.id}"]`)
        if (courseElement) {
          sourceDashboard = dashboard
          break
        }
      }
      
      if (!sourceDashboard) {
        console.warn('Could not find source dashboard for dependency view')
        return // If we can't find the source dashboard, exit
      }
      
      // Find all instances of the clicked course on the page
      const allClickedElements = sourceDashboard.querySelectorAll(`[data-course-id="${course.id}"]`)
      if (allClickedElements.length > 0) {
        allClickedElements.forEach(element => {
          element.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-75', 'z-20')
        })
      }
      
      // Highlight all prerequisites with different colors based on depth
      prerequisites.forEach(prereq => {
        // Only look for prerequisites within the same dashboard container
        const prereqElements = sourceDashboard!.querySelectorAll(`[data-course-id="${prereq.id}"]`)
        const depth = depthMap.get(prereq.id) || 1
        const colorIndex = Math.min(depth, DEPTH_COLORS.length - 1)
        
        prereqElements.forEach(element => {
          element.classList.add('ring-2', 'z-10')
          // Apply color directly using style
          if (element instanceof HTMLElement) {
            element.style.setProperty('--tw-ring-color', DEPTH_COLORS[colorIndex])
            element.style.setProperty('--tw-ring-opacity', '0.75')
          }
        })
      })
      
      // Add SVG for connections directly to the dashboard
      drawConnectionLines(course, prerequisites, connections, sourceDashboard)
      
      // Add a subtle highlight to the source dashboard to emphasize it
      sourceDashboard.classList.add('ring-1', 'ring-inset', 'ring-blue-300')
      
      // Add event listeners for scrolling and clicking outside
      const handleScroll = () => {
        removeHighlightsAndLines()
        window.removeEventListener('scroll', handleScroll, true)
        document.removeEventListener('click', handleOutsideClick)
        onClose()
      }
      
      const handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as Element
        // Skip if clicking on a course element or close button
        if (target.closest('[data-course-id]') || target.closest('#dependency-close-button')) {
          return
        }
        removeHighlightsAndLines()
        window.removeEventListener('scroll', handleScroll, true)
        document.removeEventListener('click', handleOutsideClick)
        onClose()
      }
      
      // Add the event listeners
      window.addEventListener('scroll', handleScroll, true)
      document.addEventListener('click', handleOutsideClick)
    }, 100)
    
    // Cleanup when unmounting
    return () => {
      removeHighlightsAndLines()
    }
  }, [course, isVisible, onClose])
  
  // When visibility changes, handle cleanup
  useEffect(() => {
    if (!isVisible) {
      removeHighlightsAndLines()
    }
  }, [isVisible])
  
  // Function to remove highlights and connection lines
  const removeHighlightsAndLines = () => {
    // Remove highlights from all course nodes
    document.querySelectorAll('[data-course-id]').forEach(element => {
      element.classList.remove(
        'ring-4', 'ring-2', 'ring-blue-500', 'ring-green-500', 
        'ring-opacity-75', 'z-20', 'z-10'
      )
      
      // Clear any inline styles for colors
      if (element instanceof HTMLElement) {
        element.style.removeProperty('--tw-ring-color')
        element.style.removeProperty('--tw-ring-opacity')
      }
    })
    
    // Remove dashboard highlights
    document.querySelectorAll('.border.rounded-lg.overflow-hidden.shadow-md').forEach(dashboard => {
      dashboard.classList.remove('ring-1', 'ring-inset', 'ring-blue-300')
    })
    
    // Remove SVG connection lines
    const connectionLines = document.getElementById('dependency-connections')
    if (connectionLines) {
      connectionLines.remove()
    }
    
    // Remove close button
    const closeButton = document.getElementById('dependency-close-button')
    if (closeButton) {
      closeButton.remove()
    }
    
    // Remove info banner
    const infoBanner = document.getElementById('dependency-info-banner')
    if (infoBanner) {
      infoBanner.remove()
    }
  }
  
  // Function to draw connection lines directly in the dashboard
  const drawConnectionLines = (
    centerCourse: Course, 
    prerequisites: Course[], 
    connections: Connection[],
    sourceDashboard: Element
  ) => {
    // First remove any existing lines
    const existingLines = document.getElementById('dependency-connections')
    if (existingLines) {
      existingLines.remove()
    }
    
    // Remove existing close button if any
    const existingCloseButton = document.getElementById('dependency-close-button')
    if (existingCloseButton) {
      existingCloseButton.remove()
    }
    
    // Determine which visualization triggered this
    // We'll determine this based on which panel closed
    let sourceVisualization: string | null = null;
    
    // 1. Try to identify where the course was originally displayed
    // We know this by checking which UI component references exist
    if (centerCourse.ui_curriculum) {
      sourceVisualization = "curriculum"
    } else if (centerCourse.ui_progress) {
      sourceVisualization = "progress"
    } else if (centerCourse.ui_electives) {
      sourceVisualization = "electives"
    }
    
    // Get all course elements within the source dashboard
    const courseElements = new Map<string, {element: Element, rect: DOMRect}[]>()
    sourceDashboard.querySelectorAll('[data-course-id]').forEach(element => {
      const id = element.getAttribute('data-course-id')
      if (id) {
        if (!courseElements.has(id)) {
          courseElements.set(id, [])
        }
        courseElements.get(id)?.push({
          element,
          rect: element.getBoundingClientRect()
        })
      }
    })
    
    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('id', 'dependency-connections')
    svg.style.position = 'fixed'
    svg.style.top = '0'
    svg.style.left = '0'
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.pointerEvents = 'none'
    svg.style.zIndex = '5'
    
    // Helper function to find the appropriate element for a course in the current visualization
    const findAppropriateElement = (courseId: string): {element: Element, rect: DOMRect} | null => {
      const elements = courseElements.get(courseId) || []
      if (elements.length === 0) return null
      
      // Default to the first element if we can't determine
      return elements[0]
    }
    
    // Add each connection line
    connections.forEach(connection => {
      const sourceElement = findAppropriateElement(connection.from)
      const targetElement = findAppropriateElement(connection.to)
      
      if (!sourceElement || !targetElement) return
      
      // Get color based on depth
      const colorIndex = Math.min(connection.depth, DEPTH_COLORS.length - 1)
      const strokeColor = DEPTH_COLORS[colorIndex]
      
      // Calculate line positions
      const x1 = sourceElement.rect.left + sourceElement.rect.width / 2
      const y1 = sourceElement.rect.top + sourceElement.rect.height / 2
      const x2 = targetElement.rect.left + targetElement.rect.width / 2
      const y2 = targetElement.rect.top + targetElement.rect.height / 2
      
      // Create line element
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', x1.toString())
      line.setAttribute('y1', y1.toString())
      line.setAttribute('x2', x2.toString())
      line.setAttribute('y2', y2.toString())
      line.setAttribute('stroke', strokeColor)
      line.setAttribute('stroke-width', `${3 - Math.min(connection.depth, 2)}`)
      line.setAttribute('stroke-dasharray', '1')
      
      // Animate the line
      line.innerHTML = `
        <animate attributeName="stroke-dashoffset" from="1" to="0" dur="0.5s" fill="freeze" />
        <animate attributeName="opacity" from="0" to="0.75" dur="0.3s" fill="freeze" />
      `
      
      svg.appendChild(line)
    })
    
    // Add the SVG to the document
    document.body.appendChild(svg)
    
    // Add close button
    const closeButton = document.createElement('button')
    closeButton.className = 'fixed top-4 right-4 bg-white rounded-full p-2 shadow-lg z-50 hover:bg-gray-100 transition-colors duration-200'
    closeButton.title = 'Close dependency view'
    closeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `
    closeButton.onclick = onClose
    closeButton.id = 'dependency-close-button'
    document.body.appendChild(closeButton)
    
    // Add info banner
    const infoBanner = document.createElement('div')
    infoBanner.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-full text-sm shadow-lg z-50 opacity-0 transition-opacity duration-500'
    infoBanner.innerHTML = 'Click anywhere or scroll to dismiss'
    infoBanner.id = 'dependency-info-banner'
    document.body.appendChild(infoBanner)
    
    // Fade in the banner after a short delay
    setTimeout(() => {
      const banner = document.getElementById('dependency-info-banner')
      if (banner) {
        banner.style.opacity = '1'
        
        // Fade out after 3 seconds
        setTimeout(() => {
          banner.style.opacity = '0'
          
          // Remove from DOM after fade out
          setTimeout(() => {
            banner.remove()
          }, 500)
        }, 3000)
      }
    }, 500)
  }
  
  // This component doesn't render anything directly - it manipulates the DOM
  return null
}