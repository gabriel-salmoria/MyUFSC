import { NextResponse } from "next/server"
import path from "path"
import fs from "fs"

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "degree-programs.json")
    const fileContents = fs.readFileSync(filePath, "utf8")
    const data = JSON.parse(fileContents)

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load degree programs" },
      { status: 500 }
    )
  }
} 