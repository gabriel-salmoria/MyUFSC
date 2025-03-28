import type { Curriculum, Course, Phase } from '@/types/curriculum';
import { courseMap } from '@/lib/curriculum-parser';

/**
 * Fetches curriculum data for a specific program/degree
 * @param programId - The ID of the program (e.g., 'cs-degree', 'math-degree')
 * @returns The curriculum data or null if not found
 */
export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    // Use dynamic import to load the JSON file
    try {
      const curriculumData = await import(`@/data/courses/${programId}.json`);
      const rawData = curriculumData.default;
      
      // Transform raw data into the expected Curriculum format with phases
      if (rawData) {
        // Group courses by phase
        const coursesByPhase = new Map<number, Course[]>();
        
        // Initialize phase groups
        for (let i = 1; i <= (rawData.totalPhases || 8); i++) {
          coursesByPhase.set(i, []);
        }
        
        // Distribute courses by phase
        if (Array.isArray(rawData.courses)) {
          rawData.courses.forEach((course: Course) => {
            const phase = course.phase || 1;
            const phaseGroup = coursesByPhase.get(phase) || [];
            phaseGroup.push(course);
            coursesByPhase.set(phase, phaseGroup);
            
            // Add to courseMap for direct lookup
            courseMap.set(course.id, course);
          });
        }
        
        // Create phases array
        const phases: Phase[] = [];
        coursesByPhase.forEach((courses, phaseNumber) => {
          phases.push({
            number: phaseNumber,
            name: `Phase ${phaseNumber}`,
            courses: courses
          });
        });
        
        // Return the transformed curriculum
        return {
          name: rawData.name || 'Curriculum',
          department: rawData.department || '',
          totalPhases: rawData.totalPhases || phases.length,
          phases: phases
        };
      }
      return null;
    } catch (importError) {
      console.error(`Curriculum for program '${programId}' not found`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching curriculum data:', error);
    return null;
  }
} 