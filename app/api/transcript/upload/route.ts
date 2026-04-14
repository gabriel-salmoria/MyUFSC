import { NextRequest, NextResponse } from "next/server";
import { parseTranscriptPdf } from "@/parsers/transcript-parser";
import { executeQuery } from "@/database/ready";
import {
  getCurriculumByProgramId,
  resolveCurriculumId,
} from "@/database/curriculum/db-curriculum";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 },
      );
    }

    const fileName = file.name?.toLowerCase() ?? "";
    if (!fileName.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Apenas arquivos PDF são aceitos" },
        { status: 400 },
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const data = await parseTranscriptPdf(buffer);

    // Map all found course codes to find interested degrees
    const courseCodes = new Set<string>();
    data.completed.forEach((c) => courseCodes.add(c.code));
    data.inProgress.forEach((c) => courseCodes.add(c.code));
    data.exempted.forEach((c) => courseCodes.add(c.code));

    // Filter out courses that are already part of the main curriculum
    if (data.courseCode) {
      const programId = data.curriculumId
        ? `${data.courseCode}_${data.curriculumId}`
        : data.courseCode;
      const curriculum = await getCurriculumByProgramId(programId);
      if (curriculum && curriculum.courses) {
        const mainCourses = new Set(curriculum.courses.map((c: any) => c[0]));
        for (const code of Array.from(courseCodes)) {
          if (mainCourses.has(code)) {
            courseCodes.delete(code);
          }
        }
      }
    }

    if (courseCodes.size > 0) {
      const query = `
        SELECT
          course->>0 as course_id,
          MIN(split_part("programId", '_', 1)) as base_program,
          (array_agg(course->>1))[1] as name,
          (array_agg(course->>2))[1] as credits,
          (array_agg(course->>3))[1] as workload,
          (array_agg(course->>4))[1] as description,
          (array_agg(course->>8))[1] as phase
        FROM curriculums, jsonb_array_elements("curriculumJson"->'courses') as course
        WHERE course->>0 = ANY($1::text[])
        GROUP BY course_id
      `;
      const dbRes = await executeQuery(query, [Array.from(courseCodes)]);
      const foundDegrees = Array.from(
        new Set(dbRes.rows.map((r: any) => r.base_program)),
      );
      const filteredDegrees = foundDegrees.filter(
        (d: string) => d !== data.courseCode,
      );
      const resolvedDegrees = await Promise.all(
        filteredDegrees.map(async (d: string) => {
          const resolved = await resolveCurriculumId(d);
          return resolved || d;
        }),
      );
      data.interestedDegrees = resolvedDegrees;

      data.missingCourseInfo = {};
      for (const row of dbRes.rows) {
        if (row.course_id && row.name) {
          data.missingCourseInfo[row.course_id] = {
            name: row.name,
            credits: parseInt(row.credits || "0", 10),
            workload: parseInt(row.workload || "0", 10),
            description: row.description || undefined,
            phase: row.phase && row.phase !== "null" ? parseInt(row.phase, 10) : undefined,
          };
        }
      }
    } else {
      data.interestedDegrees = [];
      data.missingCourseInfo = {};
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao processar PDF do histórico:", message);
    return NextResponse.json(
      { error: `Falha ao processar o PDF: ${message}` },
      { status: 500 },
    );
  }
}
