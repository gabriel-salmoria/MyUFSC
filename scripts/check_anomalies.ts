import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const client = new Client({ connectionString: process.env.NEON_URL });
  await client.connect();

  const res = await client.query('SELECT "programId", "curriculumJson" FROM curriculums');

  console.log(`Found ${res.rows.length} total curriculums.\n`);

  const empty: string[] = [];
  const anomalous: string[] = [];

  for (const row of res.rows) {
    const id = row.programId;
    const json = row.curriculumJson;
    const courses: any[] = json.courses || [];

    if (courses.length === 0) {
      empty.push(`${id} (${json.name}) — no courses at all`);
      continue;
    }

    const phaseCounts: Record<string, number> = {};
    let mandatoryCount = 0;
    let mandatoryNullPhase = 0;
    let optionalCount = 0;

    for (const c of courses) {
      const phase = Array.isArray(c) ? c[8] : c.phase;
      const isMandatory = Array.isArray(c) ? c[7] === true : (c.type === "mandatory" || c.type === true);

      const phaseKey = phase == null ? "null" : String(phase);
      phaseCounts[phaseKey] = (phaseCounts[phaseKey] || 0) + 1;

      if (isMandatory) {
        mandatoryCount++;
        if (phase == null) mandatoryNullPhase++;
      } else {
        optionalCount++;
      }
    }

    // Empty curriculum: has courses but NONE are mandatory
    if (mandatoryCount === 0 && courses.length > 0) {
      empty.push(
        `${id} (${json.name}) — ${courses.length} courses, all optional (0 mandatory). Phase dist: ${JSON.stringify(phaseCounts)}`
      );
      continue;
    }

    // Ghost mandatory: all mandatory courses have null phase (won't appear in visualizer)
    if (mandatoryCount > 0 && mandatoryNullPhase === mandatoryCount) {
      empty.push(
        `${id} (${json.name}) — ${mandatoryCount} mandatory courses all with null phase (invisible in visualizer). Total courses: ${courses.length}`
      );
      continue;
    }

    // Anomaly: a single non-null phase has suspiciously many courses
    const anomalyReasons: string[] = [];
    for (const [phase, count] of Object.entries(phaseCounts)) {
      if (phase !== "null" && count >= 15) {
        anomalyReasons.push(`Phase ${phase} has ${count} courses`);
      }
    }

    if (anomalyReasons.length > 0) {
      anomalous.push(`${id} (${json.name}): ${anomalyReasons.join(", ")}`);
    }
  }

  if (empty.length > 0) {
    console.log(`=== EMPTY / NO-MANDATORY CURRICULA (${empty.length}) ===`);
    empty.forEach((e) => console.log("  •", e));
    console.log();
  } else {
    console.log("No empty curricula found.\n");
  }

  if (anomalous.length > 0) {
    console.log(`=== OTHER ANOMALIES (${anomalous.length}) ===`);
    anomalous.forEach((a) => console.log("  •", a));
    console.log();
  } else {
    console.log("No other anomalies found.\n");
  }

  await client.end();
}

main().catch(console.error);
