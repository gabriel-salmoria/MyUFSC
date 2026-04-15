import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";
import { generatePseudonym } from "@/lib/professors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing professor ID" },
        { status: 400 },
      );
    }
    const decodedId = decodeURIComponent(id);
    // Normalize to match what update-professors.ts stored (UPPERCASE, no accents)
    const normalizedId = decodedId
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();

    // 1. Get aggregate stats per course taught by the professor
    const aggregateQuery = `
      SELECT
        "courseId",
        COUNT(id) as "totalReviews",
        AVG((scores->>'overall')::numeric) as overall,
        AVG((scores->>'difficulty')::numeric) as difficulty,
        AVG((scores->>'didactics')::numeric) as didactics
      FROM reviews
      WHERE "professorId" = $1 AND "parentId" IS NULL
      GROUP BY "courseId"
    `;

    // Also get the list of all courses taught by the professor just in case there are no reviews yet
    const coursesQuery = `
      SELECT "courseId"
      FROM professor_courses
      WHERE "professorId" = $1
    `;

    // 2. Get top-level reviews (we can paginate later)
    const reviewsQuery = `
      SELECT
        id, "courseId", "authorHash", text, scores, "createdAt"
      FROM reviews
      WHERE "professorId" = $1 AND "parentId" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 20
    `;

    const [aggResult, coursesResult, reviewsResult] = await Promise.all([
      executeQuery(aggregateQuery, [normalizedId]),
      executeQuery(coursesQuery, [normalizedId]),
      executeQuery(reviewsQuery, [normalizedId]),
    ]);

    const statsPerCourse: Record<string, any> = {};
    for (const row of coursesResult.rows) {
      statsPerCourse[row.courseId] = {
        totalReviews: 0,
        overall: null,
        difficulty: null,
        didactics: null,
      };
    }
    for (const row of aggResult.rows) {
      statsPerCourse[row.courseId] = {
        totalReviews: parseInt(row.totalReviews, 10),
        overall: row.overall ? parseFloat(row.overall) : null,
        difficulty: row.difficulty ? parseFloat(row.difficulty) : null,
        didactics: row.didactics ? parseFloat(row.didactics) : null,
      };
    }

    const reviews = reviewsResult.rows.map((r: any) => ({
      id: r.id,
      courseId: r.courseId,
      authorHash: r.authorHash,
      pseudonym: "Autor da Avaliação",
      text: r.text,
      scores: r.scores,
      createdAt: r.createdAt,
    }));

    // 3. For the fetched reviews, get their replies
    let replies: any[] = [];
    if (reviews.length > 0) {
      const reviewIds = reviews.map((r: any) => r.id);
      const repliesQuery = `
        SELECT
          id, "parentId", "authorHash", text, "createdAt"
        FROM reviews
        WHERE "parentId" = ANY($1)
        ORDER BY "createdAt" ASC
      `;
      const repliesResult = await executeQuery(repliesQuery, [reviewIds]);
      replies = repliesResult.rows.map((r: any) => {
        const parentReview = reviews.find((pr: any) => pr.id === r.parentId);
        const isAuthor =
          parentReview && parentReview.authorHash === r.authorHash;
        return {
          id: r.id,
          parentId: r.parentId,
          authorHash: r.authorHash,
          pseudonym: isAuthor
            ? "Autor da Avaliação"
            : generatePseudonym(r.authorHash, r.parentId),
          text: r.text,
          createdAt: r.createdAt,
        };
      });
    }

    return NextResponse.json({
      statsPerCourse,
      reviews,
      replies,
    });
  } catch (error) {
    console.error("Error fetching professor details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
