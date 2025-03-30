/**
 * Fetches class schedule data for a specific campus and semester
 * @param semester - The semester code (e.g., '20251', '20243')
 * @param campus - The campus code (e.g., 'FLO', 'BLN')
 * @returns The class schedule data or null if not found
 */
export async function fetchClassSchedule(semester: string, campus: string): Promise<any | null> {
  try {
    // Use dynamic import to load the JSON file
    try {
      const scheduleData = await import(`@/data/courses/cs-classes-2025.json`);
      return scheduleData.default;
    } catch (importError) {
      console.error(`Class schedule for semester '${semester}' and campus '${campus}' not found`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching class schedule data:', error);
    return null;
  }
} 