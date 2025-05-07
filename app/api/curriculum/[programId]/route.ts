import { NextResponse } from "next/server";
import { getCurriculumByProgramId } from "@/database/curriculum/db-curriculum"; // Import the new DB function

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: { programId: string } },
) {
  const { programId } = params;

  try {
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
    console.error("Error fetching curriculum:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
