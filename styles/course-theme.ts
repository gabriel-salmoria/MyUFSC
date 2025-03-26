/**
 * Course Theme Configuration
 * 
 * This file centralizes all styling related to courses, visualizers, 
 * and timetable components to improve maintainability and consistency.
 */

// Status color configuration
export const STATUS_COLORS = {
  COMPLETED: {
    border: '#22c55e', // green-500
    background: '#dcfce7', // green-100
    text: '#166534', // green-800
    icon: '#16a34a', // green-600
  },
  IN_PROGRESS: {
    border: '#3b82f6', // blue-500
    background: '#dbeafe', // blue-100
    text: '#1e40af', // blue-800
    icon: '#2563eb', // blue-600
  },
  FAILED: {
    border: '#ef4444', // red-500
    background: '#fee2e2', // red-100
    text: '#991b1b', // red-800
    icon: '#dc2626', // red-600
  },
  PLANNED: {
    border: '#a855f7', // purple-500
    background: '#f3e8ff', // purple-100
    text: '#6b21a8', // purple-800
    icon: '#9333ea', // purple-600
  },
  EXEMPTED: {
    border: '#eab308', // yellow-500
    background: '#fef9c3', // yellow-100
    text: '#854d0e', // yellow-800
    icon: '#ca8a04', // yellow-600
  },
  DEFAULT: {
    border: '#6b7280', // gray-500
    background: '#f3f4f6', // gray-100
    text: '#1f2937', // gray-800
    icon: '#4b5563', // gray-600
  },
};

// Course box dimensions
export const COURSE_BOX_DIMENSIONS = {
  MIN_WIDTH: 140,
  HEIGHT: 50,
  MARGIN: 20,
  SPACING_Y: 60,
  WIDTH_FACTOR: 0.8, // Factor used to calculate box width relative to phase width
  GHOST_OPACITY: 0.8, // Opacity for ghost/placeholder boxes
};

// Phase/column dimensions 
export const PHASE_DIMENSIONS = {
  MIN_WIDTH: 200,
  PADDING: 30,
  BOXES_PER_COLUMN: 6,
  TOTAL_SEMESTERS: 8, // Total number of semesters in the curriculum
};

// Timetable configuration
export const TIMETABLE_CONFIG = {
  DAYS: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
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
  ],
  DAYS_MAP: {
    "Segunda": 0,
    "Terça": 1,
    "Quarta": 2,
    "Quinta": 3,
    "Sexta": 4,
    "Sábado": 5,
  },
};

// CSS class names for status styling
export const STATUS_CLASSES = {
  COMPLETED: "course-completed",
  IN_PROGRESS: "course-in-progress",
  FAILED: "course-failed",
  PLANNED: "course-planned",
  EXEMPTED: "course-exempted",
  DEFAULT: "course-default",
  EMPTY: "course-empty",
  EMPTY_ALT: "course-empty-alt",
};

// Base CSS classes for components
export const CSS_CLASSES = {
  COURSE_BOX: "course-box",
  COURSE_ID: "course-id",
  COURSE_NAME: "course-name",
  COURSE_SELECTED: "course-selected",
  TIMETABLE_CELL: "timetable-cell",
  TIMETABLE_COURSE: "timetable-course",
  DRAGGABLE: "draggable",
  
  // New classes for progress visualizer
  GHOST_BOX: "ghost-box",
  GHOST_BOX_DRAG_OVER: "drag-over",
  GHOST_BOX_DROP_SUCCESS: "drop-success",
  PHASE_DIVIDER: "phase-divider",
  
  // New classes for timetable
  TIMETABLE_HEADER: "timetable-header",
  TIMETABLE_TIME_CELL: "timetable-time-cell",
  TIMETABLE_CONTAINER: "timetable-container",
  TIMETABLE_TABLE: "timetable-table",
  
  // New classes for course stats
  STATS_CONTAINER: "stats-container",
  STATS_HEADER: "stats-header",
  STATS_SECTION: "stats-section",
  STATS_GRID: "stats-grid",
  STATS_CARD: "stats-card",
  STATS_SEARCH: "stats-search",
  STATS_SEARCH_ICON: "stats-search-icon",
  STATS_COURSE_CARD: "stats-course-card",
  STATS_SUMMARY_CARD: "stats-summary-card",
  STATS_PROFESSOR_CARD: "stats-professor-card",
  STATS_PROFESSOR_ACTIVE: "stats-professor-active",
  STATS_ENROLLMENT_BAR: "stats-enrollment-bar",
  STATS_ENROLLMENT_PROGRESS: "stats-enrollment-progress",
}; 