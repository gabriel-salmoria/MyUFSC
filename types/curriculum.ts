/**
 * Represents a course in the university curriculum
 */
export interface Course {
  id: string // Course code (e.g., "INE5407")
  name: string // Course name (e.g., "Digital Systems")
  credits: number // Number of credits
  workload?: number // Total hours
  description?: string // Optional course description
  prerequisites?: string[] // Array of course IDs that are prerequisites
  corequisites?: string[] // Optional array of course IDs that are corequisites
  equivalents?: string[] // Optional array of equivalent courses
  type?: "mandatory" | "optional" // Whether the course is mandatory or optional
  phase: number // Semester/phase number (1-8+)
}

/**
 * Represents a semester/phase in the curriculum
 */
export interface Phase {
  number: number // Phase number (1, 2, 3, etc.)
  name: string // Phase name (e.g., "Phase 1", "First Semester")
  courses: Course[] // Courses in this phase
}

/**
 * Represents the complete curriculum structure
 */
export interface Curriculum {
  name: string // Name of the program (e.g., "Computer Science")
  department: string // Department offering the program
  totalPhases: number // Total number of phases/semesters
  phases: Phase[] // Array of phases
}

