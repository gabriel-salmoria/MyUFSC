import { parsePDF } from "../../scrapers/curriculum/parser.js";
const res = parsePDF("data/pdfs/done/102_20111.pdf");
console.log(`Phases found: ${res.totalPhases}`);
const phaseCounts: any = {};
res.courses.forEach(c => {
  phaseCounts[c[8]] = (phaseCounts[c[8]] || 0) + 1;
});
console.log(phaseCounts);
