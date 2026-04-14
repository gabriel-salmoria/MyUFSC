import { parsePDF } from "../../scrapers/curriculum/parser.js";
import fs from "fs";
import path from "path";

const pdfDir = "data/pdfs";
const files = fs.readdirSync(pdfDir).filter(f => f.endsWith(".pdf"));

for (const file of files) {
  console.log(`\nEvaluating ${file}...`);
  try {
    const result = parsePDF(path.join(pdfDir, file));
    console.log(`- Course: ${result.name} (${result.id}_${result.version})`);
    console.log(`- Total Phases: ${result.totalPhases}`);
    console.log(`- Total Courses: ${result.courses.length}`);
    
    let emptyDesc = 0;
    let longName = 0;
    let anomalies = [];

    for (const [id, name, aulas, ha, desc, prereq, equiv, isOb, phase] of result.courses) {
      if (!desc || desc.length < 10) emptyDesc++;
      if (name.length > 100) {
        longName++;
        anomalies.push(`Long name: ${name.substring(0, 50)}...`);
      }
      if (desc.includes("CURR") || desc.includes("SeTIC") || desc.includes("Página")) {
        anomalies.push(`Noise in desc for ${id}: ${desc.substring(0, 50)}...`);
      }
    }
    
    console.log(`- Empty/Short Descriptions: ${emptyDesc}`);
    console.log(`- Suspicious Long Names: ${longName}`);
    if (anomalies.length > 0) {
      console.log(`- Anomalies (first 5):`);
      anomalies.slice(0, 5).forEach(a => console.log(`  * ${a}`));
    }
  } catch (err) {
    console.error(`Error parsing ${file}:`, err.message);
  }
}
