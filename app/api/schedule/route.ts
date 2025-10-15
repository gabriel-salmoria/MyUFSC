import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getScheduleByProgramAndSemester } from "@/database/schedule/db-schedule"; // Import the new DB function
// import path from "path"; // No longer needed
// import fs from "fs"; // No longer needed

// Server-side route handler
export async function GET(request: Request) {
  try {
    const cookieStore = cookies(); // Await is not needed here according to Next.js docs for cookies()
    const userId = cookieStore.get("userId")?.value;
    // Accept currentDegree as a query parameter
    const url = new URL(request.url);
    const currentDegree = url.searchParams.get("currentDegree");
    const semester = url.searchParams.get("semester") || "20261"; // Default to 20251 if not provided

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    if (!currentDegree) {
      return NextResponse.json(
        { error: "Missing degree ID" }, // Changed from programId to degree ID for clarity with endpoint usage
        { status: 400 },
      );
    }

    // Fetch schedule from the database
    const schedule = await getScheduleByProgramAndSemester(
      currentDegree,
      semester,
    );

    if (!schedule || schedule.length === 0) {
      return NextResponse.json(
        { error: `No schedule found for degree ${currentDegree} in semester ${semester}` }, // Added semester to error message
        { status: 404 },
      );
    }

    // Structure the response properly with the degree code as the key, similar to the original JSON structure
    const response = {
      DATA: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' -'), // Match original DATA format
      [currentDegree]: schedule,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching schedule:", error); // Log the actual error on the server
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Client-side function to fetch class schedule (updated to potentially include semester parameter)
// export async function fetchClassSchedule(currentDegree: string, semester: string = '20251'): Promise<Record<string, any> | null> {
//   try {
//     const response = await fetch(`/api/schedule?currentDegree=${encodeURIComponent(currentDegree)}&semester=${encodeURIComponent(semester)})`) // Added semester parameter

//     if (!response.ok) {
//       const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
//       return null
//     }

//     const data = await response.json() as Record<string, any>

//     return data
//   } catch (error) {
//     return null
//   }
// }
