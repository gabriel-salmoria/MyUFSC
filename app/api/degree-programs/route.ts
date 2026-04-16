import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAllPrograms } from "@/database/programs/db-programs";

const getCachedPrograms = unstable_cache(
  () => getAllPrograms(),
  ["degree-programs"],
  { revalidate: 3600 },
);

export async function GET() {
  try {
    const programs = await getCachedPrograms();

    return NextResponse.json({ programs }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("Failed to load degree programs:", error);
    return NextResponse.json(
      { error: "Failed to load degree programs" },
      { status: 500 },
    );
  }
}