import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get("session")

    console.log("Auth Check - Cookies:", {
      session: session?.value,
      userId: cookieStore.get("userId")?.value,
      all: cookieStore.getAll().map(c => c.name)
    });

    if (session?.value === "authenticated") {
      const userId = cookieStore.get("userId")?.value
      return NextResponse.json({
        authenticated: true,
        userId: userId || null
      })
    }

    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 