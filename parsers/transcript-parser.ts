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
  courseCode?: string; // degree program code (e.g. "208")
  courseName?: string; // degree program name (e.g. "CIÊNCIAS DA COMPUTAÇÃO")
  curriculumId?: string; // curriculum id (e.g. "20071")
  completed: ParsedCourse[]; // cursadas
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
 * "Historico Sintese" format
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

  // 1) Primary Pattern: Matches the visual order of "Historico Sintese"
  // e.g. "MTM3131 Equacoes Diferenciais Ordinarias 8.5 72 FS Ob"
  // This is much safer as it anchors from the Course Code and reads forward.
  const linePattern = /([A-Z]{2,4}\d{4}).*?(10\.0|[0-9]\.[0-9]{1,2})\s*(?:\d+\s+)?(FS|FI)\s*(Ob|Op|Ex)/gi;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (seen.has(code)) continue;
    
    const gradeMatch = match[2];
    let grade = parseFloat(gradeMatch);
    if (grade > 10) grade = 10;
    
    const freq = match[3];
    const tipo = match[4];
    seen.add(code);

    const type = parseType(tipo);
    const semester = getSemester(match.index);

    if (freq === "FI") continue;

    if (grade >= 6.0) {
      completed.push({ code, type, grade, semester });
    }
  }

  // 2) Fallback Pattern: Matches pdf-parse anomalies where the order is inverted or concatenated
  // e.g. "8.5 72 FS Ob MTM3131"
  const coursePattern = /(10\.0|[0-9]\.[0-9]{1,2})\s*(?:\d+\s+)?(FS|FI)\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})/g;
  while ((match = coursePattern.exec(text)) !== null) {
    const gradeMatch = match[1];
    let grade = parseFloat(gradeMatch);
    if(grade > 10) grade = 10; // Failsafe
    
    const freq = match[2];
    const tipo = match[3];
    const code = match[4];

    if (seen.has(code)) continue;
    seen.add(code);

    const type = parseType(tipo);
    const semester = getSemester(match.index);

    if (freq === "FI") continue;

    if (grade >= 6.0) {
      completed.push({ code, type, grade, semester });
    }
  }

  const cursandoPattern = /Cursando\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})/g;
  while ((match = cursandoPattern.exec(text)) !== null) {
    const code = match[2];
    if (seen.has(code)) continue;
    seen.add(code);
    const semester = getSemester(match.index);
    inProgress.push({ code, type: parseType(match[1]), semester });
  }

  const eqvPattern =
    /(?:Eqv|Equival[eê]ncia|Dispensad[ao])\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})/gi;
  while ((match = eqvPattern.exec(text)) !== null) {
    const code = match[2];
    if (seen.has(code)) continue;
    seen.add(code);
    const semester = getSemester(match.index);
    exempted.push({ code, type: parseType(match[1]), semester });
  }
}

/**
 * "Controle Curricular" format
 */
function extractControleCurricularFormat(
  text: string,
  completed: ParsedCourse[],
  inProgress: ParsedCourse[],
  exempted: ParsedCourse[],
  seen: Set<string>,
) {
  const coursePattern = /(([A-Z]{2,4}\d{4}).*?(Ob|Op|Ex)\b)/g;
  const gradePattern = /(\d{4}\/\d)\s*(10\.0|[0-9]\.[0-9]{1,2})/;

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
      const semesterMatch = /(\d{4}\/\d)/.exec(block);
      const semester = semesterMatch ? semesterMatch[1] : undefined;

      if (/Cursando/i.test(block)) {
        inProgress.push({ code, type, semester });
      } else if (/Cursou\s+Eqv|Equival[eê]ncia/i.test(block)) {
        exempted.push({ code, type, semester });
      } else if (/N[aã]o\s+Cursou|Reprovado/i.test(block)) {
        continue;
      } else {
        const gradeMatch = gradePattern.exec(block);
        if (gradeMatch) {
          let grade = parseFloat(gradeMatch[2]);
          if(grade > 10) grade = 10;
          completed.push({
            code,
            type,
            semester: gradeMatch[1],
            grade,
          });
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
