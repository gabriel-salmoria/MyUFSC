import { NextResponse } from "next/server"

export async function POST() {
  try {
    const response = NextResponse.json({ success: true })

    // Clear the session cookie
    response.cookies.delete("session")
    response.cookies.delete("userId")

    return response
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 