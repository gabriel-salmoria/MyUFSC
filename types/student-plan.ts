
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
 * Represents a course in the student's personal plan.
 * Only stores the course ID — the full Course object is resolved at render
 * time from the curriculum cache, keeping persisted data small.
 *
 * The same course may appear more than once in the plan (e.g. a student who
 * takes a sport/elective course in multiple semesters). Each enrollment slot
 * gets its own `instanceId` so the store can distinguish between them.
 * Legacy data that was saved before this field was added will have
 * `instanceId === undefined`; those entries are matched by `courseId` only.
 */
export interface StudentCourse {
  courseId: string;
  instanceId?: string; // unique per enrollment slot; undefined for legacy data
  credits: number;   // denormalized from Course, needed for totalCredits without cache
  status: CourseStatus;
  grade?: number;
  class?: string;
  phase?: number;
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
  customScheduleEntries?: CustomScheduleEntry[];
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
