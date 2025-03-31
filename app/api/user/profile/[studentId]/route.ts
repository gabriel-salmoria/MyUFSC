import { NextResponse } from "next/server"
import type { StudentInfo } from '@/types/student-plan'
import { parseStudentData } from '@/lib/parsers/student-parser'

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: { studentId: string } }
) {
  try {
    const studentId = params.studentId
    
    // Use dynamic import to load the JSON file
    try {
      const rawProfileData = await import(`@/data/users/${studentId}.json`)
      // Process the raw data into the required format
      const processedData = parseStudentData(rawProfileData.default)
      return NextResponse.json(processedData)
    } catch (importError) {
      console.error(`Student profile with ID '${studentId}' not found`)
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Error fetching student profile:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Client-side function to fetch student profile
export async function fetchStudentProfile(studentId: string): Promise<StudentInfo | null> {
  try {
    const response = await fetch(`/api/user/profile/${studentId}`)
    if (!response.ok) {
      console.error(`Student profile with ID '${studentId}' not found`)
      return null
    }
    return response.json()
  } catch (error) {
    console.error('Error fetching student profile:', error)
    return null
  }
} 