import { PDFParse } from "pdf-parse";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedCourse {
  code: string;
  type: "mandatory" | "optional"; // Ob -> mandatory, Op -> optional
  grade?: number;       // 0.0-10.0 (only for completed)
  semester?: string;    // e.g. "2023/1"
}

export interface TranscriptData {
  studentName?: string;
  courseCode?: string;       // degree program code (e.g. "208")
  curriculumId?: string;     // curriculum id (e.g. "20071")
  completed: ParsedCourse[]; // cursadas
  inProgress: ParsedCourse[]; // andamento
  exempted: ParsedCourse[];   // dispensadas / equivalencias
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

  // Student name — "Aluno: Name" or "Nome: Name"
  const nameMatch =
    text.match(/Nome(?:\s+do\s+Aluno)?:\s*(.+)/i) ??
    text.match(/Aluno:\s*(.+)/i);
  if (nameMatch) {
    const rawName = nameMatch[1].trim();
    const cleaned = rawName.split(/\s{2,}/)[0].replace(/\s*Matr[ií]cula.*$/i, "").trim();
    if (cleaned.length > 0) {
      meta.studentName = cleaned;
    }
  }

  // Course code — may be on same line as "Curso:" or on a nearby line.
  // Try inline first ("Curso: 208"), then look for a standalone 3-digit
  // number in the first 600 chars of the header.
  const courseInline = text.match(/Curso:\s*(\d{3})/);
  if (courseInline) {
    meta.courseCode = courseInline[1];
  } else {
    const header = text.slice(0, 600);
    if (/Curso:/i.test(header)) {
      const standalone = header.match(/\n(\d{3})\n/);
      if (standalone) {
        meta.courseCode = standalone[1];
      }
    }
  }

  // Curriculum id — may be inline ("Curriculo: 2007/1") or on nearby line.
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

  // Detect format: "Historico Sintese" has "Semestre YYYY/N" headers;
  // "Controle Curricular" has course codes BEFORE Ob/Op.
  const isSintese = /Semestre\s+\d{4}\/\d/i.test(text);

  if (isSintese) {
    extractSinteseFormat(text, completed, inProgress, exempted, seen);
  } else {
    extractControleCurricularFormat(text, completed, inProgress, exempted, seen);
  }

  return { completed, inProgress, exempted };
}

/**
 * "Historico Sintese" format — courses appear as:
 *   <Name> <H/A>\t<Grade> <FreqStatus> <Type>\t<Code>
 * grouped under "Semestre YYYY/N" headers.
 */
function extractSinteseFormat(
  text: string,
  completed: ParsedCourse[],
  inProgress: ParsedCourse[],
  exempted: ParsedCourse[],
  seen: Set<string>,
) {
  // Match: <grade> <freq> <type> <code>
  // e.g. "9.5 FS Ob\tEEL5105" or "10.0 FS Ob INE5401"
  const coursePattern = /(\d+\.\d)\s+(FS|FI)\s+(Ob|Op)\s+([A-Z]{2,4}\d{4})/g;
  const semesterPattern = /Semestre\s+(\d{4}\/\d)/gi;

  // Build a map of positions -> semester
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
  while ((match = coursePattern.exec(text)) !== null) {
    const grade = parseFloat(match[1]);
    const freq = match[2];
    const tipo = match[3];
    const code = match[4];

    if (seen.has(code)) continue;
    seen.add(code);

    const type = parseType(tipo);
    const semester = getSemester(match.index);

    // FI = failed (frequencia insuficiente)
    if (freq === "FI") continue;

    if (grade >= 6.0) {
      completed.push({ code, type, grade, semester });
    } else {
      // grade < 6 means failed even with FS
      continue;
    }
  }

  // Also look for "Cursando" entries (in-progress courses)
  const cursandoPattern = /Cursando\s+(Ob|Op)\s+([A-Z]{2,4}\d{4})/g;
  while ((match = cursandoPattern.exec(text)) !== null) {
    const code = match[2];
    if (seen.has(code)) continue;
    seen.add(code);
    inProgress.push({ code, type: parseType(match[1]) });
  }

  // Look for equivalence / exemption entries
  const eqvPattern = /(?:Eqv|Equival[eê]ncia|Dispensad[ao])\s+(Ob|Op)\s+([A-Z]{2,4}\d{4})/gi;
  while ((match = eqvPattern.exec(text)) !== null) {
    const code = match[2];
    if (seen.has(code)) continue;
    seen.add(code);
    exempted.push({ code, type: parseType(match[1]) });
  }
}

/**
 * "Controle Curricular" format — courses appear as:
 *   <Code> <Name…> <semester> <grade> <Ob|Op>
 * This is the format used by CAGR's "Controle Curricular" PDF.
 */
function extractControleCurricularFormat(
  text: string,
  completed: ParsedCourse[],
  inProgress: ParsedCourse[],
  exempted: ParsedCourse[],
  seen: Set<string>,
) {
  // group 1 = full block, group 2 = code, group 3 = Ob|Op
  const coursePattern = /(([A-Z]{2,4}\d{4}).*?(Ob|Op)\b)/g;
  const gradePattern = /(\d{4}\/\d)\s+(\d+\.\d)/;

  let match: RegExpExecArray | null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    coursePattern.lastIndex = 0;
    while ((match = coursePattern.exec(trimmed)) !== null) {
      const block = match[1];
      const code = match[2];
      const tipo = match[3];
      if (seen.has(code)) continue;
      seen.add(code);

      const type = parseType(tipo);

      if (/Cursando/i.test(block)) {
        inProgress.push({ code, type });
      } else if (/Cursou\s+Eqv|Equival[eê]ncia/i.test(block)) {
        exempted.push({ code, type });
      } else if (/N[aã]o\s+Cursou|Reprovado/i.test(block)) {
        continue;
      } else {
        const gradeMatch = gradePattern.exec(block);
        if (gradeMatch) {
          completed.push({
            code,
            type,
            semester: gradeMatch[1],
            grade: parseFloat(gradeMatch[2]),
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a UFSC student transcript PDF and return structured data.
 */
export async function parseTranscriptPdf(
  pdfBuffer: Buffer | Uint8Array,
): Promise<TranscriptData> {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  const result = await parser.getText();
  await parser.destroy();

  const metadata = extractMetadata(result.text);
  const courses = extractCourses(result.text);

  return {
    studentName: metadata.studentName,
    courseCode: metadata.courseCode,
    curriculumId: metadata.curriculumId,
    ...courses,
  };
}
