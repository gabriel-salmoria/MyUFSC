import { ComponentType } from 'react'

// Course representation
export interface Course {
  id: string                        // course code (e.g., "INE5407")
  name: string                      // course name (e.g., "Digital Systems")
  credits: number                   // credit count
  workload?: number                 // total hours
  description?: string              // optional course description
  prerequisites?: string[]          // array of prerequisite course codes
  equivalents?: string[]            // array of equivalent course codes
  type?: "mandatory" | "optional"    // whether the course is mandatory or optional
  phase: number                     // recommended phase number (1-8+)
}

// Phase representation (used for UI purposes)
export interface Phase {
  number: number                    // phase number (1, 2, 3, etc.)
  name: string                      // phase name
  courses: Course[]                 // courses in this phase
}

// Curriculum representation
export interface Curriculum {
  id: string                        // curriculum id (e.g., "cs-degree")
  name: string                      // program name (e.g., "Computer Science")
  department: string                // department offering the program
  totalPhases: number               // total number of phases/semesters
  courses: Course[]                 // all courses in this curriculum
}

