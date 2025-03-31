import { NextResponse } from "next/server"

// Server-side route handler
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const semester = searchParams.get('semester')
    const campus = searchParams.get('campus')

    if (!semester || !campus) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // Use dynamic import to load the JSON file
    try {
      const scheduleData = await import(`@/data/courses/cs-classes-2025.json`)
      return NextResponse.json(scheduleData.default)
    } catch (importError) {
      console.error(`Class schedule for semester '${semester}' and campus '${campus}' not found`)
      return NextResponse.json(
        { error: "Class schedule not found" },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Error fetching class schedule data:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Client-side function to fetch class schedule
export async function fetchClassSchedule(semester: string, campus: string): Promise<any | null> {
  try {
    const response = await fetch(`/api/class/schedule?semester=${semester}&campus=${campus}`)
    if (!response.ok) {
      console.error(`Class schedule for semester '${semester}' and campus '${campus}' not found`)
      return null
    }
    return response.json()
  } catch (error) {
    console.error('Error fetching class schedule data:', error)
    return null
  }
} 