import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getScheduleByProgramAndSemester, getLatestSemester, getAvailableSemesters } from "@/database/schedule/db-schedule";

// Server-side route handler
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const url = new URL(request.url);
    const currentDegree = url.searchParams.get("currentDegree");
    let semester = url.searchParams.get("semester");

    if (!currentDegree) {
      return NextResponse.json(
        { error: "Missing degree ID" },
        { status: 400 },
      );
    }

    if (!semester) {
      const latest = await getLatestSemester(currentDegree);
      semester = latest || "20261"; 
    }

    const [schedule, availableSemesters] = await Promise.all([
      getScheduleByProgramAndSemester(currentDegree, semester),
      getAvailableSemesters(currentDegree)
    ]);

    if (!schedule || schedule.length === 0) {
      return NextResponse.json(
        { error: `No schedule found for degree ${currentDegree} in semester ${semester}` },
        { status: 404 },
      );
    }

    const response = {
      DATA: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' -'), 
      fetchedSemester: semester,
      availableSemesters: availableSemesters.length > 0 ? availableSemesters : [semester],
      [currentDegree]: schedule,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching schedule:", error); 
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
