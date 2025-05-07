import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { EncryptedUser } from "@/types/user";
import { hashUsername } from "@/crypto/server/crypto";
import { getUserByHashedUsername } from "@/database/users/db-user";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const sessionCookie = cookieStore.get("session")?.value;

    // Check if user is authenticated
    if (!userId || !sessionCookie || sessionCookie !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hashedUsername = hashUsername(userId);

    // Get user from database
    const userData = await getUserByHashedUsername(hashedUsername);
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Return only the auth info needed for encryption
    return NextResponse.json({
      hashedUsername: userData.hashedUsername,
      hashedPassword: userData.hashedPassword,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
