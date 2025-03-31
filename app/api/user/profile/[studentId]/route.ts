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
    
    // Show the file path for debugging
    const userFilePath = path.join(process.cwd(), "data", "users", `${studentId}.json`)
    
    // Use dynamic import to load the JSON file
    try {
      const rawProfileData = await import(`@/data/users/${studentId}.json`)
      
      // Process the raw data into the required format
      const processedData = parseStudentData(rawProfileData.default)
      
      return NextResponse.json(processedData)
    } catch (importError) {
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 }
      )
    }
  } catch (error) {
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
      return null
    }
    const data = await response.json()
    return data
  } catch (error) {
    return null
  }
} 