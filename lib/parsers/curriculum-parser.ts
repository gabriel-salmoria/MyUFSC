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
  
  // Check if curriculum exists
  if (!curriculum) {
    console.error("No curriculum provided to generatePhases");
    return phases;
  }
  
  // Check if curriculum.courses exists and is an array
  if (!curriculum.courses || !Array.isArray(curriculum.courses)) {
    console.error("No courses found in curriculum:", curriculum);
    return phases;
  }
  
  // Check that we have the total phases value
  const totalPhases = curriculum.totalPhases || 8;
  
  // Debug the curriculum structure
  console.log(`[Phases Generator] Curriculum has ${curriculum.courses.length} courses and ${totalPhases} phases`);
  
  // Sample the first few courses to ensure data is structured correctly
  if (curriculum.courses.length > 0) {
    // Show the first course in detail 
    const firstCourse = curriculum.courses[0];
    
    if (Array.isArray(firstCourse)) {
      console.log(`[Phases Generator] First course is in array format:`, JSON.stringify(firstCourse));
    } else {
      console.log(`[Phases Generator] First course is in object format:`, firstCourse);
    }
    
    // Count courses by phase to debug filtering issues
    const coursesByPhase: Record<number, number> = {};
    for (let i = 1; i <= totalPhases; i++) {
      coursesByPhase[i] = curriculum.courses.filter((c: any) => {
        if (Array.isArray(c)) {
          return c[8] === i; // Phase is at index 8 in array format
        }
        return c.phase === i;
      }).length;
    }
    
    console.log(`[Phases Generator] Courses by phase (before processing):`, coursesByPhase);
    
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
    console.log(`[Phases Generator] Converted ${processedCourses.length} courses to object format`);
    
    // Count courses by phase again after processing to debug filtering issues
    const coursesByPhaseAfter: Record<number, number> = {};
    for (let i = 1; i <= totalPhases; i++) {
      coursesByPhaseAfter[i] = curriculum.courses.filter((c: any) => c.phase === i && c.type === "mandatory").length;
    }
    
    console.log(`[Phases Generator] Courses by phase after processing (mandatory only):`, coursesByPhaseAfter);
  }
  
  for (let i = 1; i <= totalPhases; i++) {
    // Get courses for this phase
    const phaseCourses = curriculum.courses
      .filter((course: Course) => {
        // Debug the type and phase
        if (i === 1 && course.phase === 1) {
          console.log(`[Phases Generator] Checking course ${course.id}, type=${course.type}, phase=${course.phase}`);
          console.log(`[Phases Generator] Type comparison: ${course.type} === "mandatory" = ${course.type === "mandatory"}`);
        }
        
        // The issue is that we're checking strictly for "mandatory" but it might be stored differently
        return course.phase === i && (course.type === "mandatory" || String(course.type).toLowerCase() === "mandatory");
      });
    
    console.log(`[Phases Generator] Phase ${i} has ${phaseCourses.length} courses`);
    
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
      console.log(`[Visualization Generator] Converting courses from array to object format`);
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
    console.error("Curriculum has no courses array:", curriculum);
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
  
  console.log(`[Curriculum Parser] Generated ${phases.length} phases with total courses: ${phases.reduce((acc, phase) => acc + phase.courses.length, 0)}`);
  
  // Position courses by phase
  phases.forEach((phase, phaseIndex) => {
    console.log(`[Curriculum Parser] Phase ${phase.number} has ${phase.courses.length} courses`);
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
  
  console.log(`[Curriculum Parser] Generated visualization with ${newPositions.length} course positions`);

  // Create the visualization object using the new positions array
  return {
    id: `${curriculum.id}-vis`,
    curriculumId: curriculum.id,
    positions: newPositions,
    phaseLabels,
    panOffset: { x: 0, y: 0 },
  };
}

 