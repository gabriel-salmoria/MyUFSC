// Client-side function to fetch class schedule
const scheduleCache = new Map<string, any>();

export function primeScheduleCache(degreeId: string, data: any) {
  scheduleCache.set(degreeId, data);
}

export async function fetchClassSchedule(currentDegree: string): Promise<Record<string, any> | null> {
  // Check cache first
  if (scheduleCache.has(currentDegree)) {
    return scheduleCache.get(currentDegree);
  }

  try {
    const response = await fetch(`/api/schedule?currentDegree=${encodeURIComponent(currentDegree)}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      return null
    }

    const data = await response.json() as Record<string, any>

    // Cache the result
    scheduleCache.set(currentDegree, data);

    return data
  } catch (error) {
    return null
  }
} 