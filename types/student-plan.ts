import type { Course } from "./curriculum";

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
  DEFAULT = "default",
}

/**
 * Represents a course in the student's personal plan
 */
export interface StudentCourse extends Course {
  course: Course;
  status: CourseStatus;
  grade?: number;
  class?: string;
}

/**
 * Represents a semester in the student's plan
 */
export interface StudentSemester {
  number: number;
  courses: StudentCourse[];
  totalCredits: number;
}

/**
 * Represents the student's complete academic plan
 */
export interface StudentPlan {
  semesters: StudentSemester[];
}

/**
 * Represents the student's personal information
 */
export interface StudentInfo {
  currentDegree: string;
  interestedDegrees: string[];
  name: string;
  currentPlan: number;
  currentSemester: string;
  plans: StudentPlan[];
}
