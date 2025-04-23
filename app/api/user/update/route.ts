import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import type { EncryptedUser } from "@/types/user";
import { hashUsername } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const sessionCookie = cookieStore.get("session")?.value;

    // Check if user is authenticated
    if (!userId || !sessionCookie || sessionCookie !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { iv, encryptedData } = body;

    if (!iv || !encryptedData) {
      return NextResponse.json(
        { error: "Invalid data format" },
        { status: 400 },
      );
    }

    // Get user file path - userId is already the hashed username
    const userFile = path.join(
      process.cwd(),
      "data",
      "users",
      `${hashUsername(userId)}.json`,
    );
    if (!fs.existsSync(userFile)) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Read existing user data
    const userData: EncryptedUser = JSON.parse(
      fs.readFileSync(userFile, "utf8"),
    );
    let newData = { ...userData };

    newData.iv = iv;
    newData.encryptedData = encryptedData;

    // Save updated user data
    fs.writeFileSync(userFile, JSON.stringify(newData, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
