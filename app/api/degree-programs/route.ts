import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAllPrograms } from "@/database/programs/db-programs";

// The Data Cache outlives deployments on Vercel: a program added to the DB
// (scripts/orchestrate.ts, ingest_curriculums.ts) only shows up once this
// entry expires. Keep it short — the query is one small SELECT — and bump the
// key's version to force a fresh read on the next deploy.
const getCachedPrograms = unstable_cache(
  () => getAllPrograms(),
  ["degree-programs", "v2"],
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