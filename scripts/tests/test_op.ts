import { parsePDF } from "../scrapers/curriculum/parser.js";
import fs from "fs";

let opWithPhase = 0;
let files = fs.readdirSync("data/pdfs/done").filter(f => f.endsWith(".pdf"));
for (const file of files) {
  try {
    const res = parsePDF("data/pdfs/done/" + file);
    for (const c of res.courses) {
      if (!c[7]) { // c[7] is isMandatory. So false means Op.
        if (c[8] !== null) opWithPhase++;
      }
    }
  } catch (e) {}
}
console.log("Op courses with a non-null phase:", opWithPhase);
