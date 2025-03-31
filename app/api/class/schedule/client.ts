// Client-side function to fetch class schedule
export async function fetchClassSchedule(): Promise<Record<string, any> | null> {
  try {
    console.log('[Schedule Client] Fetching class schedule data');
    const response = await fetch('/api/class/schedule')
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('[Schedule Client] Failed to fetch class schedule:', errorData.error)
      return null
    }
    
    const data = await response.json() as Record<string, any>
    console.log('[Schedule Client] Successfully fetched class schedule data');
    
    // Print the full JSON structure for debugging
    console.log('[Schedule Client] Full data structure:', JSON.stringify(data).substring(0, 500) + '...');
    
    // Log what we received to help with debugging
    Object.entries(data).forEach(([degreeKey, degreeData]) => {
      console.log(`[Schedule Client] Received data for degree ${degreeKey} with keys:`, Object.keys(degreeData));
      console.log(`[Schedule Client] FLO data is array:`, Array.isArray(degreeData.FLO));
      if (Array.isArray(degreeData.FLO)) {
        console.log(`[Schedule Client] FLO array length:`, degreeData.FLO.length);
        console.log(`[Schedule Client] First FLO entry (sample):`, JSON.stringify(degreeData.FLO[0]).substring(0, 200) + '...');
      }
    })
    
    return data
  } catch (error) {
    console.error('[Schedule Client] Error fetching class schedule:', error)
    return null
  }
} 