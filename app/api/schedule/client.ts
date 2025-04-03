// Client-side function to fetch class schedule
export async function fetchClassSchedule(currentDegree: string): Promise<Record<string, any> | null> {
  try {
    const response = await fetch(`/api/schedule?currentDegree=${encodeURIComponent(currentDegree)}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      return null
    }
    
    const data = await response.json() as Record<string, any>
    
    return data
  } catch (error) {
    return null
  }
} 