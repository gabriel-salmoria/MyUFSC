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
export interface StudentCourse {
  course: Course;
  status: CourseStatus;
  grade?: number;
  class?: string;
  // Properties flattened/cached on StudentCourse for easier access/rendering
  phase?: number;
  id?: string;
  name?: string;
  credits?: number;
  description?: string;
  workload?: number;
  prerequisites?: string[];
  equivalents?: string[];
  type?: string;
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
  id?: string;
  name?: string;
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

/**
 * Represents a user-defined event on the timetable (e.g. gym, work).
 * Stored independently of the semester/plan structure.
 * recurring=true  → shows in every phase view
 * recurring=false → only shows in the phase it was created in (scopedToPhase)
 */
export interface CustomScheduleEntry {
  id: string;
  title: string;
  subtitle?: string; // optional secondary label rendered below the title
  day: number;       // 0=Mon … 5=Sat
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  color: string;     // one of the TIMETABLE_COLOR_CLASSES values
  recurring: boolean;
  scopedToPhase?: number; // only set when recurring=false
}
