/**
 * Deterministic parser for UFSC "Currículo do Curso" PDFs (the CAGR JasperReports
 * export). Used by `scripts/ingest_curriculums.ts`; the Gemini script is the other
 * path.
 *
 * It reads word bounding boxes (`pdftotext -bbox-layout`), not `-layout` text.
 * The report template draws every table column at a fixed x-coordinate (identical
 * across all PDFs in `data/pdfs/`), while `-layout` re-flows the spacing page by
 * page. The old fixed-character-offset approach therefore read prerequisites as
 * equivalents on pages whose columns came out narrower.
 *
 * Font size tells the parts of a course block apart:
 *   - ~7.4pt  table rows: code, name, type, H/A, aulas, equivalents, prerequisites
 *   - ~6.5pt  the ementa (description), printed ABOVE its course row
 *   - ~8.3pt  the repeated page header ("Curso:", "Currículo:", "Habilitação:")
 *   - ≥10pt   section headings ("Fase 01", "3ª Fase", "1º Período", "Optativas"…)
 *
 * Output keeps the compact course shape the DB stores:
 * `[id, name, credits(aulas), workload(H/A), description, prerequisites[],
 *   equivalents[], isMandatory, phase]`.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type CompactCourse = [
  string,
  string,
  number,
  number,
  string,
  string[],
  string[],
  boolean,
  number | null,
];

export interface ParsedCurriculum {
  name: string;
  id: number;
  version: number;
  totalPhases: number;
  department: string;
  courses: CompactCourse[];
}

interface Word {
  x0: number;
  y0: number;
  h: number;
  text: string;
}

type LineKind = "heading" | "pageHeader" | "table" | "desc";

interface Line {
  kind: LineKind;
  y0: number;
  words: Word[];
  text: string;
}

type Column =
  | "code"
  | "name"
  | "type"
  | "ha"
  | "aulas"
  | "equivalents"
  | "prerequisites"
  | "conjunto"
  | "preCH";

/** Left edge (x0, in PDF points) where each table column starts. */
const COLUMN_STARTS: [Column, number][] = [
  ["code", 0],
  ["name", 78],
  ["type", 250], // header "Tipo" at 252.6
  ["ha", 280], // header "H/A" at 283.1, values at ~281-287
  ["aulas", 300], // header "Aulas" at 311.1, values right-aligned at ~316
  ["equivalents", 340], // header at 348.8, values at ~350
  ["prerequisites", 410], // header at 418.5, values at ~415
  ["conjunto", 478], // header at 483.4, values at ~480
  ["preCH", 530], // header "Pré CH" at 535.2
];

const COURSE_CODE = /^[A-Z]{3,4}\d{4}$/;
const CODE_IN_TEXT = /[A-Z]{3,4}\d{4}/g;
const COURSE_TYPE = /^(ob|op|es|ex)$/i;
const FOOTER = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/;

const ORDINAL_WORDS: Record<string, number> = {
  primeira: 1,
  segunda: 2,
  terceira: 3,
  quarta: 4,
  quinta: 5,
  sexta: 6,
  setima: 7,
  oitava: 8,
  nona: 9,
  decima: 10,
};

function columnOf(x0: number): Column {
  let col: Column = "code";
  for (const [name, start] of COLUMN_STARTS) {
    if (x0 >= start) col = name;
  }
  return col;
}

function lineKind(h: number): LineKind {
  if (h >= 10) return "heading";
  if (h >= 8) return "pageHeader";
  if (h >= 7) return "table";
  return "desc";
}

/** Join wrapped lines; "Não-" + "Lineares" → "Não-Lineares". */
function joinWrapped(parts: string[]): string {
  let out = "";
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) out = part;
    else if (/\p{L}-$/u.test(out)) out += part;
    else out += " " + part;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function normalizeHeading(heading: string): string {
  return heading
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The phase word a heading uses ("fase", "periodo", "semestre", "modulo"). */
export function phaseWord(heading: string): string | null {
  return (
    normalizeHeading(heading).match(/(fase|periodo|semestre|modulo)/)?.[1] ??
    null
  );
}

/**
 * Phase number a section heading introduces, or null when the heading is not a
 * phase ("Disciplinas Optativas", "Atividades Complementares", "null", "Eixo II"…).
 * Only digits glued to a phase word count, so "Área 2" or "Portaria nº 441" don't.
 */
export function phaseFromHeading(heading: string): number | null {
  const text = normalizeHeading(heading);
  const before = text.match(
    /(\d{1,2})\s*[ªaºo°]?\s*\.?\s*(?:fase|periodo|semestre|modulo)/,
  );
  if (before) return parseInt(before[1], 10);
  const after = text.match(/(?:fase|periodo|semestre|modulo)\s*(\d{1,2})\b/);
  if (after) return parseInt(after[1], 10);
  const word = text.match(
    /\b(primeira|segunda|terceira|quarta|quinta|sexta|setima|oitava|nona|decima)\s+fase\b/,
  );
  if (word) return ORDINAL_WORDS[word[1]];
  return null;
}

function readPages(html: string): { height: number; words: Word[] }[] {
  const pages: { height: number; words: Word[] }[] = [];
  const pageRe = /<page[^>]*height="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g;
  const wordRe =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
  for (const page of html.matchAll(pageRe)) {
    const words: Word[] = [];
    for (const w of page[2].matchAll(wordRe)) {
      const y0 = parseFloat(w[2]);
      words.push({
        x0: parseFloat(w[1]),
        y0,
        h: parseFloat(w[3]) - y0,
        text: decodeEntities(w[4]),
      });
    }
    pages.push({ height: parseFloat(page[1]), words });
  }
  return pages;
}

/** Group a page's words into visual lines, keeping each font size separate. */
function readLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const w of sorted) {
    const kind = lineKind(w.h);
    const line = lines.find(
      (l) => l.kind === kind && Math.abs(l.y0 - w.y0) < 2,
    );
    if (line) line.words.push(w);
    else lines.push({ kind, y0: w.y0, words: [w], text: "" });
  }
  for (const l of lines) {
    l.words.sort((a, b) => a.x0 - b.x0);
    l.text = l.words.map((w) => w.text).join(" ");
  }
  return lines.sort((a, b) => a.y0 - b.y0);
}

interface Row {
  code: string;
  type: string;
  ha: string;
  aulas: string;
  name: string[];
  equivalents: string[];
  prerequisites: string[];
  description: string;
  /** Phase of the row's own section heading; null for non-phase sections. */
  phase: number | null;
  /** Last numbered phase heading above the row. */
  inheritedPhase: number | null;
  /** Page index and y of the row's last table line, to place notes under it. */
  page: number;
  lastY: number;
  noteY: number | null;
}

function rowCells(line: Line): Record<Column, string> {
  const cells = {} as Record<Column, string>;
  for (const w of line.words) {
    const col = columnOf(w.x0);
    cells[col] = cells[col] ? `${cells[col]} ${w.text}` : w.text;
  }
  return cells;
}

/**
 * Parse the `pdftotext -bbox-layout` HTML of a curriculum PDF. Pure, so it can be
 * tested without poppler or PDF fixtures.
 */
export function parseCurriculumBBox(html: string): ParsedCurriculum {
  return parseCurriculumBBoxDetailed(html).curriculum;
}

/**
 * Like {@link parseCurriculumBBox}, plus the positions (indexes into `courses`)
 * of the mandatory rows whose phase was only inherited (they sit under a
 * non-phase heading). The re-ingest keeps the DB's existing phase for those.
 */
export function parseCurriculumBBoxDetailed(html: string): {
  curriculum: ParsedCurriculum;
  inheritedPhaseRows: Set<number>;
} {
  const result: ParsedCurriculum = {
    name: "",
    id: 0,
    version: 0,
    totalPhases: 0,
    department: "UFSC",
    courses: [],
  };

  const rows: Row[] = [];
  let current: Row | null = null;
  let pendingDesc: string[] = [];
  let sectionPhase: number | null = null;
  // Last numbered phase heading seen; see the phase rule at the end.
  let lastPhase: number | null = null;
  // The word the curriculum numbers its phases with. A heading using another
  // one is a section, not a phase: Design (454) has "1ª Fase-Sugestão" …
  // "8ª Fase-Sugestão" and then "1ª Módulo Introdutório", an elective pool.
  let phaseWordInUse: string | null = null;

  const pages = readPages(html);
  for (let pageNo = 0; pageNo < pages.length; pageNo++) {
    for (const line of readLines(pages[pageNo].words)) {
      const { kind, text } = line;

      if (!result.id) {
        const m = text.match(/Curso:\s*(\d+)\s*-\s*(.+)/);
        if (m) {
          result.id = parseInt(m[1], 10);
          result.name = `${m[1]} - ${m[2].trim()}`;
        }
      }
      if (!result.version) {
        const m = text.match(/Curr[ií]culo:\s*(\d+)/);
        if (m) result.version = parseInt(m[1], 10);
      }

      // Page furniture: running header block, title and footer.
      if (kind === "pageHeader") {
        // "Observações"/"Legenda" close a habilitação's table; anything after
        // them is a note until the next section starts.
        if (/^(Observa|Legenda)/.test(text)) {
          current = null;
          pendingDesc = [];
        }
        continue;
      }
      if (FOOTER.test(text) || /P[áa]gina:\s*\d+/.test(text)) continue;

      if (kind === "heading") {
        if (/CURR[ÍI]CULO DO CURSO/i.test(text)) continue;
        sectionPhase = phaseFromHeading(text);
        if (sectionPhase !== null) {
          const word = phaseWord(text);
          phaseWordInUse ??= word;
          if (word !== phaseWordInUse) sectionPhase = null;
          else lastPhase = sectionPhase;
        }
        current = null;
        pendingDesc = [];
        continue;
      }

      if (kind === "desc") {
        // A "(*)" note printed in the slot right under a row belongs to that
        // row ("(*) Módulo II", "(*) Verificar se existem pré-requisitos…"),
        // together with its same-paragraph lines (8pt apart). Anything else in
        // the small font is the ementa of the NEXT row.
        const gapFromRow = current ? line.y0 - current.lastY : -1;
        const startsNote =
          current !== null &&
          current.page === pageNo &&
          pendingDesc.length === 0 &&
          text.startsWith("(*)") &&
          gapFromRow > 0 &&
          gapFromRow <= 15;
        const continuesNote =
          current !== null &&
          current.noteY !== null &&
          current.page === pageNo &&
          line.y0 - current.noteY > 0 &&
          line.y0 - current.noteY <= 9;
        if (current && (startsNote || continuesNote)) {
          current.description = joinWrapped([current.description, text]);
          current.noteY = line.y0;
          continue;
        }
        if (current) current.noteY = null;
        pendingDesc.push(text);
        continue;
      }

      // Table-font line.
      const cells = rowCells(line);
      if (cells.code !== undefined) {
        const typeWord = (cells.type ?? "").split(" ")[0];
        const isRow =
          (COURSE_CODE.test(cells.code) || cells.code === "-") &&
          COURSE_TYPE.test(typeWord);
        if (/^Disciplina\b/.test(text) && /\bTipo\b/.test(text)) {
          pendingDesc = []; // column header row
          current = null;
        } else if (isRow) {
          current = {
            code: cells.code,
            type: typeWord,
            ha: cells.ha ?? "",
            aulas: cells.aulas ?? "",
            name: [cells.name ?? ""],
            equivalents: [cells.equivalents ?? ""],
            prerequisites: [cells.prerequisites ?? ""],
            description: joinWrapped(pendingDesc),
            phase: sectionPhase,
            inheritedPhase: lastPhase,
            page: pageNo,
            lastY: line.y0,
            noteY: null,
          };
          rows.push(current);
          pendingDesc = [];
        } else {
          current = null; // a note line ("O aluno deverá cursar…", "Carga horária…")
        }
        continue;
      }
      if (current) {
        // Wrapped cells of the last row (long names, multi-line rules).
        current.lastY = Math.max(current.lastY, line.y0);
        if (cells.name) current.name.push(cells.name);
        if (cells.equivalents) current.equivalents.push(cells.equivalents);
        if (cells.prerequisites) current.prerequisites.push(cells.prerequisites);
      }
    }
  }

  const inheritedPhaseRows = new Set<number>();
  let optCounter = 1;
  for (const row of rows) {
    const isMandatory = /^(ob|es)$/i.test(row.type);
    const isPlaceholder = row.code === "-";
    const id = isPlaceholder
      ? `OPT${String(optCounter++).padStart(4, "0")}`
      : row.code;
    const codes = (parts: string[]) => [
      ...new Set(
        (parts.join(" ").match(CODE_IN_TEXT) ?? []).filter((c) => c !== id),
      ),
    ];
    // Named electives are never tied to a phase ("Recomendação de Optativas"
    // lists them under one, but any phase may take them). Placeholder slots
    // ("- Optativa I") keep it: they ARE the phase's elective load.
    // A mandatory row under a non-phase heading ("Rol de disciplinas de PCC",
    // "Atividades Complementares", "Disciplinas em Extinção") has no real
    // phase. It inherits the last phase heading anyway (the plan generator
    // orders mandatory courses by phase and would put phase-less ones FIRST);
    // scripts/reingest-curricula.ts keeps the DB's existing phase for these.
    const phase = isMandatory
      ? (row.phase ?? row.inheritedPhase)
      : isPlaceholder
        ? row.phase
        : null;
    if (isMandatory && row.phase === null && phase !== null) {
      inheritedPhaseRows.add(result.courses.length);
    }
    result.courses.push([
      id,
      joinWrapped(row.name),
      parseInt(row.aulas, 10) || 0,
      parseInt(row.ha, 10) || 0,
      row.description,
      codes(row.prerequisites),
      codes(row.equivalents),
      isMandatory,
      phase,
    ]);
  }

  result.totalPhases = result.courses.reduce(
    (max, c) => (c[8] !== null && c[8] > max ? c[8] : max),
    0,
  );
  return { curriculum: result, inheritedPhaseRows };
}

export function parsePDF(pdfPath: string): ParsedCurriculum {
  return parsePDFDetailed(pdfPath).curriculum;
}

export function parsePDFDetailed(pdfPath: string) {
  const html = execFileSync("pdftotext", ["-bbox-layout", pdfPath, "-"], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return parseCurriculumBBoxDetailed(html);
}

// CLI: tsx scrapers/curriculum/parser.ts <pdf> [out.json]
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [pdf, out = "data/curriculum_parsed.json"] = process.argv.slice(2);
  if (!pdf) {
    console.error("Usage: tsx scrapers/curriculum/parser.ts <pdf> [out.json]");
    process.exit(1);
  }
  const parsed = parsePDF(pdf);
  fs.writeFileSync(out, JSON.stringify(parsed, null, 2));
  console.log(
    `${parsed.courses.length} courses, ${parsed.totalPhases} phases → ${out}`,
  );
}
