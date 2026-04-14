import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const client = new Client({ connectionString: process.env.NEON_URL });
  await client.connect();

  const res = await client.query('SELECT "programId", "curriculumJson" FROM curriculums WHERE testing = true');
  
  console.log(`Found ${res.rows.length} testing curriculums.\n`);

  for (const row of res.rows) {
    const id = row.programId;
    const json = row.curriculumJson;
    const courses = json.courses || [];
    
    const phaseCounts: Record<string, number> = {};
    let hasOptionals = false;
    let optionalsInPhases = 0;

    for (const c of courses) {
      const phase = c[8]; // phase index
      const type = c[7]; // isMandatory (boolean)
      
      const phaseKey = phase === null ? "null" : String(phase);
      phaseCounts[phaseKey] = (phaseCounts[phaseKey] || 0) + 1;

      if (type === false) {
        hasOptionals = true;
        if (phase !== null) {
          optionalsInPhases++;
        }
      }
    }

    let isAnomalous = false;
    let anomalyReasons = [];

    for (const [phase, count] of Object.entries(phaseCounts)) {
      if (phase !== "null" && count >= 15) {
        isAnomalous = true;
        anomalyReasons.push(`Phase ${phase} has ${count} courses`);
      }
    }

    if (hasOptionals && optionalsInPhases > 5 && (phaseCounts["null"] || 0) === 0) {
      // isAnomalous = true; // Maybe not strictly anomalous, but suspicious
      anomalyReasons.push(`${optionalsInPhases} optional courses found assigned to specific phases instead of null`);
    }

    if (isAnomalous || anomalyReasons.length > 0) {
      console.log(`Anomaly in ${id} (${json.name}):`);
      anomalyReasons.forEach(r => console.log(`  - ${r}`));
    }
  }

  await client.end();
}

main().catch(console.error);
