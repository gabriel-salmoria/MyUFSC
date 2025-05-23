/**
 * Represents a visual connection between courses (prerequisites)
 */
export interface CourseConnection {
  fromCourseId: string; // Source course ID
  toCourseId: string; // Target course ID
  type: "prerequisite" | "corequisite" | "recommended"; // Connection type
}

/**
 * Represents the visual position of a course in the curriculum map
 */
export interface CoursePosition {
  courseId: string; // Course ID
  x: number; // X coordinate (phase/column)
  y: number; // Y coordinate (row position within phase)
  width: number; // Width of the course box
  height: number; // Height of the course box
  isGhost?: boolean; // Whether this is a ghost/placeholder box
}
