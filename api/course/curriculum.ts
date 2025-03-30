import type { Curriculum, Course } from '@/types/curriculum';
import { courseMap } from '@/lib/parsers/curriculum-parser';

/**
 * Fetches curriculum data for a specific program/degree
 * @param programId - The ID of the program (e.g., 'cs-degree', 'math-degree')
 * @returns The curriculum data or null if not found
 */
export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    // Use dynamic import to load the JSON file
    try {
      const curriculumData = await import(`@/data/courses/cs-degree.json`);
      const rawData = curriculumData.default;
      
      if (!rawData) {
        console.error(`Curriculum for program '${programId}' not found`);
        return null;
      }
      
      // Transform raw data to match our Curriculum interface
      const curriculum: Curriculum = {
        id: programId,
        name: rawData.name || '',
        department: rawData.department || '',
        totalPhases: rawData.totalPhases || 8,
        courses: []
      };
      
      // Process courses
      if (Array.isArray(rawData.courses)) {
        curriculum.courses = rawData.courses.map((rawCourse: any): Course => {
          // Map the type from "Ob" to "mandatory" or "optional"
          const type = rawCourse.type === "mandatory" ? "mandatory" : "optional";
          
          const course: Course = {
            id: rawCourse.id,
            name: rawCourse.name,
            credits: rawCourse.credits,
            workload: rawCourse.workload || 0,
            description: rawCourse.description || '',
            prerequisites: rawCourse.prerequisites || [],
            equivalents: rawCourse.equivalents || [],
            type: type,
            phase: rawCourse.phase
          };
          
          // Add to courseMap for direct lookup
          courseMap.set(course.id, course);
          
          return course;
        });
      }
      
      return curriculum;
    } catch (importError) {
      console.error(`Error importing curriculum for program '${programId}':`, importError);
      return null;
    }
  } catch (error) {
    console.error('Error fetching curriculum data:', error);
    return null;
  }
} 