// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedCourse {
  code: string;
  type: "mandatory" | "optional"; // Ob -> mandatory, Op -> optional
  grade?: number; // 0.0-10.0 (only for completed)
  semester?: string; // e.g. "2023/1"
}

export interface TranscriptData {
  studentName?: string;
  courseCode?: string;
  courseName?: string; // degree program code (e.g. "208")
  curriculumId?: string; // curriculum id (e.g. "20071")
  interestedDegrees?: string[]; // additional degrees mapped from taken courses
  missingCourseInfo?: Record<
    string,
    {
      name: string;
      credits: number;
      workload?: number;
      description?: string;
      phase?: number;
    }
  >;

  completed: ParsedCourse[];
  inProgress: ParsedCourse[]; // andamento
  exempted: ParsedCourse[]; // dispensadas / equivalencias
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseType(raw: string): "mandatory" | "optional" {
  return raw === "Ob" ? "mandatory" : "optional";
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

function extractMetadata(text: string): Partial<TranscriptData> {
  const meta: Partial<TranscriptData> = {};

  // Student name
  const nameMatch =
    text.match(/Nome(?:\s+do\s+Aluno)?:\s*(.+)/i) ??
    text.match(/Aluno:\s*(.+)/i);
  if (nameMatch) {
    const rawName = nameMatch[1].trim();
    const cleaned = rawName
      .split(/\s{2,}/)[0]
      .replace(/\s*Matr[ií]cula.*$/i, "")
      .trim();
    if (cleaned.length > 0) {
      meta.studentName = cleaned;
    }
  }

  // Course code
  const courseInline = text.match(/Curso:\s*(\d{3})(?:\s+(.+))?/);
  if (courseInline) {
    meta.courseCode = courseInline[1];
    if (courseInline[2]) {
      meta.courseName = courseInline[2].trim();
    }
  } else {
    const header = text.slice(0, 600);
    if (/Curso:/i.test(header)) {
      const standalone = header.match(/\n(\d{3})\n/);
      if (standalone) {
        meta.courseCode = standalone[1];
      }
    }
  }

  // Curriculum id
  const currInline = text.match(/Curr[ií]culo:\s*(\d{4}\/\d)/i);
  if (currInline) {
    meta.curriculumId = currInline[1].replace("/", "");
  } else {
    const header = text.slice(0, 600);
    if (/Curr[ií]culo:/i.test(header)) {
      const standalone = header.match(/\n(\d{4}\/\d)\n/);
      if (standalone) {
        meta.curriculumId = standalone[1].replace("/", "");
      }
    }
  }

  return meta;
}

function extractCourses(text: string): {
  completed: ParsedCourse[];
  inProgress: ParsedCourse[];
  exempted: ParsedCourse[];
} {
  const completed: ParsedCourse[] = [];
  const inProgress: ParsedCourse[] = [];
  const exempted: ParsedCourse[] = [];
  const seen = new Set<string>();

  const isSintese = /Semestre\s+\d{4}\/\d/i.test(text);

  if (isSintese) {
    extractSinteseFormat(text, completed, inProgress, exempted, seen);
  } else {
    extractControleCurricularFormat(
      text,
      completed,
      inProgress,
      exempted,
      seen,
    );
  }

  return { completed, inProgress, exempted };
}

/**
 * "Historico Sintese" format.
 *
 * Two layouts exist depending on the UFSC CAGR version:
 *
 *   Code-first  (older): "INE5404 Prog. OO II  8.5 72 FS Ob"
 *   Grade-first (newer): "Prog. OO II 72 8.5FSObINE5404"   (all concatenated, no spaces)
 *
 * The primary pattern handles code-first; the fallback handles grade-first.
 * The `\b` word-boundary guard in the primary pattern prevents the code group
 * from matching inside concatenated sequences like "ObINE5404" (which would
 * produce false prefixed codes such as "bINE5404" when the i-flag is active).
 */
function extractSinteseFormat(
  text: string,
  completed: ParsedCourse[],
  inProgress: ParsedCourse[],
  exempted: ParsedCourse[],
  seen: Set<string>,
) {
  const semesterPattern = /Semestre\s*(\d{4}\/\d)/gi;
  const semesterPositions: { pos: number; semester: string }[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = semesterPattern.exec(text)) !== null) {
    semesterPositions.push({ pos: sm.index, semester: sm[1] });
  }

  const getSemester = (pos: number): string | undefined => {
    let current: string | undefined;
    for (const sp of semesterPositions) {
      if (sp.pos <= pos) current = sp.semester;
      else break;
    }
    return current;
  };

  let match: RegExpExecArray | null;

  // 1) Primary: CODE … GRADE … FS|FI … Ob|Op|Ex  (code-first layout)
  // \b before and after the code prevents the pattern from matching a code
  // that is part of a longer token (e.g., "ObINE5404" produces no false "bINE5404"
  // because there is no word-boundary before the b).
  // Restricting to {2,3} letters covers all real UFSC dept codes.
  // [^\n]*? keeps the match within a single line.
  const primaryPattern =
    /\b([A-Z]{2,3}\d{4})\b[^\n]*?(10\.0|[0-9]\.[0-9]{1,2})\s*(?:\d+\s+)?(FS|FI)\s*(Ob|Op|Ex)/g;
  while ((match = primaryPattern.exec(text)) !== null) {
    const code = match[1];
    if (seen.has(code)) continue;
    let grade = parseFloat(match[2]);
    if (grade > 10) grade = 10;
    const freq = match[3];
    const tipo = match[4];
    seen.add(code);
    if (freq === "FI") continue;
    if (grade >= 6.0) {
      completed.push({ code, type: parseType(tipo), grade, semester: getSemester(match.index) });
    }
  }

  // 2) Fallback: GRADE … FS|FI … Ob|Op|Ex … CODE  (grade-first / inverted layout)
  // Handles the modern UFSC CAGR format where everything is concatenated:
  // "Nome Horas NotaFSObCODE" → grade is extracted from within the hours+grade token.
  const invertedPattern =
    /(10\.0|[0-9]\.[0-9]{1,2})\s*(?:\d+\s+)?(FS|FI)\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})/g;
  while ((match = invertedPattern.exec(text)) !== null) {
    let grade = parseFloat(match[1]);
    if (grade > 10) grade = 10;
    const freq = match[2];
    const tipo = match[3];
    const code = match[4];
    if (seen.has(code)) continue;
    seen.add(code);
    if (freq === "FI") continue;
    if (grade >= 6.0) {
      completed.push({ code, type: parseType(tipo), grade, semester: getSemester(match.index) });
    }
  }

  // 3a) In-progress — keyword BEFORE code: "Cursando Ob INE5404"
  const cursandoBeforePattern = /Cursando\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})/gi;
  while ((match = cursandoBeforePattern.exec(text)) !== null) {
    const code = match[2].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    inProgress.push({ code, type: parseType(match[1]), semester: getSemester(match.index) });
  }

  // 3b) In-progress — keyword AFTER code: "INE5404 ... Cursando ... Ob"
  // \b guard prevents false matches from within concatenated tokens.
  const cursandoAfterPattern =
    /\b([A-Z]{2,3}\d{4})\b[^\n]*?Cursando[^\n]*?(Ob|Op|Ex)/gi;
  while ((match = cursandoAfterPattern.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    inProgress.push({ code, type: parseType(match[2]), semester: getSemester(match.index) });
  }

  // 4a) Exempted — keyword BEFORE code: "Eqv Ob INE5404" / "Dispensado Ob INE5404"
  const eqvBeforePattern =
    /(?:Eqv|Equival[eê]ncia|Dispensad[ao]|Aprovad[ao]\s+Eqv)\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})/gi;
  while ((match = eqvBeforePattern.exec(text)) !== null) {
    const code = match[2].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    exempted.push({ code, type: parseType(match[1]), semester: getSemester(match.index) });
  }

  // 4b) Exempted — keyword AFTER code: "INE5404 ... Dispensado ... Ob"
  const eqvAfterPattern =
    /\b([A-Z]{2,3}\d{4})\b[^\n]*?(?:Eqv|Equival[eê]ncia|Dispensad[ao]|Aprovad[ao]\s+Eqv)[^\n]*?(Ob|Op|Ex)/gi;
  while ((match = eqvAfterPattern.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    exempted.push({ code, type: parseType(match[2]), semester: getSemester(match.index) });
  }
}

/**
 * "Controle Curricular" format.
 *
 * Groups consecutive lines into per-course blocks: a block starts at a line
 * whose first token is a course code, and accumulates following lines that do
 * not start a new code.  This handles multi-line records that pdf-parse
 * sometimes produces.
 */
function extractControleCurricularFormat(
  text: string,
  completed: ParsedCourse[],
  inProgress: ParsedCourse[],
  exempted: ParsedCourse[],
  seen: Set<string>,
) {
  const codeLineRe = /^([A-Z]{2,4}\d{4})\b/;
  const gradeRe = /(\d{4}\/\d)\s*(10\.0|[0-9]\.[0-9]{1,2})/;
  const typeRe = /\b(Ob|Op|Ex)\b/i;

  // Build per-course blocks by grouping lines.
  const blocks: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (codeLineRe.test(trimmed)) {
      blocks.push(trimmed);
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1] += " " + trimmed;
    }
  }

  for (const block of blocks) {
    const codeMatch = codeLineRe.exec(block);
    if (!codeMatch) continue;
    const code = codeMatch[1].toUpperCase();
    if (seen.has(code)) continue;

    const typeMatch = typeRe.exec(block);
    if (!typeMatch) continue;
    const tipo = typeMatch[1];
    const type = parseType(tipo);

    seen.add(code);

    const semesterMatch = /(\d{4}\/\d)/.exec(block);
    const semester = semesterMatch ? semesterMatch[1] : undefined;

    if (/Cursando/i.test(block)) {
      inProgress.push({ code, type, semester });
    } else if (/Cursou\s+Eqv|Equival[eê]ncia|Dispensad[ao]/i.test(block)) {
      exempted.push({ code, type, semester });
    } else if (/N[aã]o\s+Cursou|Reprovado/i.test(block)) {
      continue;
    } else {
      const gradeMatch = gradeRe.exec(block);
      if (gradeMatch) {
        let grade = parseFloat(gradeMatch[2]);
        if (grade > 10) grade = 10;
        if (grade >= 6.0) {
          completed.push({ code, type, semester: gradeMatch[1], grade });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseTranscriptPdf(
  pdfBuffer: Buffer | Uint8Array,
): Promise<TranscriptData> {
  const pdfParse = require("pdf-parse");
  const result = await pdfParse(Buffer.from(pdfBuffer));

  const metadata = extractMetadata(result.text);
  const courses = extractCourses(result.text);

  return {
    studentName: metadata.studentName,
    courseCode: metadata.courseCode,
    courseName: metadata.courseName,
    curriculumId: metadata.curriculumId,
    ...courses,
  };
}
