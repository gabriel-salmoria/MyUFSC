import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password, name, studentId, currentDegree, interestedDegrees } = body

    // Validate input
    if (!username || !password || !name || !studentId || !currentDegree) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Create users directory if it doesn't exist
    const usersDir = path.join(process.cwd(), "data", "users")
    if (!fs.existsSync(usersDir)) {
      fs.mkdirSync(usersDir, { recursive: true })
    }

    // Check if user already exists
    const userFile = path.join(usersDir, `${username}.json`)
    if (fs.existsSync(userFile)) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 }
      )
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Create new user profile
    const userProfile = {
      id: username,
      hashedPassword,
      name,
      studentId,
      currentDegree,
      interestedDegrees: interestedDegrees || [],
      currentPlan: {
        semesters: [
          {
            number: 1,
            courses: [],
          },
        ],
      },
    }

    // Save user profile
    fs.writeFileSync(userFile, JSON.stringify(userProfile, null, 2))

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set("session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 