import type { StudentInfo } from '@/types/student-plan';
import { parseStudentData } from '@/lib/parsers/student-parser';

/**
 * Fetches a student's profile information from the data directory
 * @param studentId - The ID of the student
 * @returns The student profile data or null if not found
 */
export async function fetchStudentProfile(studentId: string): Promise<StudentInfo | null> {
  try {
    // Use dynamic import to load the JSON file
    try {
      const rawProfileData = await import(`@/data/users/${studentId}.json`);
      // Process the raw data into the required format
      const processedData = parseStudentData(rawProfileData.default);
      return processedData;
    } catch (importError) {
      console.error(`Student profile with ID '${studentId}' not found`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return null;
  }
} 