import { NextResponse } from "next/server";
import { getCurriculumByProgramId } from "@/database/curriculum/db-curriculum"; // Import the new DB function
import { Curriculum } from "@/types/curriculum"; // Assuming this type matches the DB result structure or can be mapped
// import path from "path"; // No longer needed

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: { programId: string } },
) {
  try {
    const { programId } = params; // programId is already available in params

    if (!programId) {
      return NextResponse.json(
        { error: "Missing program ID" },
        { status: 400 },
      );
    }

    // Fetch curriculum from the database
    const curriculum = await getCurriculumByProgramId(programId);

    if (!curriculum) {
      return NextResponse.json(
        { error: "Curriculum not found" },
        { status: 404 },
      );
    }

    // Return the fetched JSON blob directly
    return NextResponse.json(curriculum);
  } catch (error) {
    console.error("Error fetching curriculum:", error); // Log the actual error on the server
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Client-side function to fetch curriculum data (no change needed on client side if API contract is the same)
// import { Curriculum } from "@/types/curriculum"; // Keep this import

// export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
//   try {
//     const response = await fetch(`/api/course/curriculum/${programId}`)

//     if (!response.ok) {
//       return null
//     }

//     const data = await response.json();

//     return data
//   } catch (error) {
//     return null
//   }
// }
