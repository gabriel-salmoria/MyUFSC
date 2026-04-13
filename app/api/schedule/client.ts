// Client-side function to fetch class schedule
const scheduleCache = new Map<string, any>();

export function primeScheduleCache(degreeId: string, semester: string | undefined, data: any) {
  const cacheKey = semester ? `${degreeId}_${semester}` : degreeId;
  scheduleCache.set(cacheKey, data);
}

export async function fetchClassSchedule(currentDegree: string, semester?: string): Promise<Record<string, any> | null> {
  const cacheKey = semester ? `${currentDegree}_${semester}` : currentDegree;
  
  // Check cache first
  if (scheduleCache.has(cacheKey)) {
    return scheduleCache.get(cacheKey);
  }

  try {
    let url = `/api/schedule?currentDegree=${encodeURIComponent(currentDegree)}`;
    if (semester) {
      url += `&semester=${encodeURIComponent(semester)}`;
    }
    
    const response = await fetch(url)

    if (!response.ok) {
      return null
    }

    const data = await response.json() as Record<string, any>

    // Cache the result
    scheduleCache.set(cacheKey, data);

    return data
  } catch (error) {
    return null
  }
}
