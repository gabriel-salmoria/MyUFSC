
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
// const GENERATED_DIR = path.join(DATA_DIR, "generated"); // Removed in favor of direct data subdirs
const SCHEDULE_DIR = path.join(DATA_DIR, "schedule");
const SCRAPERS_DIR = path.join(PROJECT_ROOT, "scrapers");


// Input Paths
const args = process.argv.slice(2);
function getArgValue(argName: string): string | null {
    const index = args.findIndex(a => a === argName || a.startsWith(`${argName}=`));
    if (index === -1) return null;

    // Handle --flag=value
    if (args[index].startsWith(`${argName}=`)) {
        return args[index].split('=')[1];
    }

    // Handle --flag value
    if (index + 1 < args.length) {
        return args[index + 1];
    }

    return null;
}

const customPdfPath = getArgValue('--pdf') || getArgValue('--curriculum');
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
    success: (msg: string) => console.log(`${colors.green}✔${colors.reset} ${msg}`),
    warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    error: (msg: string) => console.log(`${colors.red}✖${colors.reset} ${msg}`),
    step: (step: number, title: string) => console.log(`\n${colors.bright}${colors.magenta}[Step ${step}]${colors.reset} ${title}`),
    substep: (msg: string) => console.log(`  ${colors.dim}└─${colors.reset} ${msg}`),
    header: (msg: string) => console.log(`\n${colors.bright}${colors.cyan}=== ${msg} ===${colors.reset}\n`),
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
let SELECTED_SEMESTER = "";


async function scrapeSchedule() {
    logger.step(1, "Scraping Schedule (Rust)");

    const force = args.includes("--force") || args.includes("-f");
    const forceFlag = force ? "--force" : "";

    await runCommand(`cargo run --release -- ${forceFlag}`, SCHEDULE_SCRAPER_DIR, "Running Rust Scraper");

    // Find output file with Smart Selection
    // Now searching in data/schedule
    if (!fs.existsSync(SCHEDULE_DIR)) {
        throw new Error(`Schedule directory not found at ${SCHEDULE_DIR}`);
    }

    const files = fs.readdirSync(SCHEDULE_DIR);

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
    logger.substep(`Selected latest semester: ${colors.bright}${latest.fullCode}${colors.reset}`);

    SELECTED_SEMESTER = latest.fullCode;

    // We just reference it directly now
    SELECTED_SCHEDULE_FILE = path.join(SCHEDULE_DIR, latest.filename);

    logger.success(`Schedule ready: ${path.relative(DATA_DIR, SELECTED_SCHEDULE_FILE)}`);
}

async function parseCurriculum() {
    logger.step(2, "Parsing Curriculum (Gemini)");
    if (!fs.existsSync(CURRICULUM_PDF)) {
        throw new Error(`Curriculum PDF not found at ${CURRICULUM_PDF}`);
    }

    // Usage: gemini.js <pdf> <compressed_out> <full_out>
    await runCommand(
        `node ${GEMINI_SCRIPT} "${CURRICULUM_PDF}" "${CURRICULUM_JSON_OUTPUT}" "${CURRICULUM_FULL_JSON_OUTPUT}"`,
        SCRAPERS_DIR,
        "Parsing PDF with Gemini script"
    );
    logger.success(`Curriculum parsed: ${path.relative(DATA_DIR, CURRICULUM_JSON_OUTPUT)}`);
}

async function separateData() {
    logger.step(3, "Separating Data");

    if (!SELECTED_SCHEDULE_FILE) {
        throw new Error("Schedule file not selected. Did scrapers run?");
    }

    if (!fs.existsSync(CURRICULUM_FULL_JSON_OUTPUT)) {
        throw new Error("Curriculum Full JSON not found. Separator requires it.");
    }

    // Command: ts-node <script> <curriculum_full> <schedule> <output>
    const command = `npx ts-node ${SEPARATOR_SCRIPT} "${CURRICULUM_FULL_JSON_OUTPUT}" "${SELECTED_SCHEDULE_FILE}" "${CLASSES_JSON_OUTPUT}"`;

    await runCommand(command, PROJECT_ROOT, "Running Separator");
    logger.success(`Classes separated: ${path.relative(DATA_DIR, CLASSES_JSON_OUTPUT)}`);
}

async function updateDatabase() {
    logger.step(4, "Updating Database");

    if (!DB_CONNECTION_STRING) {
        throw new Error("NEON_URL is not set.");
    }

    const client = new Client(DB_CONNECTION_STRING);
    await client.connect();

    try {
        // 1. Update Curriculum
        const curriculumData = JSON.parse(fs.readFileSync(CURRICULUM_JSON_OUTPUT, 'utf-8'));
        const programId = String(curriculumData.id);

        logger.substep(`Upserting Curriculum (Program ID: ${programId})`);
        await client.query(`
            INSERT INTO curriculums ("programId", "curriculumJson")
            VALUES ($1, $2)
            ON CONFLICT ("programId") 
            DO UPDATE SET "curriculumJson" = $2;
        `, [programId, curriculumData]);

        // 2. Update Schedule
        const classesData = JSON.parse(fs.readFileSync(CLASSES_JSON_OUTPUT, 'utf-8'));

        logger.substep(`Upserting Schedule (Sem: ${SELECTED_SEMESTER})`);

        await client.query(`
            INSERT INTO schedules ("programId", "semester", "scheduleJson")
            VALUES ($1, $2, $3)
            ON CONFLICT ("programId", "semester")
            DO UPDATE SET "scheduleJson" = $3;
        `, [programId, SELECTED_SEMESTER, classesData]);

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

        await Promise.all([
            scrapeSchedule(),
            parseCurriculum()
        ]);

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
