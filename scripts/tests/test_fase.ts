import { parsePDF } from "../scrapers/curriculum/parser.js";

const res = parsePDF("data/pdfs/done/102_20111.pdf");
console.log(`Phases found: ${res.totalPhases}`);
