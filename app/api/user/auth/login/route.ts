import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { hashUsername } from "@/crypto/server/crypto";
import type { EncryptedUser } from "@/types/user";
import { getUserByHashedUsername } from "@/database/users/db-user";

// Helper function to hash username - deprecated, use the bcrypt version instead
// function hashUsername(username: string): string {
//   return createHash('sha256').update(username).digest('hex')
// }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hUsername, hPassword } = body;

    if (!hUsername || !hPassword) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hashedUsername = hashUsername(hUsername);

    // Get user from database
    const userData = await getUserByHashedUsername(hashedUsername);
    console.log("[login] user found:", !!userData);

    if (!userData) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    if (
      !userData.hashedPassword ||
      !(await bcrypt.compare(hPassword, userData.hashedPassword))
    ) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Set user ID cookie - using hashed username not plaintext
    const response = NextResponse.json({
      success: true,
      hashedUsername: userData.hashedUsername,
      hashedPassword: userData.hashedPassword,
      iv: userData.iv,
      encryptedData: userData.encryptedData,
    });

    const isProd = process.env.NODE_ENV === "production";
    const secureFlag = isProd ? "Secure;" : "";

    response.headers.append("Set-Cookie", `session=authenticated; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; ${secureFlag}`);
    response.headers.append("Set-Cookie", `userId=${userData.hashedUsername}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; ${secureFlag}`);

    return response;
  } catch (error) {
    console.error("[login] error:", error);
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      { error: isDev ? String(error) : "Internal server error" },
      { status: 500 },
    );
  }
}
