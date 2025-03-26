/**
 * Configuration file for visualization-related constants
 */

import { 
  COURSE_BOX_DIMENSIONS as COURSE_BOX, 
  PHASE_DIMENSIONS as PHASE, 
  TIMETABLE_CONFIG as TIMETABLE 
} from "@/styles/course-theme";

// Grid layout
export const GRID = {
  PADDING: 30,
  MIN_COLUMNS: 3,
  MAX_COLUMNS: 8,
} as const

// Course highlighting
export const HIGHLIGHT = {
  TRANSITION_DURATION: "0.3s",
  MAIN_SCALE: 1.02,
  PREREQ_SCALE: 1.01,
  MAIN_BRIGHTNESS: 1.1,
  PREREQ_BRIGHTNESS: 1.05,
  MAIN_CONTRAST: 1.05,
  MAIN_SHADOW: "0 0 25px rgba(66, 135, 245, 0.5), 0 0 10px rgba(255, 255, 255, 0.8)",
  PREREQ_SHADOW: "0 0 15px rgba(66, 135, 245, 0.4)",
  DIM_OPACITY: 0.80,
  DIM_BACKGROUND: "#f9fafb",
  DIM_BRIGHTNESS: 0.98,
} as const

export { COURSE_BOX, PHASE, TIMETABLE }; 