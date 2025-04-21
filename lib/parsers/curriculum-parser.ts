import type { Curriculum, Course, Phase } from "@/types/curriculum";
import type {
  CurriculumVisualization,
  CoursePosition,
} from "@/types/visualization";

// Import configuration constants
import { COURSE_BOX, PHASE } from "@/styles/visualization";

// Course map for direct lookups
export const courseMap = new Map<string, Course>();

// Function to get course info by code
export function getCourseInfo(courseCode: string): Course | undefined {
  return courseMap.get(courseCode) ?? undefined;
}

// Process courses and create phases from curriculum in one pass
export function generatePhases(curriculum: Curriculum): Phase[] {
  // Create an array of phases based on totalPhases in curriculum
  const phases: Phase[] = [];

  // Check if curriculum exists
  if (!curriculum) {
    return phases;
  }

  // Check if curriculum.courses exists and is an array
  if (!curriculum.courses || !Array.isArray(curriculum.courses)) {
    return phases;
  }

  // Check that we have the total phases value
  const totalPhases = curriculum.totalPhases || 8;

  // Clear and rebuild the course map
  courseMap.clear();

  // Process the courses to convert from array format to object format
  const processedCourses = curriculum.courses.map((courseData: any) => {
    if (Array.isArray(courseData)) {
      // Course data is in array format, convert to object
      // Example format: ["EEL5105","Circuitos e Técnicas Digitais",5,90,"Description",[],[],"mandatory",1]
      const courseType = courseData[7];
      const coursePhase = courseData[8];

      // Normalize the course type
      let normalizedType = "elective";
      if (courseType) {
        const typeStr = String(courseType).toLowerCase();
        normalizedType = typeStr === "mandatory" ? "mandatory" : "optional";
      }

      return {
        id: courseData[0] || "",
        name: courseData[1] || "",
        credits: courseData[2] || 0,
        workload: courseData[3] || 0,
        description: courseData[4] || "",
        prerequisites: Array.isArray(courseData[5]) ? courseData[5] : [],
        equivalents: Array.isArray(courseData[6]) ? courseData[6] : [],
        type: normalizedType,
        phase: coursePhase != null ? Number(coursePhase) : 0,
      };
    }
    return courseData;
  });

  // Update the curriculum courses with the processed format
  curriculum.courses = processedCourses;

  // Add all courses to the course map
  curriculum.courses.forEach((course) => {
    courseMap.set(course.id, course);
  });

  // Initialize phase arrays
  for (let i = 1; i <= totalPhases; i++) {
    // Get courses for this phase
    const phaseCourses = curriculum.courses.filter((course: Course) => {
      // The issue is that we're checking strictly for "mandatory" but it might be stored differently
      return (
        course.phase === i &&
        (course.type === "mandatory" ||
          String(course.type).toLowerCase() === "mandatory")
      );
    });

    // Add phase to array
    phases.push({
      number: i,
      name: `Phase ${i}`,
      courses: phaseCourses,
    });
  }

  return phases;
}

/**
 * Generate curriculum with phased courses
 */
export function generateCurriculumPhases(curriculum: Curriculum): {
  phaseArray: Array<Array<Course>>;
  courseMap: Map<string, Course>;
} {
  const phaseArray = new Array<Array<Course>>();
  const totalPhases = curriculum.totalPhases || 8;

  // Initialize phase arrays
  for (let i = 0; i < totalPhases; i++) {
    phaseArray.push([]);
  }

  // Use the already processed courses and course map from generatePhases
  const phases = generatePhases(curriculum);

  // Convert phases to phaseArray format
  phases.forEach((phase) => {
    phaseArray[phase.number - 1] = phase.courses;
  });

  return { phaseArray, courseMap };
}

// Generate visualization data from a curriculum
export function generateVisualization(
  curriculum: Curriculum,
): CurriculumVisualization {
  // Process the curriculum to get phases and course map
  const { phaseArray } = generateCurriculumPhases(curriculum);

  if (
    !curriculum.courses ||
    !Array.isArray(curriculum.courses) ||
    curriculum.courses.length === 0
  ) {
    return {
      id: `${curriculum.id}-vis`,
      curriculumId: curriculum.id,
      positions: [],
      phaseLabels: {},
      panOffset: { x: 0, y: 0 },
    };
  }

  // Position all courses by phase
  const positions: CoursePosition[] = [];

  // Position courses by phase
  phaseArray.forEach((phaseCourses, phaseIndex) => {
    phaseCourses.forEach((course, courseIndex) => {
      positions.push({
        courseId: course.id,
        x:
          phaseIndex * PHASE.MIN_WIDTH +
          (PHASE.MIN_WIDTH - COURSE_BOX.MIN_WIDTH) / 2,
        y: courseIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
        width: COURSE_BOX.MIN_WIDTH,
        height: COURSE_BOX.HEIGHT,
      });
    });
  });

  // Create phase labels
  const phaseLabels: Record<
    number,
    { x: number; y: number; width: number; height: number }
  > = {};
  for (let i = 1; i <= curriculum.totalPhases; i++) {
    phaseLabels[i] = {
      x: (i - 1) * PHASE.MIN_WIDTH,
      y: 0,
      width: PHASE.MIN_WIDTH,
      height: COURSE_BOX.HEIGHT * 3, // Use COURSE_BOX.HEIGHT instead of PHASE.HEIGHT which doesn't exist
    };
  }

  // Create the visualization object
  return {
    id: `${curriculum.id}-vis`,
    curriculumId: curriculum.id,
    positions: positions,
    phaseLabels,
    panOffset: { x: 0, y: 0 },
  };
}
