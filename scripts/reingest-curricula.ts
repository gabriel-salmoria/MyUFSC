/**
 * Re-parse the curriculum PDFs in data/pdfs with the current parser and update
 * the curricula that are ALREADY in the DB. It never adds or deletes a
 * curriculum, and it never touches `programs` or `schedules`.
 *
 * Dry run by default: prints what would change and writes the full diff to
 * data/reingest-report.json.
 *
 *   npx tsx scripts/reingest-curricula.ts                     # dry run
 *   npx tsx scripts/reingest-curricula.ts --apply             # write
 *   npx tsx scripts/reingest-curricula.ts --restore=data/backups/<file>.json
 *
 * Options:
 *   --only=208_19961,207_19961  limit to these program ids
 *   --exclude=207_19961         leave these program ids alone
 *   --include-gemini            also replace curricula that were parsed by the
 *                               Gemini script (department ≠ "UFSC"); skipped by
 *                               default because their shape differs
 *   --allow-removals            allow an update that drops course ids the DB has
 *                               (blocked by default: student plans reference them)
 *   --hold-new-slots            don't add elective slots ("OPT…") the DB doesn't
 *                               have yet; the per-habilitação slots stay out until
 *                               an app that understands habilitações is deployed
 *   --keep-inherited-from=<backup.json>
 *                               where to take the phase of "inherited" rows from
 *                               (default: the DB as it is now; see below)
 *
 * A mandatory row under a non-phase heading ("Rol de disciplinas de PCC",
 * "Módulo de Projetos", "Atividades Complementares") has no real phase; the
 * parser gives it the last phase heading. For those rows the re-ingest keeps the
 * phase the curriculum already had, so they don't move around in the UI or the
 * plan generator.
 *
 * --apply first saves the current rows it is about to change to
 * data/backups/curriculums-<timestamp>.json, then updates everything in ONE
 * transaction; --restore writes such a backup back the same way.
 */
import fs from "fs";
import path from "path";
import { Client } from "pg";
import * as dotenv from "dotenv";
import {
  parsePDFDetailed,
  type CompactCourse,
} from "../scrapers/curriculum/parser";
import { retagNonDisciplineRequirements } from "../lib/curriculum-tagging";

dotenv.config();

const PDF_DIRS = ["data/pdfs", "data/pdfs/done"];
const REPORT_PATH = "data/reingest-report.json";
const BACKUP_DIR = "data/backups";

const args = process.argv.slice(2);
const option = (name: string) =>
  args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const apply = args.includes("--apply");
const includeGemini = args.includes("--include-gemini");
const allowRemovals = args.includes("--allow-removals");
const only = option("--only")?.split(",").filter(Boolean);
const keepInheritedFrom = option("--keep-inherited-from");
const holdNewSlots = args.includes("--hold-new-slots");
const exclude = option("--exclude")?.split(",").filter(Boolean) ?? [];

type DbCourse = unknown[];
interface DbCurriculum {
  name?: string;
  department?: string;
  totalPhases?: number;
  courses?: DbCourse[];
  [key: string]: unknown;
}

type Status =
  | "update"
  | "unchanged"
  | "blocked-removals"
  | "skipped-gemini"
  | "pdf-mismatch"
  | "empty-parse"
  | "not-in-db"
  | "db-not-compact";

interface Entry {
  programId: string;
  status: Status;
  origin: "parser" | "gemini";
  added: string[];
  removed: string[];
  changed: Record<string, number>;
  totalPhases: [number | undefined, number];
  note?: string;
  next?: DbCurriculum;
}

const FIELDS = [
  "id",
  "name",
  "credits",
  "workload",
  "description",
  "prerequisites",
  "equivalents",
  "type",
  "phase",
  "tracks",
] as const;

/** JSON with object keys sorted: Postgres jsonb stores keys in its own order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function sameField(i: number, a: unknown, b: unknown): boolean {
  if (i === 5 || i === 6) {
    const sa = [...((a as string[]) ?? [])].sort();
    const sb = [...((b as string[]) ?? [])].sort();
    return JSON.stringify(sa) === JSON.stringify(sb);
  }
  if (i === 8) return (a ?? null) === (b ?? null);
  return canonical(a) === canonical(b);
}

function diff(dbCourses: DbCourse[], next: CompactCourse[]) {
  const before = new Map(dbCourses.map((c) => [String(c[0]), c]));
  const after = new Map(next.map((c) => [c[0], c]));
  const changed: Record<string, number> = {};
  for (const [id, c] of after) {
    const old = before.get(id);
    if (!old) continue;
    for (let i = 1; i < FIELDS.length; i++) {
      if (!sameField(i, old[i], c[i])) {
        changed[FIELDS[i]] = (changed[FIELDS[i]] ?? 0) + 1;
      }
    }
  }
  return {
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    changed,
  };
}

function listPdfs(): Map<string, string> {
  const pdfs = new Map<string, string>();
  for (const dir of PDF_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(\d+_\d{5})\.pdf$/i);
      if (m) pdfs.set(m[1], path.join(dir, f));
    }
  }
  return pdfs;
}

async function restore(client: Client, file: string) {
  const rows: { programId: string; curriculumJson: DbCurriculum }[] = JSON.parse(
    fs.readFileSync(file, "utf-8"),
  );
  await client.query("BEGIN");
  try {
    for (const row of rows) {
      const res = await client.query(
        `UPDATE curriculums SET "curriculumJson" = $2 WHERE "programId" = $1`,
        [row.programId, row.curriculumJson],
      );
      if (res.rowCount !== 1) throw new Error(`${row.programId}: not found`);
    }
    await client.query("COMMIT");
    console.log(`Restored ${rows.length} curricula from ${file}.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function main() {
  if (!process.env.NEON_URL) throw new Error("NEON_URL is not set.");
  const client = new Client(process.env.NEON_URL);
  await client.connect();

  try {
    const restoreFile = option("--restore");
    if (restoreFile) return await restore(client, restoreFile);

    const res = await client.query(
      `SELECT "programId", "curriculumJson" FROM curriculums`,
    );
    const db = new Map<string, DbCurriculum>(
      res.rows.map((r) => [r.programId, r.curriculumJson]),
    );
    // Phase source for inherited rows: a backup taken before an earlier apply,
    // or the DB as it is now.
    const phaseSource = new Map<string, DbCurriculum>(db);
    if (keepInheritedFrom) {
      const rows: { programId: string; curriculumJson: DbCurriculum }[] =
        JSON.parse(fs.readFileSync(keepInheritedFrom, "utf-8"));
      for (const r of rows) phaseSource.set(r.programId, r.curriculumJson);
    }

    const entries: Entry[] = [];
    for (const [programId, pdfPath] of [...listPdfs()].sort()) {
      if (only && !only.includes(programId)) continue;
      if (exclude.includes(programId)) continue;
      const current = db.get(programId);
      const origin = current?.department === "UFSC" ? "parser" : "gemini";
      const entry: Entry = {
        programId,
        status: "update",
        origin,
        added: [],
        removed: [],
        changed: {},
        totalPhases: [current?.totalPhases, 0],
      };
      entries.push(entry);

      if (!current) {
        entry.status = "not-in-db";
        continue;
      }
      const dbCourses = current.courses ?? [];
      if (!dbCourses.every(Array.isArray)) {
        entry.status = "db-not-compact";
        continue;
      }

      const { curriculum: parsed, inheritedPhaseRows } = parsePDFDetailed(pdfPath);
      // Previous phases per id, in document order (a PDF may list a code twice:
      // the k-th new row of an id takes the k-th old one's phase).
      const previousPhases = new Map<string, unknown[]>();
      for (const c of (phaseSource.get(programId)?.courses ?? []).filter(Array.isArray)) {
        const list = previousPhases.get(String(c[0])) ?? [];
        list.push(c[8]);
        previousPhases.set(String(c[0]), list);
      }
      const seen = new Map<string, number>();
      parsed.courses.forEach((c, i) => {
        const k = seen.get(c[0]) ?? 0;
        seen.set(c[0], k + 1);
        const prev = previousPhases.get(c[0]);
        if (!inheritedPhaseRows.has(i) || !prev || k >= prev.length) return;
        c[8] = typeof prev[k] === "number" && (prev[k] as number) > 0 ? (prev[k] as number) : null;
      });
      const [course, version] = programId.split("_").map(Number);
      if (parsed.id !== course || parsed.version !== version) {
        entry.status = "pdf-mismatch";
        entry.note = `PDF says ${parsed.id}_${parsed.version}`;
        continue;
      }
      const known = new Set(dbCourses.map((c) => String(c[0])));
      const courses = retagNonDisciplineRequirements(
        holdNewSlots
          ? parsed.courses.filter((c) => !c[0].startsWith("OPT") || known.has(c[0]))
          : parsed.courses,
      );
      if (courses.length === 0) {
        entry.status = "empty-parse";
        continue;
      }

      const totalPhases = parsed.totalPhases || current.totalPhases || 0;
      entry.totalPhases = [current.totalPhases, totalPhases];
      Object.assign(entry, diff(dbCourses, courses));
      const next: DbCurriculum = { ...current, courses, totalPhases };
      // Habilitações (tracks) come only from the PDF: set or clear them.
      if (parsed.habilitacoes) next.habilitacoes = parsed.habilitacoes;
      else delete next.habilitacoes;

      if (
        canonical(dbCourses) === canonical(courses) &&
        current.totalPhases === totalPhases &&
        canonical(current.habilitacoes) === canonical(next.habilitacoes)
      ) {
        entry.status = "unchanged";
      } else if (origin === "gemini" && !includeGemini) {
        entry.status = "skipped-gemini";
      } else if (entry.removed.length > 0 && !allowRemovals) {
        entry.status = "blocked-removals";
      } else {
        entry.next = next;
      }
    }

    // ── Report ──
    const byStatus: Record<string, number> = {};
    for (const e of entries) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    const updates = entries.filter((e) => e.status === "update");
    const totals: Record<string, number> = {};
    for (const e of updates) {
      for (const [k, v] of Object.entries(e.changed)) totals[k] = (totals[k] ?? 0) + v;
      totals.added = (totals.added ?? 0) + e.added.length;
      totals.removed = (totals.removed ?? 0) + e.removed.length;
    }
    console.log("By status:", byStatus);
    console.log(`Courses changed across the ${updates.length} updates:`, totals);
    for (const e of entries.filter((e) =>
      ["blocked-removals", "pdf-mismatch", "empty-parse", "db-not-compact"].includes(e.status),
    )) {
      console.log(
        `  ${e.status.padEnd(16)} ${e.programId} (${e.origin})` +
          (e.note ? ` ${e.note}` : "") +
          (e.removed.length ? ` would remove ${e.removed.length}: ${e.removed.slice(0, 6).join(" ")}` : ""),
      );
    }
    fs.writeFileSync(
      REPORT_PATH,
      JSON.stringify(entries.map(({ next: _next, ...e }) => e), null, 1),
    );
    console.log(`Full report: ${REPORT_PATH}`);

    if (!apply) {
      console.log("\nDry run — nothing written. Re-run with --apply to update.");
      return;
    }
    if (updates.length === 0) {
      console.log("Nothing to update.");
      return;
    }

    // ── Apply: back up, then update in one transaction ──
    await client.query("BEGIN");
    try {
      const ids = updates.map((e) => e.programId);
      const locked = await client.query(
        `SELECT "programId", "curriculumJson" FROM curriculums
          WHERE "programId" = ANY($1) FOR UPDATE`,
        [ids],
      );
      for (const row of locked.rows) {
        if (JSON.stringify(row.curriculumJson) !== JSON.stringify(db.get(row.programId))) {
          throw new Error(`${row.programId} changed since it was read; re-run.`);
        }
      }
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const backup = path.join(
        BACKUP_DIR,
        `curriculums-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );
      fs.writeFileSync(backup, JSON.stringify(locked.rows));
      console.log(`\nBacked up ${locked.rows.length} rows to ${backup}`);

      for (const e of updates) {
        const r = await client.query(
          `UPDATE curriculums SET "curriculumJson" = $2 WHERE "programId" = $1`,
          [e.programId, e.next],
        );
        if (r.rowCount !== 1) throw new Error(`${e.programId}: update hit ${r.rowCount} rows`);
      }
      await client.query("COMMIT");
      console.log(`Updated ${updates.length} curricula.`);
      console.log(`Undo with: npx tsx scripts/reingest-curricula.ts --restore=${backup}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
