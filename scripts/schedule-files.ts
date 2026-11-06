/**
 * Shared helpers for the MatrUFSC schedule files the Rust scraper writes to
 * `data/schedule/<YYYYS>-<CAMPUS>.json` (one file per campus per semester, each
 * shaped `{ DATA: string, <CAMPUS>: [[courseId, name, classes], ...] }`).
 *
 * Used by `update-curriculums.ts` (daily job), `orchestrate.ts` and
 * `ingest_curriculums.ts`, which used to read only the Florianópolis file and so
 * gave programs from the other campuses Florianópolis classes.
 */
import fs from "fs";
import path from "path";

export const CAMPUSES = ["FLO", "JOI", "CBS", "ARA", "BLN"] as const;
export type Campus = (typeof CAMPUSES)[number];

export type ScheduleJson = { DATA?: string } & Record<string, unknown>;
type CourseEntry = [string, ...unknown[]];

/** Campus of a program, from its display name ("Química (2024.1) - Blumenau"). */
export function campusFromProgramName(name: string | null | undefined): Campus {
  const n = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("ararangu")) return "ARA";
  if (n.includes("blumenau")) return "BLN";
  if (n.includes("curitibanos")) return "CBS";
  if (n.includes("joinville")) return "JOI";
  return "FLO";
}

/**
 * A real MatrUFSC semester code: YYYY + term 1/2/3, at most next year. CAGR's
 * dropdown also lists bogus codes (26261, 20264) that always come back empty.
 */
export function isPlausibleSemester(code: string, now = new Date()): boolean {
  const m = code.match(/^(\d{4})([123])$/);
  return !!m && Number(m[1]) <= now.getFullYear() + 1;
}

function campusEntries(json: ScheduleJson, campus: string): CourseEntry[] {
  const entries = json[campus];
  return Array.isArray(entries) ? (entries as CourseEntry[]) : [];
}

/**
 * Non-empty schedule files in `dir`, newest semester first:
 * `[{ semester, files: { FLO: path, BLN: path, ... } }]`. Empty files (a failed
 * or bogus scrape writes `{"DATA":…,"FLO":[]}`) and implausible semesters are
 * left out, so "latest" never lands on one of them.
 */
export function listScheduleFiles(
  dir: string,
): { semester: string; files: Partial<Record<Campus, string>> }[] {
  if (!fs.existsSync(dir)) return [];
  const bySemester = new Map<string, Partial<Record<Campus, string>>>();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{5})-([A-Z]{3})\.json$/);
    if (!m || !isPlausibleSemester(m[1])) continue;
    const campus = m[2] as Campus;
    if (!CAMPUSES.includes(campus)) continue;
    const file = path.join(dir, f);
    if (campusEntries(readSchedule(file), campus).length === 0) continue;
    const files = bySemester.get(m[1]) ?? {};
    files[campus] = file;
    bySemester.set(m[1], files);
  }
  return [...bySemester.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([semester, files]) => ({ semester, files }));
}

export function readSchedule(file: string): ScheduleJson {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** The campus key a schedule file holds ("FLO", "BLN", ...), if any. */
export function campusOf(json: ScheduleJson): string | null {
  return Object.keys(json).find((k) => Array.isArray(json[k])) ?? null;
}

/**
 * Keep only the classes of `courseIds`, under the file's own campus key.
 * Returns null when nothing matches.
 */
export function filterSchedule(
  json: ScheduleJson,
  courseIds: Set<string>,
): ScheduleJson | null {
  const campus = campusOf(json);
  if (!campus) return null;
  const kept = campusEntries(json, campus).filter((e) => courseIds.has(e[0]));
  return kept.length > 0 ? { DATA: json.DATA, [campus]: kept } : null;
}

/** Course ids of a curriculum, compact-array or object courses. */
export function curriculumCourseIds(curriculum: {
  courses?: unknown[];
}): Set<string> {
  const ids = new Set<string>();
  for (const c of curriculum.courses ?? []) {
    if (Array.isArray(c)) ids.add(String(c[0]));
    else if (c && typeof c === "object" && "id" in c) ids.add(String(c.id));
  }
  return ids;
}

/**
 * For a curriculum whose campus is unknown (orchestrate.ts), the campus file
 * that matches most of its courses.
 */
export function bestCampusFile(
  files: Partial<Record<Campus, string>>,
  courseIds: Set<string>,
): { campus: Campus; file: string; matches: number } | null {
  let best: { campus: Campus; file: string; matches: number } | null = null;
  for (const campus of CAMPUSES) {
    const file = files[campus];
    if (!file) continue;
    const matches = campusEntries(readSchedule(file), campus).filter((e) =>
      courseIds.has(e[0]),
    ).length;
    if (matches > 0 && (!best || matches > best.matches)) {
      best = { campus, file, matches };
    }
  }
  return best;
}
