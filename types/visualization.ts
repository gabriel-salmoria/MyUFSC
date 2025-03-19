/**
 * Represents a visual connection between courses (prerequisites)
 */
export interface CourseConnection {
  fromCourseId: string // Source course ID
  toCourseId: string // Target course ID
  type: "prerequisite" | "corequisite" | "recommended" // Connection type
}

/**
 * Represents the visual position of a course in the curriculum map
 */
export interface CoursePosition {
  courseId: string // Course ID
  x: number // X coordinate (phase/column)
  y: number // Y coordinate (row position within phase)
  width: number // Width of the course box
  height: number // Height of the course box
}

/**
 * Represents the complete visual layout of the curriculum
 */
export interface CurriculumVisualization {
  id: string // Visualization identifier
  curriculumId: string // Reference to the curriculum
  positions: CoursePosition[] // Positions of all courses
  phaseLabels: {
    // Labels for phases
    [phaseNumber: number]: {
      x: number
      y: number
      width: number
      height?: number
    }
  }
  panOffset: { x: number; y: number } // Current pan offset
}

