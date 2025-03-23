import { useState, useEffect } from 'react'
import type { Course } from "@/types/curriculum"
import { courseMap } from "@/lib/curriculum-parser"

export interface Connection {
  from: string
  to: string
  depth: number
}

export const useDependencyGraph = (course: Course | null, isVisible: boolean) => {
  const [connections, setConnections] = useState<Connection[]>([])
  const [prerequisiteCourses, setPrerequisiteCourses] = useState<Course[]>([])
  const [coursesDepth, setCoursesDepth] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!course || !isVisible) return

    // Find all prerequisites
    const prerequisites: Course[] = []
    const newConnections: Connection[] = []
    const visitedIds = new Set<string>()
    const depthMap = new Map<string, number>()
    
    const findPrerequisites = (currentCourse: Course, depth: number = 0) => {
      if (!currentCourse.prerequisites || currentCourse.prerequisites.length === 0) return
      
      currentCourse.prerequisites.forEach(prereqId => {
        const prereqCourse = courseMap.get(prereqId)
        if (!prereqCourse) return
        
        newConnections.push({
          from: currentCourse.id,
          to: prereqCourse.id,
          depth
        })
        
        if (!visitedIds.has(prereqCourse.id) || depthMap.get(prereqCourse.id)! > depth + 1) {
          if (!visitedIds.has(prereqCourse.id)) {
            prerequisites.push(prereqCourse)
          }
          
          visitedIds.add(prereqCourse.id)
          depthMap.set(prereqCourse.id, depth + 1)
          findPrerequisites(prereqCourse, depth + 1)
        }
      })
    }
    
    findPrerequisites(course)
    setCoursesDepth(depthMap)
    setPrerequisiteCourses(prerequisites)
    setConnections(newConnections)
  }, [course, isVisible])

  return {
    connections,
    prerequisiteCourses,
    coursesDepth
  }
} 