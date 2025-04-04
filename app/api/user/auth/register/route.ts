import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"
import { generateSalt, deriveEncryptionKey, encryptData, hashUsernameWithBcrypt } from "@/lib/crypto"
import type { StudentInfo } from "@/types/student-plan"
import crypto from "crypto"

// Helper function to hash username - deprecated, use the bcrypt version instead
// function hashUsername(username: string): string {
//   return createHash('sha256').update(username).digest('hex')
// }

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password, name, currentDegree, interestedDegrees } = body

    // Validate input
    if (!username || !password || !currentDegree) {
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

    // Hash the username using bcrypt - this will be our file identifier
    const hashedUsername = hashUsernameWithBcrypt(username)

    // Check if user already exists using the hashed username file
    const userFile = path.join(usersDir, `${hashedUsername}.json`)
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
      name: name || "Student", // Default to "Student" if name is not provided
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

    // Create user profile with encrypted data - NO plaintext username
    const userProfile = {
      hashedPassword,
      hashedUsername,
      salt: encryptionSalt,
      encryptedData: {
        iv: encrypted.iv,
        encryptedData: encrypted.encryptedData
      }
    }

    // Save user profile using the hashed username as filename
    fs.writeFileSync(userFile, JSON.stringify(userProfile, null, 2))

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set("session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    // Set hashed user ID cookie - no plaintext username in cookies
    cookieStore.set("userId", hashedUsername, {
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