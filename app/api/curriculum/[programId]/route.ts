import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getCurriculumByProgramId } from "@/database/curriculum/db-curriculum";

function getCachedCurriculum(programId: string) {
  return unstable_cache(
    () => getCurriculumByProgramId(programId),
    [`curriculum-${programId}`],
    { revalidate: 86400 },
  )();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ programId: string }> },
) {
  const { programId } = await params;

  try {
    if (!programId) {
      return NextResponse.json(
        { error: "Missing program ID" },
        { status: 400 },
      );
    }

    const curriculum = await getCachedCurriculum(programId);

    if (!curriculum) {
      return NextResponse.json(
        { error: "Curriculum not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(curriculum, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=2592000" },
    });
  } catch (error) {
    console.error("Error fetching curriculum:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
