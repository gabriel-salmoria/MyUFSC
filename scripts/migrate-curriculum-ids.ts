/**
 * scripts/migrate-curriculum-ids.ts
 *
 * Interactively renames curriculum programIds to versioned form (e.g. 208 → 208_2019).
 * Also cascades the rename to the schedules table.
 *
 * Usage:
 *   npx tsx scripts/migrate-curriculum-ids.ts
 *
 * Requirements: NEON_URL or local PGlite (.dev-db/) must be accessible.
 */

import * as readline from "readline";
import * as dotenv from "dotenv";
import { executeQuery, executeTransaction } from "@/database/ready";

dotenv.config();

// ── Colours ───────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const log = {
  info: (m: string) => console.log(`${c.cyan}ℹ${c.reset}  ${m}`),
  ok: (m: string) => console.log(`${c.green}✔${c.reset}  ${m}`),
  warn: (m: string) => console.log(`${c.yellow}⚠${c.reset}  ${m}`),
  err: (m: string) => console.log(`${c.red}✖${c.reset}  ${m}`),
  header: (m: string) =>
    console.log(`\n${c.bold}${c.magenta}══ ${m} ══${c.reset}\n`),
};

// ── Readline helper ───────────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── Validation ────────────────────────────────────────────────────────────────
/**
 * A valid versioned ID must start with the base programId followed by an
 * underscore and a 5-digit semester code (YYYYS), e.g. "208_20191".
 * We also accept the bare base if the user just wants to keep it (skip).
 */
function validateNewId(baseId: string, input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return "Input cannot be empty.";
  // Allow keeping the same ID (no-op / skip signal handled by caller)
  if (trimmed === baseId) return null;
  // Must start with baseId + underscore
  if (!trimmed.startsWith(`${baseId}_`)) {
    return `Must start with "${baseId}_" (e.g. ${baseId}_20191).`;
  }
  const suffix = trimmed.slice(baseId.length + 1);
  if (!/^\d{4}[12]$/.test(suffix)) {
    return `Suffix must be a semester code — 4-digit year + 1 or 2 (e.g. 20191, 20072). Got: "${suffix}".`;
  }
  return null; // valid
}

// ── DB helpers ────────────────────────────────────────────────────────────────
interface CurriculumRow {
  programId: string;
  name: string | null;         // from programs join (may be null)
  scheduleCount: number;
  yearHint: string | null;     // pulled from JSON if available
}

async function listCurriculums(): Promise<CurriculumRow[]> {
  const result = await executeQuery(`
    SELECT
      c."programId",
      p.name,
      COUNT(s.semester)::int AS "scheduleCount",
      c."curriculumJson"->>'year' AS "yearHint"
    FROM curriculums c
    LEFT JOIN programs p ON p.id = c."programId"
    LEFT JOIN schedules s ON s."programId" = c."programId"
    GROUP BY c."programId", p.name, c."curriculumJson"->>'year'
    ORDER BY c."programId"
  `);
  return result.rows as CurriculumRow[];
}

async function renameId(oldId: string, newId: string): Promise<void> {
  // We cannot UPDATE a primary key that is referenced by a non-deferrable FK.
  // Instead: copy the row under the new ID, re-point schedules, delete the old.
  // Each step is individually FK-valid — no deferred constraints needed.
  await executeTransaction([
    {
      // 1. Duplicate curriculum row with new ID
      sql: `INSERT INTO curriculums ("programId", "curriculumJson")
            SELECT $1, "curriculumJson" FROM curriculums WHERE "programId" = $2`,
      params: [newId, oldId],
    },
    {
      // 2. Point schedules at new ID (now exists, so FK is satisfied)
      sql: `UPDATE schedules SET "programId" = $1 WHERE "programId" = $2`,
      params: [newId, oldId],
    },
    {
      // 3. Remove old curriculum row (no longer referenced by any schedule)
      sql: `DELETE FROM curriculums WHERE "programId" = $1`,
      params: [oldId],
    },
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log.header("Curriculum ID Migration");
  log.info("This script renames curriculum programIds to versioned form.");
  log.info(`Format: ${c.bold}208${c.reset} → ${c.bold}208_20191${c.reset}  (semester code: YYYYS)\n`);

  const rows = await listCurriculums();

  if (rows.length === 0) {
    log.warn("No curricula found in the database. Nothing to do.");
    rl.close();
    return;
  }

  log.info(`Found ${c.bold}${rows.length}${c.reset} curriculum(s):\n`);
  for (const row of rows) {
    const namePart = row.name ? `  ${c.dim}(${row.name})${c.reset}` : "";
    const yearPart = row.yearHint
      ? `  ${c.dim}year hint: ${row.yearHint}${c.reset}`
      : "";
    const schedPart = `  ${c.dim}${row.scheduleCount} schedule(s)${c.reset}`;
    console.log(
      `  ${c.bold}${row.programId}${c.reset}${namePart}${yearPart}${schedPart}`,
    );
  }
  console.log();

  const results: { old: string; new: string; action: string }[] = [];

  for (const row of rows) {
    console.log(`\n${c.bold}${c.cyan}─────────────────────────────${c.reset}`);
    console.log(
      `${c.bold}Updating:${c.reset} ${c.yellow}${row.programId}${c.reset}`,
    );
    if (row.name) console.log(`  Program name  : ${row.name}`);
    if (row.yearHint) console.log(`  Year (from JSON): ${row.yearHint}`);
    console.log(`  Linked schedules: ${row.scheduleCount}`);
    console.log(`\n  Enter new versioned ID, or press ${c.bold}Enter${c.reset} to skip.`);

    let newId = "";
    while (true) {
      const raw = await ask(
        `  ${c.bold}${row.programId}${c.reset} → `,
      );

      if (raw.trim() === "") {
        log.warn(`Skipping ${row.programId}.`);
        results.push({ old: row.programId, new: row.programId, action: "skipped" });
        break;
      }

      const err = validateNewId(row.programId, raw);
      if (err) {
        log.err(`Invalid ID: ${err}`);
        continue; // re-prompt
      }

      newId = raw.trim();

      // Confirmation
      console.log(
        `\n  ${c.bold}About to rename:${c.reset}  ${c.yellow}${row.programId}${c.reset} → ${c.green}${newId}${c.reset}`,
      );
      console.log(
        `  This will also update ${row.scheduleCount} schedule row(s).`,
      );
      const confirm = await ask(`  Confirm? [y/N] `);

      if (confirm.trim().toLowerCase() !== "y") {
        log.warn("Cancelled — re-entering.");
        continue;
      }

      // Execute
      try {
        await renameId(row.programId, newId);
        log.ok(`Renamed ${row.programId} → ${newId}`);
        results.push({ old: row.programId, new: newId, action: "renamed" });
      } catch (e: any) {
        log.err(`DB error: ${e.message}`);
        const retry = await ask(`  Retry with a different ID? [y/N] `);
        if (retry.trim().toLowerCase() !== "y") {
          results.push({ old: row.programId, new: row.programId, action: "error" });
        } else {
          continue;
        }
      }
      break;
    }
  }

  // Summary
  log.header("Migration Summary");
  for (const r of results) {
    if (r.action === "renamed") {
      console.log(`  ${c.green}✔${c.reset} ${r.old} → ${r.new}`);
    } else if (r.action === "skipped") {
      console.log(`  ${c.dim}– ${r.old} (skipped)${c.reset}`);
    } else {
      console.log(`  ${c.red}✖ ${r.old} (error)${c.reset}`);
    }
  }
  console.log();

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
