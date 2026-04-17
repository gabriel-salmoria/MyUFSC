import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { executeQuery } from "@/database/ready";

async function computeAggregates(courseIds: string[]) {
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

  return aggregates;
}

export async function POST(request: Request) {
  try {
    const { courseIds } = await request.json();

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ aggregates: {} });
    }

    // Sort so the same set of courses always hits the same cache entry regardless of request order
    const sortedIds = [...courseIds].sort();

    const getCached = unstable_cache(
      () => computeAggregates(sortedIds),
      [`prof-aggregates-${sortedIds.join(",")}`],
      { revalidate: 300 },
    );

    const aggregates = await getCached();

    return NextResponse.json({ aggregates }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("Error fetching professor aggregates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
