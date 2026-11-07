import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { Client } from "pg";
import * as dotenv from "dotenv";
import { retagNonDisciplineRequirements } from "../lib/curriculum-tagging";
import { parsePDF } from "../scrapers/curriculum/parser";
import {
  bestCampusFile,
  curriculumCourseIds,
  listScheduleFiles,
  type Campus,
} from "./schedule-files";

dotenv.config();

const execAsync = promisify(exec);

// --- Configuration ---
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
// const GENERATED_DIR = path.join(DATA_DIR, "generated"); // Removed in favor of direct data subdirs
const SCHEDULE_DIR = path.join(DATA_DIR, "schedule");
const SCRAPERS_DIR = path.join(PROJECT_ROOT, "scrapers");

// Input Paths
const args = process.argv.slice(2);
function getArgValue(argName: string): string | null {
  const index = args.findIndex(
    (a) => a === argName || a.startsWith(`${argName}=`),
  );
  if (index === -1) return null;

  // Handle --flag=value
  if (args[index].startsWith(`${argName}=`)) {
    return args[index].split("=")[1];
  }

  // Handle --flag value
  if (index + 1 < args.length) {
    return args[index + 1];
  }

  return null;
}

const customPdfPath = getArgValue("--pdf") || getArgValue("--curriculum");
const CURRICULUM_PDF = customPdfPath
  ? path.resolve(process.cwd(), customPdfPath)
  : path.join(DATA_DIR, "curriculum.PDF");

// Output Paths
const SCHEDULE_JSON_OUTPUT = path.join(DATA_DIR, "schedule_raw.json"); // Provide a link or copy? Or just use one from schedule dir.
const CURRICULUM_JSON_OUTPUT = path.join(DATA_DIR, "curriculum.json");
const CURRICULUM_FULL_JSON_OUTPUT = path.join(DATA_DIR, "curriculum_full.json");
const CLASSES_JSON_OUTPUT = path.join(DATA_DIR, "classes.json");

// Scraper Paths
const SCHEDULE_SCRAPER_DIR = path.join(SCRAPERS_DIR, "schedule");
const GEMINI_SCRIPT = path.join(SCRAPERS_DIR, "curriculum", "gemini.js");
const SEPARATOR_SCRIPT = path.join(SCRAPERS_DIR, "separator", "index.ts");

// Database Config
const DB_CONNECTION_STRING = process.env.NEON_URL;

// --- Helpers ---
// --- Helpers ---

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const logger = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) =>
    console.log(`${colors.green}✔${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✖${colors.reset} ${msg}`),
  step: (step: number, title: string) =>
    console.log(
      `\n${colors.bright}${colors.magenta}[Step ${step}]${colors.reset} ${title}`,
    ),
  substep: (msg: string) =>
    console.log(`  ${colors.dim}└─${colors.reset} ${msg}`),
  header: (msg: string) =>
    console.log(
      `\n${colors.bright}${colors.cyan}=== ${msg} ===${colors.reset}\n`,
    ),
};

async function runCommand(command: string, cwd: string, description?: string) {
  if (description) {
    logger.substep(`${description}...`);
  } else {
    // logger.substep(`Running: ${command}`);
  }

  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    // Only log stdout/stderr if there looks like a real error or if we want verbose logs.
    // For now, let's keep it clean and only show stderr if it looks like a failure (which execAsync usually catches)
    // or just rely on the fact that if it throws, we catch it.
    // Some tools print warnings to stderr, we might want to suppress them or show them if relevant.
    return stdout;
  } catch (error: any) {
    logger.error(`Command failed: ${command}`);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.substep(`Created directory: ${path.relative(PROJECT_ROOT, dir)}`);
  }
}

// --- Main Pipeline ---

let SELECTED_SCHEDULE_FILE = "";
let SELECTED_SCHEDULE_FILES: Partial<Record<Campus, string>> = {};
let SELECTED_SEMESTER = "";

async function scrapeSchedule() {
  logger.step(1, "Scraping Schedule (Rust)");

  const force = args.includes("--force") || args.includes("-f");
  const forceFlag = force ? "--force" : "";

  await runCommand(
    `cargo run --release -- ${forceFlag}`,
    SCHEDULE_SCRAPER_DIR,
    "Running Rust Scraper",
  );

  // Latest semester with real data (skips empty files and bogus codes like 26261).
  const latest = listScheduleFiles(SCHEDULE_DIR)[0];
  if (!latest) {
    throw new Error(`No non-empty schedule files found in ${SCHEDULE_DIR}.`);
  }
  SELECTED_SEMESTER = latest.semester;
  SELECTED_SCHEDULE_FILES = latest.files;
  logger.substep(
    `Selected latest semester: ${colors.bright}${latest.semester}${colors.reset} (${Object.keys(latest.files).join(", ")})`,
  );
}

async function parseCurriculum() {
  const useGemini = args.includes("--gemini");
  logger.step(2, `Parsing Curriculum (${useGemini ? "Gemini" : "parser.ts"})`);
  if (!fs.existsSync(CURRICULUM_PDF)) {
    throw new Error(`Curriculum PDF not found at ${CURRICULUM_PDF}`);
  }

  // Default: the deterministic parser (validated on every PDF in data/pdfs).
  // Gemini (--gemini) needs a paid GEMINI_KEY and has dropped courses before.
  if (!useGemini) {
    const parsed = parsePDF(CURRICULUM_PDF);
    if (parsed.courses.length === 0) {
      throw new Error(`No courses found in ${CURRICULUM_PDF}.`);
    }
    // The separator accepts compact courses, so both outputs are the same.
    fs.writeFileSync(CURRICULUM_JSON_OUTPUT, JSON.stringify(parsed));
    fs.writeFileSync(CURRICULUM_FULL_JSON_OUTPUT, JSON.stringify(parsed));
    logger.success(
      `Curriculum parsed: ${parsed.courses.length} courses, ${parsed.totalPhases} phases` +
        (parsed.habilitacoes ? `, habilitações: ${parsed.habilitacoes.map((h) => h.label).join(" / ")}` : ""),
    );
    return;
  }

  // Usage: gemini.js <pdf> <compressed_out> <full_out>
  await runCommand(
    `node ${GEMINI_SCRIPT} "${CURRICULUM_PDF}" "${CURRICULUM_JSON_OUTPUT}" "${CURRICULUM_FULL_JSON_OUTPUT}"`,
    SCRAPERS_DIR,
    "Parsing PDF with Gemini script",
  );
  logger.success(
    `Curriculum parsed: ${path.relative(DATA_DIR, CURRICULUM_JSON_OUTPUT)}`,
  );
}

async function separateData() {
  logger.step(3, "Separating Data");

  if (!SELECTED_SEMESTER) {
    throw new Error("Schedule not selected. Did scrapers run?");
  }

  if (!fs.existsSync(CURRICULUM_FULL_JSON_OUTPUT)) {
    throw new Error("Curriculum Full JSON not found. Separator requires it.");
  }

  // The program's campus is the one whose schedule matches most of its courses.
  const courseIds = curriculumCourseIds(
    JSON.parse(fs.readFileSync(CURRICULUM_FULL_JSON_OUTPUT, "utf-8")),
  );
  const best = bestCampusFile(SELECTED_SCHEDULE_FILES, courseIds);
  SELECTED_SCHEDULE_FILE = best?.file ?? SELECTED_SCHEDULE_FILES.FLO ?? "";
  if (!SELECTED_SCHEDULE_FILE) {
    throw new Error(`No schedule file to separate for ${SELECTED_SEMESTER}.`);
  }
  logger.substep(
    best
      ? `Campus ${best.campus}: ${best.matches} of the curriculum's courses have classes`
      : "No campus file has classes for this curriculum; storing an empty schedule",
  );

  // Command: tsx <script> <curriculum_full> <schedule> <output>
  const command = `npx tsx ${SEPARATOR_SCRIPT} "${CURRICULUM_FULL_JSON_OUTPUT}" "${SELECTED_SCHEDULE_FILE}" "${CLASSES_JSON_OUTPUT}"`;

  await runCommand(command, PROJECT_ROOT, "Running Separator");
  logger.success(
    `Classes separated: ${path.relative(DATA_DIR, CLASSES_JSON_OUTPUT)}`,
  );
}

async function updateDatabase() {
  logger.step(4, "Updating Database");

  if (!DB_CONNECTION_STRING) {
    logger.warn("NEON_URL not set — skipping cloud DB update (local mode).");
    return;
  }

  const client = new Client(DB_CONNECTION_STRING);
  await client.connect();

  try {
    // 1. Update Curriculum
    const curriculumData = JSON.parse(
      fs.readFileSync(CURRICULUM_JSON_OUTPUT, "utf-8"),
    );
    // Program id = "<course>_<version>". Trust the file name only when it IS
    // that ("208_20271.pdf"); UFSC's own download name
    // ("CURRICULO_CIÊNCIAS_DA_COMPUTAÇÃO_20271.pdf.pdf") used to become the id.
    const fileStem = path.basename(CURRICULUM_PDF, path.extname(CURRICULUM_PDF));
    const fromName = fileStem.match(/^(\d+)_(\d{5})$/);
    if (fromName) {
      curriculumData.id = fromName[1];
      curriculumData.version = fromName[2];
    }
    if (
      !/^\d+$/.test(String(curriculumData.id)) ||
      !/^\d{5}$/.test(String(curriculumData.version))
    ) {
      throw new Error(
        `Can't tell the program id: file "${fileStem}" isn't <course>_<version> and the parsed ` +
          `id/version are "${curriculumData.id}"/"${curriculumData.version}". Rename the PDF to e.g. 208_20271.pdf.`,
      );
    }
    const programId = `${curriculumData.id}_${curriculumData.version}`;

    let pName = curriculumData.name || "";
    const match = pName.match(/^\d+\s*-\s*(.+)$/);
    if (match) pName = match[1];

    const titleCase = (str: string) => {
      const exceptions = ["e", "em", "da", "do", "de", "das", "dos"];
      return str
        .toLowerCase()
        .split(" ")
        .map((word: string, i: number) => {
          if (i !== 0 && exceptions.includes(word)) return word;
          if (word.startsWith("("))
            return "(" + word.charAt(1).toUpperCase() + word.slice(2);
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
    };

    pName = titleCase(pName);
    if (curriculumData.version) {
      const semStr = String(curriculumData.version);
      if (semStr.length === 5) {
        pName = `${pName} (${semStr.substring(0, 4)}.${semStr.substring(4)})`;
      }
    }

    logger.substep(
      `Upserting Program (Program ID: ${programId}, Name: ${pName})`,
    );
    await client.query(
      `
            INSERT INTO programs ("id", "name")
            VALUES ($1, $2)
            ON CONFLICT ("id")
            DO UPDATE SET "name" = $2;
        `,
      [programId, pName],
    );

    // Re-tag non-discipline requirements (Atividades Complementares) off
    // `mandatory` so consumers see correct data (issue #11).
    curriculumData.courses = retagNonDisciplineRequirements(
      curriculumData.courses,
    );

    logger.substep(`Upserting Curriculum (Program ID: ${programId})`);
    await client.query(
      `
            INSERT INTO curriculums ("programId", "curriculumJson")
            VALUES ($1, $2)
            ON CONFLICT ("programId")
            DO UPDATE SET "curriculumJson" = $2;
        `,
      [programId, curriculumData],
    );

    // 2. Update Schedule
    const classesData = JSON.parse(
      fs.readFileSync(CLASSES_JSON_OUTPUT, "utf-8"),
    );

    logger.substep(`Upserting Schedule (Sem: ${SELECTED_SEMESTER})`);

    await client.query(
      `
            INSERT INTO schedules ("programId", "semester", "scheduleJson")
            VALUES ($1, $2, $3)
            ON CONFLICT ("programId", "semester")
            DO UPDATE SET "scheduleJson" = $3;
        `,
      [programId, SELECTED_SEMESTER, classesData],
    );

    logger.success("Database updated successfully");
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    logger.header("MY-UFSC ORCHESTRATOR");

    const relativePdf = path.relative(process.cwd(), CURRICULUM_PDF);
    logger.info(`Target PDF: ${colors.bright}${relativePdf}${colors.reset}`);

    await ensureDir(SCHEDULE_DIR);

    await Promise.all([scrapeSchedule(), parseCurriculum()]);

    await separateData();
    await updateDatabase();

    console.log("");
    logger.success("Orchestration Complete!");
    console.log("");
  } catch (error) {
    console.log("");
    logger.error("Orchestration Failed");
    console.error(error);
    process.exit(1);
  }
}

main();
