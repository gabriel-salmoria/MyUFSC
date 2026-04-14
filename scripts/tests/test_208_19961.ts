import { parsePDF } from "../scrapers/curriculum/parser.js";
const res = parsePDF("data/pdfs/done/208_19961.pdf");
const coursesInPhase8 = res.courses.filter(c => c[8] === 8);
console.log(`Courses in phase 8: ${coursesInPhase8.length}`);
console.log(`Total Optionals: ${res.courses.filter(c => c[8] === null).length}`);
console.log(coursesInPhase8.slice(0, 5).map(c => c[1]));
