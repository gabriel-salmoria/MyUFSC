import { parsePDF } from "../scrapers/curriculum/parser.js";
import fs from "fs";

let files = fs.readdirSync("data/pdfs/done").filter(f => f.endsWith(".pdf"));
for (const file of files) {
  try {
    const res = parsePDF("data/pdfs/done/" + file);
    let seenOp = false;
    for (const c of res.courses) {
      if (!c[7]) {
        seenOp = true;
      } else if (seenOp) {
        // We saw an Ob course AFTER an Op course!
        console.log(`In ${file}, Ob course ${c[0]} appeared after an Op course.`);
        break;
      }
    }
  } catch (e) {}
}
