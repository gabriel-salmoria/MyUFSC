import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ professors: [] });
    }

    // Normalizing the search query since professorIds are generally uppercase
    const normalizedQuery = `%${query.trim().toUpperCase()}%`;

    const sqlQuery = `
      SELECT
        p."professorId" as name,
        COUNT(DISTINCT p."courseId") as "totalCourses",
        COUNT(r.id) as "totalReviews",
        AVG((r.scores->>'overall')::numeric) as overall
      FROM professor_courses p
      LEFT JOIN reviews r ON r."professorId" = p."professorId" AND r."parentId" IS NULL
      WHERE p."professorId" ILIKE $1
      GROUP BY p."professorId"
      ORDER BY "totalReviews" DESC, p."professorId" ASC
      LIMIT 20
    `;

    const result = await executeQuery(sqlQuery, [normalizedQuery]);

    const professors = result.rows.map((row: any) => ({
      name: row.name,
      totalCourses: parseInt(row.totalCourses, 10),
      totalReviews: parseInt(row.totalReviews, 10),
      overall: row.overall ? parseFloat(row.overall) : null,
    }));

    return NextResponse.json({ professors });
  } catch (error) {
    console.error("Error searching professors:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
