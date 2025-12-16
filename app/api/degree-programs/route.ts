import { NextResponse } from "next/server";
import { getAllPrograms } from "@/database/programs/db-programs";

export async function GET() {
  try {
    const programs = await getAllPrograms();

    return NextResponse.json({ programs });
  } catch (error) {
    console.error("Failed to load degree programs:", error);
    return NextResponse.json(
      { error: "Failed to load degree programs" },
      { status: 500 },
    );
  }
} 