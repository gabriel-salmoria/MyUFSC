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
  
  // Return undefined for courses not in the curriculum
  return undefined;
}

// Create phases from curriculum
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
        normalizedType = (typeStr === "mandatory") ? "mandatory" : "optional";
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
        phase: coursePhase != null ? Number(coursePhase) : 0
      };
    }
    return courseData;
  });
  
  // Update the curriculum courses with the processed format
  curriculum.courses = processedCourses;
  
  for (let i = 1; i <= totalPhases; i++) {
    // Get courses for this phase
    const phaseCourses = curriculum.courses
      .filter((course: Course) => {
        // The issue is that we're checking strictly for "mandatory" but it might be stored differently
        return course.phase === i && (course.type === "mandatory" || String(course.type).toLowerCase() === "mandatory");
      });
    
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
  
  // Process courses if needed to ensure proper format
  if (curriculum.courses && Array.isArray(curriculum.courses)) {
    const firstCourse = curriculum.courses[0];
    
    // Check if courses need conversion from array to object format
    if (Array.isArray(firstCourse)) {
      curriculum.courses = curriculum.courses.map((courseData: any) => {
        if (Array.isArray(courseData)) {
          const courseType = courseData[7];
          
          // Normalize the course type 
          let normalizedType = "elective";
          if (courseType) {
            const typeStr = String(courseType).toLowerCase();
            normalizedType = (typeStr === "mandatory") ? "mandatory" : "optional";
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
            phase: courseData[8] || 0
          };
        }
        return courseData;
      });
    }
    
    // Add all courses to the course map
    curriculum.courses.forEach(course => {
      courseMap.set(course.id, course);
    });
  } else {
    return {
      id: `${curriculum.id}-vis`,
      curriculumId: curriculum.id,
      positions: [],
      phaseLabels: {},
      panOffset: { x: 0, y: 0 },
    };
  }

  // Position all courses by phase - create a new array rather than modifying the global one
  const newPositions: CoursePosition[] = [];
  
  // Generate phases
  const phases = generatePhases(curriculum);
  
  // Position courses by phase
  phases.forEach((phase, phaseIndex) => {
    phase.courses.forEach((course, courseIndex) => {
      newPositions.push({
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

  // Create the visualization object using the new positions array
  return {
    id: `${curriculum.id}-vis`,
    curriculumId: curriculum.id,
    positions: newPositions,
    phaseLabels,
    panOffset: { x: 0, y: 0 },
  };
}

 