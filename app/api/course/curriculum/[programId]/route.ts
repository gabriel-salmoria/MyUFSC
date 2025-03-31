import { NextResponse } from "next/server"
import { Curriculum } from "@/types/curriculum"
import path from "path"

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: { programId: string } }
) {
  try {
    const { programId } = await Promise.resolve(params)

    if (!programId) {
      return NextResponse.json(
        { error: "Missing program ID" },
        { status: 400 }
      )
    }

    // Log file path we're trying to access
    const curriculumPath = path.join(process.cwd(), "data", "courses", `${programId}.json`);

    // Use dynamic import to load the curriculum
    try {
      const curriculum = await import(`@/data/courses/${programId}.json`)
      
      return NextResponse.json(curriculum.default)
    } catch (importError) {
      return NextResponse.json(
        { error: "Curriculum not found" },
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

// Client-side function to fetch curriculum data
export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    const response = await fetch(`/api/course/curriculum/${programId}`)

    if (!response.ok) {
      return null
    }

    const data = await response.json();
    
    return data
  } catch (error) {
    return null
  }
} 