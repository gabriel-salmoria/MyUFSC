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
    console.log(`[Curriculum API] Received request for program ID: ${programId}`)

    if (!programId) {
      console.log(`[Curriculum API] Missing program ID in request`)
      return NextResponse.json(
        { error: "Missing program ID" },
        { status: 400 }
      )
    }

    // Log file path we're trying to access
    const curriculumPath = path.join(process.cwd(), "data", "courses", `${programId}.json`);
    console.log(`[Curriculum API] Attempting to load curriculum from: ${curriculumPath}`);

    // Use dynamic import to load the curriculum
    try {
      const curriculum = await import(`@/data/courses/${programId}.json`)
      console.log(`[Curriculum API] Successfully loaded curriculum for program: ${programId}`);
      console.log(`[Curriculum API] Curriculum data:`, JSON.stringify(curriculum.default.name || "No name", null, 2));
      
      return NextResponse.json(curriculum.default)
    } catch (importError) {
      console.error(`[Curriculum API] Error: Curriculum for program '${programId}' not found:`, importError)
      return NextResponse.json(
        { error: "Curriculum not found" },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('[Curriculum API] Error fetching curriculum data:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Client-side function to fetch curriculum data
export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    console.log(`[Curriculum Client] Fetching curriculum for program: ${programId}`);
    const response = await fetch(`/api/course/curriculum/${programId}`)

    if (!response.ok) {
      console.error(`[Curriculum Client] Failed to fetch curriculum for program: ${programId}`)
      return null
    }

    const data = await response.json();
    console.log(`[Curriculum Client] Successfully fetched curriculum for program: ${programId}`);
    console.log(`[Curriculum Client] Curriculum data: "${data.name}"`);
    
    // Debug the full structure
    console.log(`[Curriculum Client] Full data structure:`, JSON.stringify(data).substring(0, 500) + '...');

    return data
  } catch (error) {
    console.error(`[Curriculum Client] Error fetching curriculum:`, error)
    return null
  }
} 