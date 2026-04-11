import { executeQuery } from "@/database/ready";
import { NextResponse } from "next/server";

// Cache this endpoint for 1 hour to prevent abuse while allowing fresh data periodically
export const revalidate = 3600;

export async function GET() {
  try {
    const [programsRes, curriculumsRes, schedulesRes] = await Promise.all([
      executeQuery("SELECT * FROM programs"),
      executeQuery("SELECT * FROM curriculums"),
      executeQuery("SELECT * FROM schedules"),
    ]);

    return NextResponse.json({
      programs: programsRes.rows,
      curriculums: curriculumsRes.rows,
      schedules: schedulesRes.rows,
    });
  } catch (error) {
    console.error("[seed API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load public seed data" },
      { status: 500 },
    );
  }
}
