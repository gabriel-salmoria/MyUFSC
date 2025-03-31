import { NextResponse } from "next/server"
import type { StudentInfo } from '@/types/student-plan'
import { parseStudentData } from '@/lib/parsers/student-parser'
import path from "path"

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: { studentId: string } }
) {
  try {
    const { studentId } = await Promise.resolve(params)
    console.log(`[Profile API] Fetching profile for studentId: ${studentId}`)
    
    // Show the file path for debugging
    const userFilePath = path.join(process.cwd(), "data", "users", `${studentId}.json`)
    console.log(`[Profile API] Looking for file at: ${userFilePath}`)
    
    // Use dynamic import to load the JSON file
    try {
      const rawProfileData = await import(`@/data/users/${studentId}.json`)
      console.log(`[Profile API] Successfully loaded profile data for: ${studentId}`)
      console.log(`[Profile API] Raw profile data:`, JSON.stringify(rawProfileData.default, null, 2))
      
      // Process the raw data into the required format
      const processedData = parseStudentData(rawProfileData.default)
      console.log(`[Profile API] Processed profile data:`, JSON.stringify(processedData, null, 2))
      
      return NextResponse.json(processedData)
    } catch (importError) {
      console.error(`[Profile API] Student profile with ID '${studentId}' not found:`, importError)
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('[Profile API] Error fetching student profile:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Client-side function to fetch student profile
export async function fetchStudentProfile(studentId: string): Promise<StudentInfo | null> {
  try {
    console.log(`[Profile Client] Fetching profile for studentId: ${studentId}`)
    const response = await fetch(`/api/user/profile/${studentId}`)
    if (!response.ok) {
      console.error(`[Profile Client] Student profile with ID '${studentId}' not found`)
      return null
    }
    const data = await response.json()
    console.log(`[Profile Client] Successfully fetched profile:`, data)
    return data
  } catch (error) {
    console.error('[Profile Client] Error fetching student profile:', error)
    return null
  }
} 