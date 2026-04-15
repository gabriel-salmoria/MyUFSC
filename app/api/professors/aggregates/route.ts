import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";

export async function POST(request: Request) {
  try {
    const { courseIds } = await request.json();

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ aggregates: {} });
    }

    const query = `
      SELECT 
        p."professorId",
        COUNT(r.id) as "totalReviews",
        AVG((r.scores->>'overall')::numeric) as overall,
        AVG((r.scores->>'difficulty')::numeric) as difficulty,
        AVG((r.scores->>'didactics')::numeric) as didactics
      FROM professor_courses p
      LEFT JOIN reviews r ON r."professorId" = p."professorId" AND r."parentId" IS NULL
      WHERE p."courseId" = ANY($1)
      GROUP BY p."professorId"
    `;

    const result = await executeQuery(query, [courseIds]);

    const aggregates: Record<string, any> = {};
    for (const row of result.rows) {
      aggregates[row.professorId] = {
        totalReviews: parseInt(row.totalReviews, 10),
        overall: row.overall ? parseFloat(row.overall) : null,
        difficulty: row.difficulty ? parseFloat(row.difficulty) : null,
        didactics: row.didactics ? parseFloat(row.didactics) : null,
      };
    }

    return NextResponse.json({ aggregates });
  } catch (error) {
    console.error("Error fetching professor aggregates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
