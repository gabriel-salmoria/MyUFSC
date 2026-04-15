import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";

export async function POST(request: Request) {
  try {
    const { courseIds } = await request.json();

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ aggregates: {} });
    }

    // General rating per professor (all courses combined)
    const generalQuery = `
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

    // Per-course rating for the requested courses only
    const perCourseQuery = `
      SELECT
        p."professorId",
        p."courseId",
        COUNT(r.id) as "totalReviews",
        AVG((r.scores->>'overall')::numeric) as overall,
        AVG((r.scores->>'difficulty')::numeric) as difficulty,
        AVG((r.scores->>'didactics')::numeric) as didactics
      FROM professor_courses p
      LEFT JOIN reviews r
        ON r."professorId" = p."professorId"
        AND r."courseId" = p."courseId"
        AND r."parentId" IS NULL
      WHERE p."courseId" = ANY($1)
      GROUP BY p."professorId", p."courseId"
    `;

    const [generalResult, perCourseResult] = await Promise.all([
      executeQuery(generalQuery, [courseIds]),
      executeQuery(perCourseQuery, [courseIds]),
    ]);

    const aggregates: Record<string, any> = {};

    for (const row of generalResult.rows) {
      aggregates[row.professorId] = {
        totalReviews: parseInt(row.totalReviews, 10),
        overall: row.overall ? parseFloat(row.overall) : null,
        difficulty: row.difficulty ? parseFloat(row.difficulty) : null,
        didactics: row.didactics ? parseFloat(row.didactics) : null,
        byCourse: {},
      };
    }

    for (const row of perCourseResult.rows) {
      if (!aggregates[row.professorId]) continue;
      const count = parseInt(row.totalReviews, 10);
      if (count === 0) continue;
      aggregates[row.professorId].byCourse[row.courseId] = {
        totalReviews: count,
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
