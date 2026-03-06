import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { hashUsername } from "@/crypto/server/crypto";
import { getUserByHashedUsername, createUser } from "@/database/users/db-user";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, iv, encryptedData } = body;

    // Validate input
    if (!username || !password || !encryptedData || !iv) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Hash the username
    const hashedUsername = hashUsername(username);

    // Check if user already exists
    const existingUser = await getUserByHashedUsername(hashedUsername);
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 },
      );
    }

    // Hash the password for authentication
    const passwordSalt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, passwordSalt);

    // Create user in the database
    await createUser({
      hashedUsername,
      hashedPassword,
      iv,
      encryptedData,
    });

    const response = NextResponse.json({ success: true, hashedUsername });

    const isProd = process.env.NODE_ENV === "production";
    const secureFlag = isProd ? "Secure;" : "";

    response.headers.append("Set-Cookie", `session=authenticated; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; ${secureFlag}`);
    response.headers.append("Set-Cookie", `userId=${hashedUsername}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; ${secureFlag}`);

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
