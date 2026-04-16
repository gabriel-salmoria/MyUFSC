import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getScheduleByProgramAndSemester, getLatestSemester, getAvailableSemesters } from "@/database/schedule/db-schedule";

function getCachedLatestSemester(programId: string) {
  return unstable_cache(
    () => getLatestSemester(programId),
    [`schedule-latest-${programId}`],
    { revalidate: 3600 },
  )();
}

function getCachedAvailableSemesters(programId: string) {
  return unstable_cache(
    () => getAvailableSemesters(programId),
    [`schedule-semesters-${programId}`],
    { revalidate: 3600 },
  )();
}

function getCachedSchedule(programId: string, semester: string) {
  return unstable_cache(
    () => getScheduleByProgramAndSemester(programId, semester),
    [`schedule-${programId}-${semester}`],
    { revalidate: 3600 },
  )();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const currentDegree = url.searchParams.get("currentDegree");
    const requestedSemester = url.searchParams.get("semester");

    if (!currentDegree) {
      return NextResponse.json(
        { error: "Missing degree ID" },
        { status: 400 },
      );
    }

    // When no semester is requested, resolve latest + available in parallel
    let semester: string;
    let availableSemesters: string[];

    if (requestedSemester) {
      semester = requestedSemester;
      availableSemesters = await getCachedAvailableSemesters(currentDegree);
    } else {
      const [latest, semesters] = await Promise.all([
        getCachedLatestSemester(currentDegree),
        getCachedAvailableSemesters(currentDegree),
      ]);
      semester = latest || "20261";
      availableSemesters = semesters;
    }

    const schedule = await getCachedSchedule(currentDegree, semester);

    if (!schedule || schedule.length === 0) {
      return NextResponse.json(
        { error: `No schedule found for degree ${currentDegree} in semester ${semester}` },
        { status: 404 },
      );
    }

    const response = {
      fetchedSemester: semester,
      availableSemesters: availableSemesters.length > 0 ? availableSemesters : [semester],
      [currentDegree]: schedule,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
