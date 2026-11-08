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

/**
 * Per-habilitação placement of a course: track index (as a JSON key) →
 * [isMandatory, phase]. Absent on courses every habilitação shares.
 */
export type TrackMap = Record<string, [boolean, number | null]>;

/** Ênfase version of a course: [index into `enfases`, option index]. */
export type EnfaseRef = [number, number];

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
  (TrackMap | null)?,
  EnfaseRef?,
];

/** A habilitação the student picks between ("Licenciatura" / "Bacharelado"). */
export interface Habilitacao {
  /** Short name for the slider: what differs between the habilitações. */
  label: string;
  /** Full name from the PDF's "Habilitação:" header. */
  name: string;
}

export interface ParsedCurriculum {
  name: string;
  id: number;
  version: number;
  totalPhases: number;
  department: string;
  courses: CompactCourse[];
  /** Only on curricula with 2+ habilitações; index = TrackMap key. */
  habilitacoes?: Habilitacao[];
  /**
   * Ênfase choices ("1ª ênfase", "2ª ênfase"), each with its options (A–D).
   * A course with an EnfaseRef is shown only when that option is chosen.
   */
  enfases?: Enfase[];
}

/** One ênfase choice: its slot ("1ª ênfase") and the options to pick from. */
export interface Enfase {
  label: string;
  options: Habilitacao[];
}

/**
 * The track a section title assigns its rows to, if any:
 *   "Fase 07 - NÚCLEO PROFISSIONALIZANTE: BACHARELADO"        → "Bacharelado"
 *   "5ª Fase - Terminalidade: Linguagens e suas Tecnologias."  → "Linguagens e suas Tecnologias"
 *   "APROFUNDAMENTO I [Fase 7]-Esportes"                       → "Esportes"
 */
export function trackFromSection(title: string): string | null {
  const m =
    title.match(/n[úu]cleo\s+profissionalizante\s*:\s*(.+)$/i) ??
    title.match(/terminalidade\s*:\s*(.+)$/i) ??
    title.match(/aprofundamento\s+[ivx]+\s*\[[^\]]*\]\s*-\s*(.+)$/i);
  if (!m) return null;
  const name = m[1].replace(/[\s.;:,-]+$/, "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return titleCaseIfUpper(name);
}

/** "LICENCIATURA EM PSICOLOGIA" → "Licenciatura em Psicologia"; mixed case kept. */
export function titleCaseIfUpper(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const small = new Set(["e", "em", "de", "da", "do", "das", "dos"]);
  return name
    .toLowerCase()
    .split(" ")
    .map((w, i) =>
      i > 0 && small.has(w)
        ? w
        : // "ESCOLAR/EDUCACIONAL" → "Escolar/Educacional"
          w.replace(/(^|[/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()),
    )
    .join(" ");
}

/**
 * Ênfase version in a course name: "Estágio Profissionalizante I A (1ª ênfase
 * escolhida)" → { slot: 1, letter: "A" }. Psicologia lists the A–D version of
 * each Estágio/Fundamentação; the student takes the one of the chosen ênfase.
 */
export function enfaseVariant(name: string): { slot: number; letter: string } | null {
  const m = name.match(/([A-D])\s*:?\s*\(\s*(\d)\s*ª?\s*[ÊêEe]nfas/);
  return m ? { slot: Number(m[2]), letter: m[1] } : null;
}

/**
 * Short labels for habilitação names: drop the words every name shares at the
 * start and end ("Licenciatura em Ciências Sociais" / "Bacharelado em Ciências
 * Sociais" → "Licenciatura" / "Bacharelado").
 */
export function habilitacaoLabels(names: string[]): string[] {
  const words = names.map((n) => n.split(" "));
  // Accent/case-insensitive: one header writes "Lingua", another "Língua".
  const same = (pick: (w: string[]) => string) =>
    words.every((w) => normalizeHeading(pick(w)) === normalizeHeading(pick(words[0])));
  let pre = 0;
  while (words.every((w) => w.length - pre > 1) && same((w) => w[pre])) pre++;
  let suf = 0;
  while (
    words.every((w) => w.length - pre - suf > 1) &&
    same((w) => w[w.length - 1 - suf])
  ) {
    suf++;
  }
  return words.map(
    (w, i) =>
      w
        .slice(pre, w.length - suf)
        .join(" ")
        .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "")
        .replace(/^(em|de|da|do|das|dos|e)\s+/i, "") || names[i],
  );
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
  /** Title of the section the row is listed under ("Fase 01", "Optativas"…). */
  section: string;
  /** The page header's "Habilitação:" the row was printed under. */
  habilitacao: string;
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
 * Whether every track is a real course plan: its view (shared courses plus its
 * own) has mandatory courses in phases 1 and 2, and not all views are equal.
 */
function tracksAreCourses(courses: CompactCourse[], trackCount: number): boolean {
  const views: string[] = [];
  for (let t = 0; t < trackCount; t++) {
    const phases = new Set<number | null>();
    const ids: string[] = [];
    for (const c of courses) {
      const placement: [boolean, number | null] | undefined = c[9]
        ? c[9][String(t)]
        : [c[7], c[8]];
      if (!placement) continue;
      ids.push(c[0]);
      if (placement[0]) phases.add(placement[1]);
    }
    if (!phases.has(1) || !phases.has(2)) return false;
    views.push(ids.join(","));
  }
  return new Set(views).size > 1;
}

/** A course name without its "(…)" notes, for comparing two versions of it. */
function nameStem(name: string): string {
  return normalizeHeading(name.replace(/\([^)]*\)?/g, ""))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A track that builds on another. Psicologia's "NÚCLEO PROFISSIONALIZANTE:
 * LICENCIATURA" holds no ênfase courses, yet its own courses belong to the
 * chosen ênfase ("Seminários Integrados I: Introdução ao Campo (1ª ênfase
 * escolhida)"), and the habilitação filing those courses is "Psicólogo e
 * Licenciatura em Psicologia": the Licenciatura is taken on top of the
 * psicólogo formation, not instead of it. Such a track gets every mandatory
 * course of the track holding the ênfases, except where it lists its own
 * version: its 72 h/a Seminários Integrados replace the base's 36 h/a ones
 * ("Deve cumprir [PSI7808 e PSI7018] o aluno que não cumprir nenhuma das
 * disciplinas dentre as PSI7707, PSI7807, PSI7917 e PSI7017").
 */
function addOnTracks(result: ParsedCurriculum): void {
  const habs = result.habilitacoes!;
  const mandatoryIn = (c: CompactCourse, t: number) => c[9]?.[String(t)]?.[0] === true;
  // Only tracks that differ (shared courses have no TrackMap).
  const own = (t: number) => result.courses.filter((c) => c[9] && mandatoryIn(c, t));
  const withEnfases = habs
    .map((_, t) => t)
    .filter((t) => own(t).some((c) => c[10]));
  if (withEnfases.length !== 1) return;
  const base = withEnfases[0];
  for (let t = 0; t < habs.length; t++) {
    if (t === base) continue;
    const mine = own(t);
    if (mine.some((c) => c[10])) continue;
    if (!mine.some((c) => /[êe]nfase\s+escolhid/i.test(c[1]))) continue;
    const myStems = new Set(mine.map((c) => nameStem(c[1])));
    result.courses = result.courses.map((c) => {
      if (!c[9] || !mandatoryIn(c, base) || mandatoryIn(c, t)) return c;
      const tracks: TrackMap = { ...c[9] };
      const [, phase] = c[9][String(base)];
      // Replaced by this track's own version: still takeable as an elective
      // (no phase, or the grid would show it as a slot to fill).
      tracks[String(t)] = myStems.has(nameStem(c[1])) ? [false, null] : [true, phase];
      const copy = [...c] as CompactCourse;
      // Same placement in every track → shared, like any other common course.
      const values = Object.values(tracks).map((v) => JSON.stringify(v));
      const shared = values.length === habs.length && new Set(values).size === 1;
      if (shared) {
        copy[7] = tracks["0"][0];
        copy[8] = tracks["0"][1];
      }
      copy[9] = shared ? null : tracks;
      if (shared && copy[10] === undefined) copy.length = 9;
      return copy;
    });
    habs[t] = {
      label: `${habs[base].label} + ${habs[t].label.replace(/\s+(em|de|da|do|das|dos)\s+.*$/i, "")}`,
      name: `${habs[base].name} e ${habs[t].name}`,
    };
  }
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
  let sectionTitle = "";
  // Last numbered phase heading seen; see the phase rule at the end.
  let lastPhase: number | null = null;
  // The word the curriculum numbers its phases with. A heading using another
  // one is a section, not a phase: Design (454) has "1ª Fase-Sugestão" …
  // "8ª Fase-Sugestão" and then "1ª Módulo Introdutório", an elective pool.
  let phaseWordInUse: string | null = null;
  // Page header "Habilitação: …" — some PDFs hold one full grid per habilitação.
  let habilitacao = "";

  // Observações text (rules such as "As disciplinas X Y são obrigatórias para
  // efeito de integralização de LICENCIATURA") and ênfase names ("ÊNFASE A -
  // SAÚDE E PROCESSOS CLÍNICOS").
  const noteLines: string[] = [];
  let inNotes = false;
  const enfaseNames = new Map<string, string>();

  const pages = readPages(html);
  for (let pageNo = 0; pageNo < pages.length; pageNo++) {
    for (const line of readLines(pages[pageNo].words)) {
      const { kind, text } = line;
      const enfaseName = text.match(/ÊNFASE\s+([A-D])\s*[-–]\s*(.+)$/);
      if (enfaseName && !enfaseNames.has(enfaseName[1])) {
        enfaseNames.set(enfaseName[1], titleCaseIfUpper(enfaseName[2].trim()));
      }

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
        const hab = text.match(/^Habilita[çc][ãa]o:\s*(.*)$/);
        if (hab) habilitacao = hab[1].trim();
        // "Observações"/"Legenda" close a habilitação's table; anything after
        // them is a note until the next section starts.
        if (/^(Observa|Legenda)/.test(text)) {
          current = null;
          pendingDesc = [];
          inNotes = text.startsWith("Observa");
        } else if (
          inNotes &&
          !/^(Curso:|Curr[ií]culo:|Habilita[çc][ãa]o:|\d{2}\/\d{2}\/\d{4})/.test(text)
        ) {
          // The Observações paragraphs are set in this same 8pt font.
          noteLines.push(text);
        }
        continue;
      }
      if (FOOTER.test(text) || /P[áa]gina:\s*\d+/.test(text)) continue;
      if (kind === "heading") inNotes = false;
      if (inNotes) noteLines.push(text);

      if (kind === "heading") {
        if (/CURR[ÍI]CULO DO CURSO/i.test(text)) continue;
        sectionPhase = phaseFromHeading(text);
        sectionTitle = text;
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
            section: sectionTitle,
            inheritedPhase: lastPhase,
            habilitacao,
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

  const built: {
    course: CompactCourse;
    inherited: boolean;
    placeholder: boolean;
    /** Listed in a section the PDF calls shared ("…comum às duas habilitações"). */
    common: boolean;
    /** Title of the section the row is listed under. */
    section: string;
    habilitacao: string;
    /** Lower = better placement, for choosing among repeats of one id. */
    rank: number;
  }[] = [];
  let optCounter = 1;
  for (const row of rows) {
    const isPlaceholder = row.code === "-";
    // A slot ("- Optativa I", "- Prática como Componente Curricular") is never
    // a course to take: the app fills it from elective credits only when it is
    // typed optional (isGenericPlaceholder), even if the PDF says "Ob".
    const isMandatory = !isPlaceholder && /^(ob|es)$/i.test(row.type);
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
    const inherited = isMandatory && row.phase === null && phase !== null;
    built.push({
      course: [
        id,
        joinWrapped(row.name),
        parseInt(row.aulas, 10) || 0,
        parseInt(row.ha, 10) || 0,
        row.description,
        codes(row.prerequisites),
        codes(row.equivalents),
        isMandatory,
        phase,
      ],
      inherited,
      placeholder: isPlaceholder,
      habilitacao: row.habilitacao,
      common: /\bcomum\b/.test(normalizeHeading(row.section)),
      section: row.section,
      rank: isMandatory && phase !== null ? (inherited ? 1 : 0) : 2,
    });
  }

  // Habilitações ("tracks"). Some PDFs print one full grid per habilitação,
  // usually a shared core ("Bacharelado e Licenciatura em X") plus one section
  // per track ("Licenciatura em X", "Bacharelado em X"). The core is not a
  // track; a curriculum has tracks when 2+ other sections hold courses.
  const habOf = (b: (typeof built)[number]) =>
    b.habilitacao.replace(/\s+/g, " ").trim();
  // A section naming two degrees ("Bacharelado e Licenciatura em X",
  // "Bacharelado em Química e Bacharelado em Química Tecnológica") is shared.
  const namesTwoDegrees = (h: string) =>
    (normalizeHeading(h).match(/bacharel|licenci/g) ?? []).length >= 2;
  const mandatoryIn = (h: string) =>
    built.filter((b) => habOf(b) === h && b.course[7] === true).length;
  let trackNames = [
    ...new Set(built.map(habOf).filter((h) => h && !namesTwoDegrees(h))),
  ].filter((h) => mandatoryIn(h) > 0); // an electives-only section isn't a choice
  // The base a set of habilitações extends ("Licenciatura em Pedagogia" for
  // "Licenciatura em Pedagogia, habilitação Educação Infantil", …) is shared.
  const base = trackNames.find(
    (h) =>
      trackNames.length > 2 &&
      trackNames.every(
        (o) => o === h || normalizeHeading(o).startsWith(normalizeHeading(h)),
      ),
  );
  if (base) trackNames = trackNames.filter((h) => h !== base);

  // A choice written in the section titles ("NÚCLEO PROFISSIONALIZANTE:
  // BACHARELADO / LICENCIATURA", "Terminalidade: …", "APROFUNDAMENTO …-…")
  // is the student's real track and wins over the "Habilitação:" groups,
  // which in those PDFs are only how UFSC files the courses (Psicologia files
  // its whole núcleo comum under "Licenciatura em Psicologia").
  const sectionTrackOf = (b: (typeof built)[number]) => trackFromSection(b.section);
  const sectionTracks = [
    ...new Set(built.map(sectionTrackOf).filter((t): t is string => !!t)),
  ];
  // The titles must actually split the courses. A course every track requires
  // in the same phase is fine (Educação Física 1991.1's MEN5236 in each
  // APROFUNDAMENTO); one required under two tracks' titles in DIFFERENT phases
  // means the titles were stamped on regardless of content (Psicologia 1991.1
  // lists EED5331 under "Fase 07 - BACHARELADO" and "8ª FASE - LICENCIATURA",
  // EED5187 the other way round, and its docência internship under
  // "BACHARELADO").
  const titledPhases = new Map<string, Map<string, number | null>>();
  let titlesSplit = true;
  for (const b of built) {
    const t = sectionTrackOf(b);
    if (!t || b.course[7] !== true) continue;
    const byTrack = titledPhases.get(b.course[0]) ?? new Map<string, number | null>();
    for (const [other, phase] of byTrack) {
      if (other !== t && phase !== b.course[8]) titlesSplit = false;
    }
    byTrack.set(t, b.course[8]);
    titledPhases.set(b.course[0], byTrack);
  }
  const bySection = sectionTracks.length >= 2 && titlesSplit;
  if (bySection) trackNames = sectionTracks;

  // Courses the notes declare mandatory for a track even though they're listed
  // under another one: "As disciplinas PSI7508 PSI7609 são obrigatórias para
  // efeito de integralização de LICENCIATURA em PSICOLOGIA."
  const requiredIn = new Map<string, Set<number>>();
  const notesText = noteLines.join(" ").replace(/\s+/g, " ");
  for (const m of notesText.matchAll(
    /disciplinas?\s+((?:[A-Z]{3}\s?\d{4}[\s,e]*)+?)\s*s[ãa]o\s+obrigat[óo]rias\s+para\s+(?:fins\s+de\s+|efeito\s+de\s+)?integraliza[çc][ãa]o\s+(?:curricular\s+)?(?:d[aeo]s?\s+)?(.+?)(?:[.;]|$)/gi,
  )) {
    const phrase = normalizeHeading(m[2]);
    const t = trackNames.findIndex((name) => phrase.includes(normalizeHeading(name)));
    if (t < 0) continue;
    for (const code of m[1].match(/[A-Z]{3}\s?\d{4}/g) ?? []) {
      const id = code.replace(/\s/g, "");
      const set = requiredIn.get(id) ?? new Set<number>();
      set.add(t);
      requiredIn.set(id, set);
    }
  }

  // One row per course id: the app keys courses by id, so a repeat shows up
  // twice in the phase grid. Repeats come from the per-habilitação grids and
  // from courses listed twice in one (a phase and "Disciplinas em Extinção").
  // Keep the best-placed occurrence — mandatory under a phase heading, then
  // mandatory with an inherited phase, then the first; with tracks, each
  // track's own placement goes in the course's TrackMap. Without tracks, only
  // the first section's elective slots are kept so two loads don't add up.
  const assemble = (withTracks: boolean) => {
    const trackOf = (b: (typeof built)[number]) =>
      !withTracks || b.common
        ? -1 // -1 = every track
        : bySection
          ? trackNames.indexOf(sectionTrackOf(b) ?? "")
          : trackNames.indexOf(habOf(b));
    const primary = built[0]?.habilitacao;
    const candidates = built.filter(
      (b) => !b.placeholder || withTracks || b.habilitacao === primary,
    );
    type Row = (typeof built)[number];
    const best = new Map<string, number>();
    const coreRow = new Map<string, Row>(); // listed outside every track
    const trackRows = new Map<string, Map<number, Row>>();
    candidates.forEach((b, i) => {
      const id = b.course[0];
      const j = best.get(id);
      if (j === undefined || b.rank < candidates[j].rank) best.set(id, i);
      if (!withTracks) return;
      const t = trackOf(b);
      if (t < 0) {
        const prev = coreRow.get(id);
        if (!prev || b.rank < prev.rank) coreRow.set(id, b);
        return;
      }
      const map = trackRows.get(id) ?? new Map<number, Row>();
      const prev = map.get(t);
      if (!prev || b.rank < prev.rank) map.set(t, b);
      trackRows.set(id, map);
    });
    // Each track takes its own listing of a course, else the core's: a course
    // that is an elective in the core but mandatory in one track (Geografia's
    // GCN7500) stays an elective for the others. Same placement everywhere →
    // shared, no TrackMap.
    const placementOf = (id: string): TrackMap | null => {
      const own = trackRows.get(id);
      if (!own) return null;
      // With section-title tracks, a shared listing only counts if it sits in
      // a phase section: a "Disciplinas Complementares" list isn't the núcleo
      // comum (Psicologia's ANT7003 belongs to the Licenciatura núcleo). The
      // other tracks can still take it as a complementar.
      const sharedRow = coreRow.get(id);
      const complementar = bySection && !!sharedRow?.inherited;
      const core = complementar ? undefined : sharedRow;
      const tracks: TrackMap = {};
      for (let t = 0; t < trackNames.length; t++) {
        const row = own.get(t) ?? core;
        if (row) tracks[String(t)] = [row.course[7], row.course[8]];
        else if (complementar) tracks[String(t)] = [false, null];
      }
      const listed = [...own.values()][0];
      for (const t of requiredIn.get(id) ?? []) {
        if (tracks[String(t)]?.[0] !== true) tracks[String(t)] = [true, listed.course[8]];
      }
      const values = Object.values(tracks).map((v) => JSON.stringify(v));
      const shared = values.length === trackNames.length && new Set(values).size === 1;
      return shared ? null : tracks;
    };
    const courses: CompactCourse[] = [];
    const inherited = new Set<number>();
    candidates.forEach((b, i) => {
      const id = b.course[0];
      if (best.get(id) !== i) return;
      if (b.inherited) inherited.add(courses.length);
      const tracks = placementOf(id);
      if (tracks) {
        const [c0, c1, c2, c3, c4, c5, c6, c7, c8] = b.course;
        courses.push([c0, c1, c2, c3, c4, c5, c6, c7, c8, tracks]);
      } else {
        courses.push(b.course);
      }
    });
    return { courses, inherited };
  };

  // The "Habilitação:" header is how UFSC's system files courses, and only
  // sometimes a choice the student makes. Psicologia files its first six phases
  // under "Licenciatura em Psicologia" and has groups like "Bacharelado e
  // Psicólogo" holding two courses; its real tracks are in section titles. So
  // only keep tracks when each one is a whole course plan — mandatory courses in
  // its first two phases — and they actually differ; otherwise show one grid.
  let hasTracks = trackNames.length >= 2;
  let assembled = assemble(hasTracks);
  if (hasTracks && !tracksAreCourses(assembled.courses, trackNames.length)) {
    hasTracks = false;
    assembled = assemble(false);
  }
  const inheritedPhaseRows = assembled.inherited;
  result.courses.push(...assembled.courses);
  if (hasTracks) {
    const labels = bySection ? trackNames : habilitacaoLabels(trackNames);
    result.habilitacoes = trackNames.map((name, i) => ({ label: labels[i], name }));
  }

  // Ênfase versions: the same Estágio/Fundamentação listed in A–D versions per
  // ênfase slot ("1ª ênfase escolhida" for phases 7–8, "2ª" for 9–10). The
  // student takes only the chosen ênfase's version.
  const variants = result.courses.map((c) => enfaseVariant(c[1]));
  const slotIndex = new Map<number, number>();
  const letters = new Map<number, string[]>();
  const enfases: Enfase[] = [];
  for (const slot of [...new Set(variants.flatMap((v) => (v ? [v.slot] : [])))].sort()) {
    const options = [
      ...new Set(variants.flatMap((v) => (v && v.slot === slot ? [v.letter] : []))),
    ].sort();
    if (options.length < 2) continue;
    slotIndex.set(slot, enfases.length);
    letters.set(slot, options);
    enfases.push({
      label: `${slot}ª ênfase`,
      options: options.map((l) => {
        const name = enfaseNames.get(l) ?? `Ênfase ${l}`;
        return { label: enfaseNames.has(l) ? `${l} – ${name}` : name, name };
      }),
    });
  }
  if (enfases.length > 0) {
    result.enfases = enfases;
    result.courses = result.courses.map((c, i) => {
      const v = variants[i];
      if (!v || !slotIndex.has(v.slot)) return c;
      const [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9] = c;
      const ref: EnfaseRef = [slotIndex.get(v.slot)!, letters.get(v.slot)!.indexOf(v.letter)];
      return [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9 ?? null, ref];
    });
  }
  if (result.habilitacoes && result.enfases) addOnTracks(result);

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
