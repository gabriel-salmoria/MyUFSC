import type { Curriculum, Course, Phase } from "@/types/curriculum"
import type { CurriculumVisualization, CoursePosition } from "@/types/visualization"

const positions: CoursePosition[] = []

// Layout constants - should move to a separate file
const COURSE_WIDTH = 140
const COURSE_HEIGHT = 50
const PHASE_WIDTH = 200
const VERTICAL_SPACING = 60

// Course map for direct lookups
export const courseMap = new Map<string, Course>()

// Function to get course info by code
export function getCourseInfo(courseCode: string): Course | undefined {
  if (!courseCode) return undefined;
  
  // Try exact match first
  let course = courseMap.get(courseCode);
  if (course) return course;
  
  // Remove class suffix (e.g., "-05208")
  const baseCode = courseCode.split("-")[0];
  course = courseMap.get(baseCode);
  if (course) return course;
  
  // For debugging in development
  console.log(`Looking for course ${courseCode}. Not found in curriculum.`);
  
  // Return undefined for courses not in the curriculum
  return undefined;
}

// Create phases from curriculum
export function generatePhases(curriculum: Curriculum): Phase[] {
  // Create an array of phases based on totalPhases in curriculum
  const phases: Phase[] = [];
  
  // Check if curriculum.courses exists and is an array
  if (!curriculum.courses || !Array.isArray(curriculum.courses)) {
    console.error("No courses found in curriculum");
    return phases;
  }
  
  for (let i = 1; i <= curriculum.totalPhases; i++) {
    // Get courses for this phase
    const phaseCourses = curriculum.courses
      .filter(course => course.phase === i && course.type === "mandatory");
    
    // Add phase to array
    phases.push({
      number: i,
      name: `Phase ${i}`,
      courses: phaseCourses
    });
  }
  
  return phases;
}

// Generate visualization data from a curriculum
export function generateVisualization(curriculum: Curriculum): CurriculumVisualization {
  // Clear and rebuild the course map
  courseMap.clear();
  
  // Ensure courses array exists before processing
  if (curriculum.courses && Array.isArray(curriculum.courses)) {
    curriculum.courses.forEach(course => {
      courseMap.set(course.id, course);
    });
  }

  // Position all courses by phase
  positions.length = 0;
  
  // Generate phases
  const phases = generatePhases(curriculum);
  
  // Position courses by phase
  phases.forEach((phase, phaseIndex) => {
    phase.courses.forEach((course, courseIndex) => {
      positions.push({
        courseId: course.id,
        x: phaseIndex * PHASE_WIDTH + 30,
        y: courseIndex * VERTICAL_SPACING + 60,
        width: COURSE_WIDTH,
        height: COURSE_HEIGHT,
      });
    });
  });

  // Create phase labels
  const phaseLabels: Record<number, { x: number; y: number; width: number; height: number }> = {};
  for (let i = 1; i <= curriculum.totalPhases; i++) {
    phaseLabels[i] = {
      x: (i - 1) * PHASE_WIDTH,
      y: 0,
      width: PHASE_WIDTH,
      height: 400,
    };
  }

  // Create the visualization object
  return {
    id: `${curriculum.id}-vis`,
    curriculumId: curriculum.id,
    positions,
    phaseLabels,
    panOffset: { x: 0, y: 0 },
  };
}

 