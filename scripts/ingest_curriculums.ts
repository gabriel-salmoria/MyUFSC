import { Client } from "pg";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";
import { parsePDF } from "../scrapers/curriculum/parser.js";

dotenv.config();

const DB_CONNECTION_STRING = process.env.NEON_URL;
if (!DB_CONNECTION_STRING) {
  console.error("NEON_URL is not set.");
  process.exit(1);
}

const PDFS_DIR = path.join(process.cwd(), "data/pdfs");
const DONE_DIR = path.join(PDFS_DIR, "done");
const COURSE_NAMES_FILE = path.join(PDFS_DIR, "course_names.json");

function getCourseNames() {
  if (fs.existsSync(COURSE_NAMES_FILE)) {
    return JSON.parse(fs.readFileSync(COURSE_NAMES_FILE, "utf-8"));
  }
  return {};
}

function titleCase(str: string): string {
  const exceptions = [
    "e",
    "em",
    "da",
    "do",
    "de",
    "das",
    "dos",
    "com",
    "para",
    "por",
    "sem",
    "a",
    "o",
    "as",
    "os",
    "na",
    "no",
    "nas",
    "nos",
  ];
  return str
    .toLowerCase()
    .split(" ")
    .map((word: string, i: number) => {
      if (i !== 0 && exceptions.includes(word)) return word;
      if (word.startsWith("("))
        return "(" + word.charAt(1).toUpperCase() + word.slice(2);
      if (word.match(/^[ivx]+$/)) return word.toUpperCase(); // Handle roman numerals like I, II, III, IV, IX, V
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function getCampusCode(rawName: string): string {
  const lower = rawName.toLowerCase();
  if (lower.includes("ararangu")) return "ARA";
  if (lower.includes("blumenau")) return "BLN";
  if (lower.includes("curitibanos")) return "CBS";
  if (lower.includes("joinville")) return "JOI";
  return "FLO";
}

function getLatestSchedule(
  campusCode: string,
): { file: string; semester: string } | null {
  const SCHEDULE_DIR = path.join(process.cwd(), "data/schedule");
  if (!fs.existsSync(SCHEDULE_DIR)) return null;
  const files = fs.readdirSync(SCHEDULE_DIR);
  const semesterFiles = files
    .filter((f) => f.endsWith(`-${campusCode}.json`))
    .map((f) => {
      const match = f.match(/^(\d{4})(\d)-[A-Z]{3}\.json$/);
      if (!match) return null;
      const year = parseInt(match[1]);
      const semester = parseInt(match[2]);
      return {
        file: path.join(SCHEDULE_DIR, f),
        year,
        semester,
        fullCode: `${year}${semester}`,
      };
    })
    .filter((f) => f !== null && f.year <= 2030);

  if (semesterFiles.length === 0) return null;
  semesterFiles.sort((a, b) => {
    if (a!.year !== b!.year) return b!.year - a!.year;
    return b!.semester - a!.semester;
  });
  return { file: semesterFiles[0]!.file, semester: semesterFiles[0]!.fullCode };
}

function formatProgramName(
  courseId: string,
  rawName: string,
  version: string,
): string {
  // Remove trailing details like [Campus Florianópolis] or - Campus
  let cleanedName = rawName.replace(/\[Campus.*?\]/gi, "").trim();
  cleanedName = cleanedName.replace(/-\s*Campus.*?$/gi, "").trim();

  // Also remove trailing (Bacharelado) or (Licenciatura) if we want? Let's keep it for distinction.

  cleanedName = titleCase(cleanedName);

  const semStr = String(version);
  if (semStr.length === 5) {
    cleanedName = `${cleanedName} (${semStr.substring(0, 4)}.${semStr.substring(4)})`;
  } else if (semStr.length === 4) {
    // Edge case if someone just used 2024
    cleanedName = `${cleanedName} (${semStr})`;
  }

  return cleanedName;
}

async function ingest() {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();

  const courseNames = getCourseNames();

  if (!fs.existsSync(DONE_DIR)) {
    fs.mkdirSync(DONE_DIR, { recursive: true });
  }

  // Find all PDFs in data/pdfs and data/pdfs/done
  let pdfFiles: string[] = [];
  if (fs.existsSync(PDFS_DIR)) {
    pdfFiles = pdfFiles.concat(
      fs
        .readdirSync(PDFS_DIR)
        .filter((f) => f.endsWith(".pdf"))
        .map((f) => path.join(PDFS_DIR, f)),
    );
  }
  if (fs.existsSync(DONE_DIR)) {
    pdfFiles = pdfFiles.concat(
      fs
        .readdirSync(DONE_DIR)
        .filter((f) => f.endsWith(".pdf"))
        .map((f) => path.join(DONE_DIR, f)),
    );
  }

  let totalUpserted = 0;

  try {
    for (const pdfPath of pdfFiles) {
      const filename = path.basename(pdfPath);
      const match = filename.match(/^(\d+)_(\d+)\.pdf$/);
      if (!match) continue;

      const courseIdRaw = match[1];
      const versionRaw = match[2];

      const programId = `${courseIdRaw}_${versionRaw}`;

      // Check if already in DB to avoid unnecessary parsing and clearly skip
      const checkRes = await client.query(
        'SELECT 1 FROM curriculums WHERE "programId" = $1',
        [programId],
      );
      if (checkRes.rowCount && checkRes.rowCount > 0) {
        console.log(`Skipping ${programId} -> Already exists in DB.`);

        // Move to done directory if not already there
        if (!pdfPath.includes(DONE_DIR)) {
          fs.renameSync(pdfPath, path.join(DONE_DIR, filename));
        }
        continue;
      }

      let curriculumData;
      try {
        curriculumData = parsePDF(pdfPath);
      } catch (e: any) {
        console.warn(`Failed to parse ${filename}:`, e.message);
        continue;
      }

      // Override ID and version to ensure consistency
      curriculumData.id = parseInt(courseIdRaw);
      curriculumData.version = parseInt(versionRaw);

      // Attempt to get name from course_names.json, fallback to parsed.name
      let rawProgramName = courseNames[courseIdRaw];
      if (!rawProgramName && curriculumData.name) {
        // Parsed name looks like "208 - CIÊNCIAS DA COMPUTAÇÃO"
        const nMatch = curriculumData.name.match(/^\d+\s*-\s*(.+)$/);
        rawProgramName = nMatch ? nMatch[1] : curriculumData.name;
      } else if (!rawProgramName) {
        rawProgramName = `Curso ${courseIdRaw}`;
      }

      const formattedName = formatProgramName(
        courseIdRaw,
        rawProgramName,
        versionRaw,
      );

      console.log(`Upserting ${programId} -> ${formattedName}`);

      // 1. Upsert Program
      await client.query(
        `
        INSERT INTO programs ("id", "name")
        VALUES ($1, $2)
        ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED.name;
        `,
        [programId, formattedName],
      );

      // 2. Upsert Curriculum (WITH TESTING FLAG)
      const res = await client.query(
        `
        INSERT INTO curriculums ("programId", "curriculumJson", "testing")
        VALUES ($1, $2, $3)
        ON CONFLICT ("programId") DO NOTHING;
        `,
        [programId, curriculumData, true],
      );

      if (res.rowCount && res.rowCount > 0) {
        totalUpserted++;
        console.log(` -> Added successfully as testing.`);

        // Schedule Processing
        const campusCode = getCampusCode(rawProgramName);
        const scheduleInfo = getLatestSchedule(campusCode);

        if (scheduleInfo) {
          const tempCurr = path.join(
            process.cwd(),
            "data/pdfs/temp_curriculum.json",
          );
          const tempClasses = path.join(
            process.cwd(),
            "data/pdfs/temp_classes.json",
          );
          fs.writeFileSync(tempCurr, JSON.stringify(curriculumData));

          try {
            execSync(
              `npx tsx scrapers/separator/index.ts "${tempCurr}" "${scheduleInfo.file}" "${tempClasses}"`,
              { stdio: "pipe" },
            );
            const classesData = JSON.parse(
              fs.readFileSync(tempClasses, "utf-8"),
            );

            await client.query(
              `
              INSERT INTO schedules ("programId", "semester", "scheduleJson")
              VALUES ($1, $2, $3)
              ON CONFLICT ("programId", "semester") DO UPDATE SET "scheduleJson" = EXCLUDED."scheduleJson";
              `,
              [programId, scheduleInfo.semester, classesData],
            );
            console.log(
              ` -> Schedule updated for ${scheduleInfo.semester} (${campusCode}).`,
            );
          } catch (err: any) {
            console.warn(
              ` -> Failed to separate/upsert schedule: ${err.message}`,
            );
          } finally {
            if (fs.existsSync(tempCurr)) fs.unlinkSync(tempCurr);
            if (fs.existsSync(tempClasses)) fs.unlinkSync(tempClasses);
          }
        } else {
          console.warn(` -> No schedule found for campus ${campusCode}.`);
        }

        // Move to done directory after successful ingestion
        if (!pdfPath.includes(DONE_DIR)) {
          fs.renameSync(pdfPath, path.join(DONE_DIR, filename));
        }
      }
    }

    console.log(
      `\nFinished! Upserted ${totalUpserted} new curriculums into DB.`,
    );
  } finally {
    await client.end();
  }
}

ingest().catch(console.error);
