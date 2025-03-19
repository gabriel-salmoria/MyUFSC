import type { Course } from "./curriculum"

/**
 * Represents the status of a course in a student's plan
 */
export enum CourseStatus {
  PENDING = "pending", // Not started yet
  IN_PROGRESS = "inProgress", // Currently taking
  COMPLETED = "completed", // Successfully completed
  FAILED = "failed", // Failed and needs to retake
  EXEMPTED = "exempted", // Exempted/credited from another institution
  PLANNED = "planned", // Planned for a future semester
}

/**
 * Represents a course in the student's personal plan
 */
export interface StudentCourse extends Omit<Course, "phase"> {
  status: CourseStatus
  grade?: number // Student's grade if completed
  semesterTaken?: number // Actual semester when taken (may differ from curriculum)
  semesterPlanned?: number // Semester when student plans to take it
  notes?: string // Personal notes about the course
  professor?: string // Professor who taught/will teach the course
  customColor?: string // Allow student to override the default color
}

/**
 * Represents a semester in the student's plan
 */
export interface StudentSemester {
  number: number // Semester number
  year: string // Academic year (e.g., "2023/1")
  courses: StudentCourse[] // Courses taken/planned for this semester
  totalCredits: number // Total credits for the semester
  isCompleted: boolean // Whether this semester is completed
}

/**
 * Represents the student's complete academic plan
 */
export interface StudentPlan {
  id: string // Plan identifier
  studentId: string // Student identifier
  curriculumId: string // Reference to the base curriculum
  name: string // Name of the plan (e.g., "My CS Degree Plan")
  semesters: StudentSemester[] // Array of semesters
  completedCourses: StudentCourse[] // Courses already completed
  inProgressCourses: StudentCourse[] // Courses currently in progress
  plannedCourses: StudentCourse[] // Courses planned for future semesters
  progress: number // Overall progress percentage
  startDate?: Date // When the student started the program
  expectedGraduationDate?: Date // Expected graduation date
}

