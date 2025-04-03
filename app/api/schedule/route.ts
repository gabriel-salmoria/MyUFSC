import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import path from "path"
import fs from "fs"

// Server-side route handler
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("userId")?.value
    // Accept currentDegree as a query parameter
    const url = new URL(request.url)
    const currentDegree = url.searchParams.get('currentDegree')

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      )
    }

    if (!currentDegree) {
      return NextResponse.json(
        { error: "No degree specified" },
        { status: 400 }
      )
    }

    // Just load the schedule for the specified degree
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
    const response = await fetch('/api/schedule')
    if (!response.ok) {
      return null
    }
    return response.json()
  } catch (error) {
    return null
  }
} 