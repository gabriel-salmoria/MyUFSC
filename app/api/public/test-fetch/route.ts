import { NextResponse } from "next/server";

export async function GET() {
  console.log("Test route running");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    console.log("Fetching seed...");
    const res = await fetch("https://myufsc.vercel.app/api/public/seed", {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      console.log(`Success! Fetched ${data.programs?.length} programs, ${data.curriculums?.length} curriculums.`);
      return NextResponse.json({ success: true, programsCount: data.programs?.length });
    } else {
      console.warn(`Failed: ${res.status}`);
      return NextResponse.json({ error: "Failed fetch" }, { status: 500 });
    }
  } catch (err: any) {
    console.error("Error fetching:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
