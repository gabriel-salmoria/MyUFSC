import { parsePDF } from "../../scrapers/curriculum/parser.js";
const res = parsePDF("data/pdfs/done/102_20111.pdf");
console.log(`Phases found: ${res.totalPhases}`);
const phaseCounts: Record<string, number> = {};
res.courses.forEach(c => {
  const phase = String(c[8]);
  phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
});
console.log(phaseCounts);
