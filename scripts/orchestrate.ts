
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);

// --- Configuration ---
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const GENERATED_DIR = path.join(DATA_DIR, "generated");
const SCRAPERS_DIR = path.join(PROJECT_ROOT, "scrapers");

// Input Paths
const CURRICULUM_PDF = path.join(DATA_DIR, "curriculum.PDF");

// Output Paths
const SCHEDULE_JSON_OUTPUT = path.join(GENERATED_DIR, "schedule_raw.json");
const CURRICULUM_JSON_OUTPUT = path.join(GENERATED_DIR, "curriculum.json");
const CURRICULUM_FULL_JSON_OUTPUT = path.join(GENERATED_DIR, "curriculum_full.json");
const CLASSES_JSON_OUTPUT = path.join(GENERATED_DIR, "classes.json");

// Scraper Paths
const SCHEDULE_SCRAPER_DIR = path.join(SCRAPERS_DIR, "schedule");
const GEMINI_SCRIPT = path.join(SCRAPERS_DIR, "curriculum", "gemini.js");
const SEPARATOR_SCRIPT = path.join(SCRAPERS_DIR, "separator", "index.ts");

// Database Config
const DB_CONNECTION_STRING = process.env.NEON_URL;

// --- Helpers ---
async function runCommand(command: string, cwd: string) {
    console.log(`[EXEC] ${command} (in ${cwd})`);
    const { stdout, stderr } = await execAsync(command, { cwd });
    if (stderr) console.warn(`[STDERR] ${stderr}`);
    return stdout;
}

async function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// --- Main Pipeline ---

let SELECTED_SCHEDULE_FILE = "";
let SELECTED_SEMESTER = "";

async function scrapeSchedule() {
    console.log("--- Step 1: Scraping Schedule (Rust) ---");

    // Clean previous runs (optional, maybe keep history? let's clean to avoid confusion)
    const internalDataDir = path.join(SCHEDULE_SCRAPER_DIR, "matrufsc-scraper", "data");
    if (fs.existsSync(internalDataDir)) {
        fs.rmSync(internalDataDir, { recursive: true, force: true });
    }

    await runCommand("cargo run --release", SCHEDULE_SCRAPER_DIR);

    // Find output file with Smart Selection
    const files = fs.readdirSync(internalDataDir);

    // Regex to match "YYYYS-FLO.json" e.g. "20251-FLO.json"
    // We want to capture YYYY and S
    const semesterFiles = files
        .filter(f => f.endsWith("-FLO.json"))
        .map(f => {
            const match = f.match(/^(\d{4})(\d)-FLO\.json$/);
            if (!match) return null;
            const year = parseInt(match[1]);
            const semester = parseInt(match[2]);
            return { filename: f, year, semester, fullCode: `${year}${semester}` };
        })
        .filter(f => f !== null)
        .filter(f => f.year <= 2030); // Filter out crazy years like 2626

    if (semesterFiles.length === 0) {
        throw new Error("No valid schedule files found (checked for <= 2030).");
    }

    // Sort descending to get latest
    semesterFiles.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.semester - a.semester;
    });

    const latest = semesterFiles[0];
    console.log(`Selected latest valid semester: ${latest.fullCode} (File: ${latest.filename})`);

    SELECTED_SEMESTER = latest.fullCode;

    // Move it to generated
    // We'll keep the original filename to preserve info
    const sourcePath = path.join(internalDataDir, latest.filename);
    const destPath = path.join(GENERATED_DIR, latest.filename);

    fs.copyFileSync(sourcePath, destPath);
    SELECTED_SCHEDULE_FILE = destPath;

    console.log(`Schedule saved to ${SELECTED_SCHEDULE_FILE}`);
}

async function parseCurriculum() {
    console.log("--- Step 2: Parsing Curriculum (Gemini) ---");
    if (!fs.existsSync(CURRICULUM_PDF)) {
        throw new Error(`Curriculum PDF not found at ${CURRICULUM_PDF}`);
    }

    // Usage: gemini.js <pdf> <compressed_out> <full_out>
    await runCommand(`node ${GEMINI_SCRIPT} "${CURRICULUM_PDF}" "${CURRICULUM_JSON_OUTPUT}" "${CURRICULUM_FULL_JSON_OUTPUT}"`, SCRAPERS_DIR);
    console.log(`Curriculum parsed to ${CURRICULUM_JSON_OUTPUT} (and full to ${CURRICULUM_FULL_JSON_OUTPUT})`);
}

async function separateData() {
    console.log("--- Step 3: Separating Data ---");

    if (!SELECTED_SCHEDULE_FILE) {
        throw new Error("Schedule file not selected. Did scrapers run?");
    }

    if (!fs.existsSync(CURRICULUM_FULL_JSON_OUTPUT)) {
        throw new Error("Curriculum Full JSON not found. Separator requires it.");
    }

    // Command: ts-node <script> <curriculum_full> <schedule> <output>
    const command = `npx ts-node ${SEPARATOR_SCRIPT} "${CURRICULUM_FULL_JSON_OUTPUT}" "${SELECTED_SCHEDULE_FILE}" "${CLASSES_JSON_OUTPUT}"`;

    await runCommand(command, PROJECT_ROOT);
    console.log(`Classes separated to ${CLASSES_JSON_OUTPUT}`);
}

async function updateDatabase() {
    console.log("--- Step 4: Updating Database ---");

    if (!DB_CONNECTION_STRING) {
        throw new Error("NEON_URL is not set.");
    }

    const client = new Client(DB_CONNECTION_STRING);
    await client.connect();

    try {
        // 1. Update Curriculum
        const curriculumData = JSON.parse(fs.readFileSync(CURRICULUM_JSON_OUTPUT, 'utf-8'));
        const programId = String(curriculumData.id);

        console.log(`Upserting Curriculum for Program ID: ${programId}`);
        await client.query(`
            INSERT INTO curriculums ("programId", "curriculumJson")
            VALUES ($1, $2)
            ON CONFLICT ("programId") 
            DO UPDATE SET "curriculumJson" = $2;
        `, [programId, curriculumData]);

        // 2. Update Schedule
        const classesData = JSON.parse(fs.readFileSync(CLASSES_JSON_OUTPUT, 'utf-8'));

        console.log(`Upserting Schedule for Program ID: ${programId}, Semester: ${SELECTED_SEMESTER}`);

        await client.query(`
            INSERT INTO schedules ("programId", "semester", "scheduleJson")
            VALUES ($1, $2, $3)
            ON CONFLICT ("programId", "semester")
            DO UPDATE SET "scheduleJson" = $3;
        `, [programId, SELECTED_SEMESTER, classesData]);

        console.log("Database update complete!");

    } finally {
        await client.end();
    }
}

async function main() {
    try {
        await ensureDir(GENERATED_DIR);

        await Promise.all([
            scrapeSchedule(),
            parseCurriculum()
        ]);

        await separateData();
        await updateDatabase();

        console.log("=== \u2705 Orchestration Complete ===");
    } catch (error) {
        console.error("=== \u274C Orchestration Failed ===");
        console.error(error);
        process.exit(1);
    }
}

main();
