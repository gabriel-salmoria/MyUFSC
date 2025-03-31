import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import path from "path"
import fs from "fs"

// Server-side route handler
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("userId")?.value

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      )
    }

    const userPath = path.join(process.cwd(), "data", "users", `${userId}.json`);

    // Get student profile to get their degrees
    let studentProfile;
    try {
      studentProfile = await import(`@/data/users/${userId}.json`)
    } catch (error: any) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    const { currentDegree, interestedDegrees } = studentProfile.default

    if (!currentDegree) {
      return NextResponse.json(
        { error: "No current degree found" },
        { status: 400 }
      )
    }

    // We only need to load data for the current degree

    // Just load the schedule for the current degree
    try {
      const schedulePath = path.join(process.cwd(), "data", "courses", `${currentDegree}-20251.json`);
      
      if (!fs.existsSync(schedulePath)) {
        throw new Error(`Schedule file does not exist at ${schedulePath}`);
      }
      
      // Read the file directly and parse it
      const scheduleData = fs.readFileSync(schedulePath, 'utf8');
      const schedule = JSON.parse(scheduleData);
      
      // Structure the response properly with the degree code as the key
      const response = {
        [currentDegree]: schedule
      };
      
      return NextResponse.json(response);
    } catch (error: any) {
      return NextResponse.json(
        { error: `No schedule found for degree ${currentDegree}` },
        { status: 404 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Client-side function to fetch class schedule
export async function fetchClassSchedule(): Promise<any | null> {
  try {
    const response = await fetch('/api/class/schedule')
    if (!response.ok) {
      return null
    }
    return response.json()
  } catch (error) {
    return null
  }
} 