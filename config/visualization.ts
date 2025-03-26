/**
 * Configuration file for visualization-related constants
 */

// Course box dimensions
export const COURSE_BOX = {
  MIN_WIDTH: 140,
  HEIGHT: 50,
  MARGIN: 20,
  SPACING_Y: 60,
  WIDTH_FACTOR: 0.8, // Factor used to calculate box width relative to phase width
  GHOST_OPACITY: 0.8, // Opacity for ghost/placeholder boxes
} as const

// Phase/column dimensions
export const PHASE = {
  MIN_WIDTH: 200,
  PADDING: 30,
  BOXES_PER_COLUMN: 6,
  TOTAL_SEMESTERS: 8, // Total number of semesters in the curriculum
} as const

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

// Timetable configuration
export const TIMETABLE = {
  DAYS: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const,
  TIME_SLOTS: [
    { id: "07:30", label: "07:30" },
    { id: "08:20", label: "08:20" },
    { id: "09:10", label: "09:10" },
    { id: "10:10", label: "10:10" },
    { id: "11:00", label: "11:00" },
    { id: "13:30", label: "13:30" },
    { id: "14:20", label: "14:20" },
    { id: "15:10", label: "15:10" },
    { id: "16:20", label: "16:20" },
    { id: "17:10", label: "17:10" },
    { id: "18:30", label: "18:30" },
    { id: "19:20", label: "19:20" },
    { id: "20:20", label: "20:20" },
    { id: "21:10", label: "21:10" },
  ] as const,
  DAYS_MAP: {
    "Segunda": 0,
    "Terça": 1,
    "Quarta": 2,
    "Quinta": 3,
    "Sexta": 4,
    "Sábado": 5,
  } as const,
} as const 