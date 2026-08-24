/**
 * scripts/migrate-retag-complementares.ts
 *
 * One-off migration for issue #11: re-tag non-discipline graduation
 * requirements (Atividades Complementares) from `mandatory` to `optional` in
 * every stored curriculum's `curriculumJson.courses`, so consumers see correct
 * data at rest instead of relying on the runtime name-based filter.
 *
 * Pure transform is `retagNonDisciplineRequirements` (lib/curriculum-tagging) —
 * this script only reads each curriculum, applies it, and writes back the rows
 * that actually changed.
 *
 * Usage:
 *   npx tsx scripts/migrate-retag-complementares.ts            # dry-run (default)
 *   npx tsx scripts/migrate-retag-complementares.ts --apply    # write changes
 *
 * Requirements: NEON_URL or local PGlite (.dev-db/) must be accessible.
 */

import * as dotenv from "dotenv";
import { executeQuery } from "@/database/ready";
import { retagNonDisciplineRequirements } from "@/lib/curriculum-tagging";

dotenv.config();

const APPLY = process.argv.includes("--apply");

async function main() {
  const result = await executeQuery(
    `SELECT "programId", "curriculumJson" FROM curriculums`,
  );
  const rows = result.rows as Array<{ programId: string; curriculumJson: any }>;

  let scanned = 0;
  let changed = 0;

  for (const row of rows) {
    scanned++;
    const json = row.curriculumJson;
    if (!json || !Array.isArray(json.courses)) continue;

    const before = JSON.stringify(json.courses);
    const retagged = retagNonDisciplineRequirements(json.courses);
    const after = JSON.stringify(retagged);
    if (before === after) continue;

    changed++;
    console.log(`• ${row.programId}: re-tagged non-discipline requirement(s)`);

    if (APPLY) {
      const nextJson = { ...json, courses: retagged };
      await executeQuery(
        `UPDATE curriculums SET "curriculumJson" = $1 WHERE "programId" = $2`,
        [nextJson, row.programId],
      );
    }
  }

  console.log(
    `\n${APPLY ? "Applied" : "Dry-run"}: ${changed} of ${scanned} curriculum(s) ` +
      `need re-tagging.${APPLY ? "" : " Re-run with --apply to write changes."}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
