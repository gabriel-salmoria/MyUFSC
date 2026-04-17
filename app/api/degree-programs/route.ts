import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAllPrograms } from "@/database/programs/db-programs";

const getCachedPrograms = unstable_cache(
  () => getAllPrograms(),
  ["degree-programs"],
  { revalidate: 86400 },
);

export async function GET() {
  try {
    const programs = await getCachedPrograms();

    return NextResponse.json({ programs }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=2592000" },
    });
  } catch (error) {
    console.error("Failed to load degree programs:", error);
    return NextResponse.json(
      { error: "Failed to load degree programs" },
      { status: 500 },
    );
  }
}