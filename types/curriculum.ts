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
  /**
   * Only in curricula with habilitações: where this course sits in each one
   * (key = index into `Curriculum.habilitacoes`). A course without `tracks` is
   * shared by every habilitação; one with `tracks` belongs only to those keys.
   */
  tracks?: Record<number, { type: "mandatory" | "optional"; phase: number }>
}

// A habilitação a student follows ("Licenciatura" / "Bacharelado")
export interface Habilitacao {
  label: string                     // short name for the slider
  name: string                      // full name from the curriculum PDF
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
  courses: Course[]                 // the courses of the chosen habilitação (all, if none)
  habilitacoes?: Habilitacao[]      // 2+ when the curriculum has habilitações
  habilitacao?: number              // which habilitação `courses` currently shows
  allCourses?: Course[]             // every habilitação's courses (see lib/habilitacao.ts)
}

