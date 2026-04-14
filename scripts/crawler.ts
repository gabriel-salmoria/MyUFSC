import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROGRESS_FILE = path.join(__dirname, "crawler-progress.json");
const OUTPUT_DIR = path.join(__dirname, "../data/pdfs");
const DONE_DIR = path.join(OUTPUT_DIR, "done");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(DONE_DIR)) {
  fs.mkdirSync(DONE_DIR, { recursive: true });
}

let dbClient: Client | null = null;
if (process.env.NEON_URL) {
  dbClient = new Client({ connectionString: process.env.NEON_URL });
  dbClient.connect().catch(console.error);
}

interface Progress {
  courseId: number;
  year: number;
  semester: number;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return { courseId: 1, year: new Date().getFullYear() + 2, semester: 2 };
}

function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchCurriculum(courseId: number, curriculumId: string) {
  const url = `https://cagr.sistemas.ufsc.br/relatorios/curriculoCurso?curso=${courseId}&curriculo=${curriculumId}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return false;

    const sizeStr = res.headers.get("content-length");
    const size = sizeStr ? parseInt(sizeStr, 10) : 0;

    if (size > 0 && size < 30000) {
      return false;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 30000) {
      return false;
    }

    const tempFilePath = path.join(
      OUTPUT_DIR,
      `temp_${courseId}_${curriculumId}.pdf`,
    );
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    let extractedCourseId = courseId.toString();
    let extractedCurriculumId = curriculumId;

    try {
      const text = execSync(`pdftotext "${tempFilePath}" -`, {
        encoding: "utf-8",
      });

      const courseMatch = text.match(
        /(?:Curso:|Curr[íi]culo:)[\s\S]{0,150}?(?:^|\s)(\d{1,3})\s+-\s+([^\r\n]+)/im,
      );
      const currMatch = text.match(
        /(?:Curso:|Curr[íi]culo:)[\s\S]{0,150}?(?:^|\s)(\d{4,5})(?:\s|$)/im,
      );

      if (currMatch && currMatch[1]) extractedCurriculumId = currMatch[1];
      if (courseMatch && courseMatch[1]) {
        extractedCourseId = courseMatch[1];

        // Save course name
        const courseName = courseMatch[2].trim();
        const namesFile = path.join(OUTPUT_DIR, "course_names.json");
        let names: Record<string, string> = {};
        if (fs.existsSync(namesFile)) {
          names = JSON.parse(fs.readFileSync(namesFile, "utf8"));
        }
        names[extractedCourseId] = courseName;
        fs.writeFileSync(namesFile, JSON.stringify(names, null, 2));
      }
    } catch (err) {
      console.warn(`[WARN] pdftotext failed for ${tempFilePath}`);
    }

    const finalFileName = `${extractedCourseId}_${extractedCurriculumId}.pdf`;
    let finalFilePath = path.join(OUTPUT_DIR, finalFileName);
    const doneFilePath = path.join(DONE_DIR, finalFileName);

    let existsInDb = false;
    if (dbClient) {
      try {
        const res = await dbClient.query(
          'SELECT 1 FROM curriculums WHERE "programId" = $1',
          [`${extractedCourseId}_${extractedCurriculumId}`],
        );
        if (res.rowCount && res.rowCount > 0) {
          existsInDb = true;
        }
      } catch (err) {
        console.warn(
          `[WARN] DB check failed for ${extractedCourseId}_${extractedCurriculumId}`,
        );
      }
    }

    if (existsInDb) {
      console.log(`[SKIP] Already in DB: ${finalFileName}`);
      fs.renameSync(tempFilePath, doneFilePath);
      return true;
    }

    if (fs.existsSync(finalFilePath) || fs.existsSync(doneFilePath)) {
      console.log(`[SKIP] Already exists locally: ${finalFileName}`);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return true;
    }

    fs.renameSync(tempFilePath, finalFilePath);

    console.log(
      `[SUCCESS] Downloaded and saved: ${finalFileName} (${buffer.byteLength} bytes)`,
    );
    return true;
  } catch (error) {
    console.error(
      `[ERROR] Failed to fetch curso ${courseId} curriculo ${curriculumId}`,
    );
    return false;
  }
}

async function runCrawler() {
  const progress = loadProgress();
  const maxCourseId = 999;
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 2;

  console.log(
    `Starting crawler from Course ${progress.courseId}, Year ${progress.year}.${progress.semester}`,
  );

  for (let c = progress.courseId; c <= maxCourseId; c++) {
    const checkUrl = `https://cagr.sistemas.ufsc.br/relatorios/curriculoCurso?curso=${c}`;
    try {
      const checkRes = await fetch(checkUrl);
      if (!checkRes.ok) {
        console.log(`[SKIP] Course ${c} failed to respond.`);
      } else {
        const buffer = await checkRes.arrayBuffer();
        if (buffer.byteLength < 30000) {
          console.log(`[SKIP] Course ${c} does not exist (empty PDF).`);
        } else {
          console.log(`[INFO] Course ${c} exists! Crawling curriculums...`);

          let startYear = c === progress.courseId ? progress.year : maxYear;
          let startSem = c === progress.courseId ? progress.semester : 2;
          let curriculumsFound = 0;

          for (let y = startYear; y >= 1990; y--) {
            for (let s = y === startYear ? startSem : 2; s >= 1; s--) {
              if (curriculumsFound >= 2) break;

              const curriculoId = `${y}${s}`;
              const found = await fetchCurriculum(c, curriculoId);
              if (found) {
                curriculumsFound++;
              }

              progress.courseId = c;
              progress.year = y;
              progress.semester = s;
              saveProgress(progress);

              await sleep(100);
            }
            if (curriculumsFound >= 2) break;
          }
        }
      }
    } catch (e) {
      console.error(`[ERROR] during course ${c} check:`, e);
      await sleep(1000);
    }

    progress.courseId = c + 1;
    progress.year = maxYear;
    progress.semester = 2;
    saveProgress(progress);
  }

  console.log("Crawler finished!");
  if (dbClient) {
    await dbClient.end();
  }
}

runCrawler().catch((err) => {
  console.error(err);
  if (dbClient) {
    dbClient.end();
  }
});
