import { NextResponse } from "next/server"
import type { Curriculum, Course } from '@/types/curriculum'
import { courseMap } from '@/lib/parsers/curriculum-parser'

type CourseType = "mandatory" | "optional"

interface CompressedCourse extends Array<any> {
  0: string  // id
  1: string  // name
  2: number  // credits
  3: number  // workload
  4: string  // description
  5: string[] // prerequisites
  6: string[] // equivalents
  7: CourseType  // type
  8: number  // phase
}

interface CompressedCurriculum {
  name: string
  id: number
  totalPhases: number
  department: string
  courses: CompressedCourse[]
}

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: { programId: string } }
) {
  try {
    const programId = params.programId
    
    // Use dynamic import to load the JSON file
    try {
      const curriculumData = await import(`@/data/courses/cs-degree.json`)
      const rawData = curriculumData.default as unknown as CompressedCurriculum
      
      if (!rawData) {
        console.error(`Curriculum for program '${programId}' not found`)
        return NextResponse.json(
          { error: "Curriculum not found" },
          { status: 404 }
        )
      }
      
      // Transform raw data to match our Curriculum interface
      const curriculum: Curriculum = {
        id: programId,
        name: rawData.name || '',
        department: rawData.department || '',
        totalPhases: rawData.totalPhases || 8,
        courses: []
      }
      
      // Process courses from compressed format (array-based)
      if (Array.isArray(rawData.courses)) {
        curriculum.courses = rawData.courses.map((rawCourse: CompressedCourse): Course => {
          const course: Course = {
            id: rawCourse[0],
            name: rawCourse[1],
            credits: rawCourse[2] ?? rawCourse[3] / 18,
            workload: rawCourse[3],
            description: rawCourse[4],
            prerequisites: rawCourse[5],
            equivalents: rawCourse[6],
            type: rawCourse[7],
            phase: rawCourse[8]
          }
          
          // Add to courseMap for direct lookup
          courseMap.set(course.id, course)
          
          return course
        })
      }
      
      return NextResponse.json(curriculum)
    } catch (importError) {
      console.error(`Error importing curriculum for program '${programId}':`, importError)
      return NextResponse.json(
        { error: "Curriculum not found" },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Error fetching curriculum data:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Client-side function to fetch curriculum
export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    const response = await fetch(`/api/course/curriculum/${programId}`)
    if (!response.ok) {
      console.error(`Curriculum for program '${programId}' not found`)
      return null
    }
    return response.json()
  } catch (error) {
    console.error('Error fetching curriculum data:', error)
    return null
  }
} 