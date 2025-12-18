import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByHashedUsername } from "@/database/users/db-user";
import { getCurriculumByProgramId } from "@/database/curriculum/db-curriculum";
import { getScheduleByProgramAndSemester, getLatestSemester } from "@/database/schedule/db-schedule";

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

        // Fetch curriculums
        const curriculums = await Promise.all(
          degreesToFetch.map(async (id) => {
            try {
              return await getCurriculumByProgramId(id);
            } catch (e) {
              return null;
            }
          })
        );

        // Fetch schedules (latest semester)
        // We don't have the semester from the cookie, so we default to latest
        const schedules = await Promise.all(
          degreesToFetch.map(async (id) => {
            try {
              const latest = await getLatestSemester(id);
              if (!latest) return null;
              return await getScheduleByProgramAndSemester(id, latest);
            } catch (e) {
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


