import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { getUserByHashedUsername } from "@/database/users/db-user";
import { getCurriculumByProgramId } from "@/database/curriculum/db-curriculum";
import { getScheduleByProgramAndSemester, getLatestSemester } from "@/database/schedule/db-schedule";

// Mirror the same cache keys used by the dedicated curriculum/schedule routes so
// prefetch calls share their cache rather than hitting the DB independently.
function getCachedCurriculum(programId: string) {
  return unstable_cache(
    () => getCurriculumByProgramId(programId),
    [`curriculum-${programId}`],
    { revalidate: 86400 },
  )();
}

function getCachedLatestSemester(programId: string) {
  return unstable_cache(
    () => getLatestSemester(programId),
    [`schedule-latest-${programId}`],
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

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params;

    // Get user from database
    const userData = await getUserByHashedUsername(studentId);

    if (!userData) {
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 },
      );
    }

    // Prefetching Logic
    const cookieStore = await cookies();
    const prefetchCookie = cookieStore.get("ufsc_prefetch_degrees");
    const prefetchedData: any = {};

    if (prefetchCookie?.value) {
      try {
        const degreesToFetch = prefetchCookie.value.split(",");

        // Fetch curriculums — uses the same unstable_cache as /api/curriculum/[programId]
        const curriculums = await Promise.all(
          degreesToFetch.map((id) => getCachedCurriculum(id).catch(() => null))
        );

        // Fetch schedules — uses the same unstable_cache as /api/schedule
        const schedules = await Promise.all(
          degreesToFetch.map(async (id) => {
            try {
              const latest = await getCachedLatestSemester(id);
              if (!latest) return null;
              return await getCachedSchedule(id, latest);
            } catch {
              return null;
            }
          })
        );

        // Map results back to IDs
        prefetchedData.curriculums = {};
        prefetchedData.schedules = {};

        degreesToFetch.forEach((id, index) => {
          if (curriculums[index]) {
            prefetchedData.curriculums[id] = curriculums[index];
          }
          // For schedule, we structure it as the client expects: keyed by degree ID
          // The client expects { [degreeId]: scheduleData }
          if (schedules[index]) {
            prefetchedData.schedules[id] = schedules[index];
          }
        });

      } catch (prefetchError) {
        console.error("Prefetch error:", prefetchError);
        // We continue without prefetching if it fails
      }
    }

    // Return the encrypted data structure expected by the client
    // PLUS the prefetched data
    return NextResponse.json({
      ...userData,
      prefetched: Object.keys(prefetchedData).length > 0 ? prefetchedData : undefined
    });

  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}


