import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"
import { generateSalt, deriveEncryptionKey, encryptData } from "@/lib/crypto"
import type { StudentInfo } from "@/types/student-plan"

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

    // Hash the password for authentication
    const passwordSalt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, passwordSalt)

    // Generate encryption salt and key
    const encryptionSalt = generateSalt()
    const encryptionKey = deriveEncryptionKey(password, encryptionSalt)

    // Create student info object (the sensitive data to encrypt)
    const studentInfo: StudentInfo = {
      id: username,
      name,
      studentId,
      currentDegree,
      interestedDegrees: interestedDegrees || [],
      currentSemester: "1",
      plans: [],
      currentPlan: {
        id: "default-plan",
        semesters: [
          {
            number: 1,
            courses: [],
            totalCredits: 0
          },
        ],
      },
    }

    // Encrypt the student data
    const encrypted = encryptData(studentInfo, encryptionKey)

    // Create user profile with encrypted data
    const userProfile = {
      username,
      hashedPassword,
      salt: encryptionSalt,
      encryptedData: {
        iv: encrypted.iv,
        encryptedData: encrypted.encryptedData
      }
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

    // Set user ID cookie
    cookieStore.set("userId", username, {
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 