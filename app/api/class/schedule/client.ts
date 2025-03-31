// Client-side function to fetch class schedule
export async function fetchClassSchedule(): Promise<Record<string, any> | null> {
  try {
    const response = await fetch('/api/class/schedule')
    
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