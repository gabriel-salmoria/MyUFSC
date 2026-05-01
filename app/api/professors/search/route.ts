import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { executeQuery } from "@/database/ready";

async function runSearch(normalizedQuery: string) {
  const result = await executeQuery(
    `SELECT
       p."professorId" as name,
       COUNT(DISTINCT p."courseId") as "totalCourses",
       COUNT(r.id) as "totalReviews",
       AVG((r.scores->>'overall')::numeric) as overall
     FROM professor_courses p
     LEFT JOIN reviews r ON r."professorId" = p."professorId" AND r."parentId" IS NULL
     WHERE p."professorId" LIKE $1
     GROUP BY p."professorId"
     ORDER BY "totalReviews" DESC, p."professorId" ASC
     LIMIT 20`,
    [normalizedQuery],
  );
  return result.rows.map((row: any) => ({
    name: row.name,
    totalCourses: parseInt(row.totalCourses, 10),
    totalReviews: parseInt(row.totalReviews, 10),
    overall: row.overall ? parseFloat(row.overall) : null,
  }));
}

function getCachedSearch(normalizedQuery: string) {
  return unstable_cache(
    () => runSearch(normalizedQuery),
    [`prof-search-${normalizedQuery}`],
    { revalidate: 60 },
  )();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ professors: [] });
    }

    const normalizedQuery = `%${query.trim().toUpperCase()}%`;
    const professors = await getCachedSearch(normalizedQuery);

    return NextResponse.json({ professors });
  } catch (error) {
    console.error("Error searching professors:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
