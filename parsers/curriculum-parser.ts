import type { Curriculum, Course, Phase } from "@/types/curriculum";
import type { CoursePosition } from "@/types/visualization";

// Import configuration constants
import { COURSE_BOX, PHASE } from "@/styles/visualization";

// Course map for direct lookups
export const courseMap = new Map<string, Course>();

// Function to get course info by code
export function getCourseInfo(courseCode: string): Course | undefined {
  return courseMap.get(courseCode) ?? undefined;
}

// Helper to parse raw course data
export function parseCourses(courses: any[]): Course[] {
  if (!courses || !Array.isArray(courses)) return [];

  return courses.map((courseData: any) => {
    if (Array.isArray(courseData)) {
      // Course data is in array format, convert to object
      // Example format: ["EEL5105","Circuitos e Técnicas Digitais",5,90,"Description",[],[],"mandatory",1]
      const courseType = courseData[7];
      const coursePhase = courseData[8];

      // Normalize the course type
      let normalizedType = "optional";
      if (courseType) {
        const typeStr = String(courseType).toLowerCase();
        // Check for common variations of mandatory
        if (typeStr === "mandatory" || typeStr === "obrigatoria" || typeStr === "obrigatória" || typeStr === "1" || typeStr === "true") {
          normalizedType = "mandatory";
        }
      }

      return {
        id: courseData[0] || "",
        name: courseData[1] || "",
        credits: courseData[2] || 0,
        workload: courseData[3] || 0,
        description: courseData[4] || "",
        prerequisites: Array.isArray(courseData[5]) ? courseData[5] : [],
        equivalents: Array.isArray(courseData[6]) ? courseData[6] : [],
        type: normalizedType as "mandatory" | "optional",
        phase: coursePhase != null ? Number(coursePhase) : 0,
      } as Course;
    }
    return courseData as Course;
  });
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
  const processedCourses = parseCourses(curriculum.courses);

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
        course.type === "mandatory"
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

/**
 * Generate a map where each course ID maps to a Set of all its equivalent course IDs (including itself).
 * This handles transitive relationships: if A=B and B=C, then A=C.
 */
export function generateEquivalenceMap(courses: Course[]): Map<string, Set<string>> {
  const equivalenceMap = new Map<string, Set<string>>();

  // 1. Initialize adjacency list for the graph
  const adj = new Map<string, Set<string>>();

  // Helper to add edge
  const addEdge = (u: string, v: string) => {
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };

  // 2. Build the graph based on declared equivalents
  courses.forEach(course => {
    // Ensure every course is in the graph
    if (!adj.has(course.id)) adj.set(course.id, new Set());

    if (course.equivalents && Array.isArray(course.equivalents)) {
      course.equivalents.forEach(eqId => {
        addEdge(course.id, eqId);
      });
    }
  });

  // 3. Find connected components (equivalence groups)
  const visited = new Set<string>();

  for (const courseId of adj.keys()) {
    if (!visited.has(courseId)) {
      const component = new Set<string>();
      const queue = [courseId];
      visited.add(courseId);
      component.add(courseId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adj.get(current);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              component.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      // 4. Map every node in this component to the full component set
      for (const id of component) {
        equivalenceMap.set(id, component);
      }
    }
  }

  return equivalenceMap;
}
