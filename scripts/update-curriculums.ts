
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
const SCRAPERS_DIR = path.join(PROJECT_ROOT, "scrapers");
const SCHEDULE_SCRAPER_DIR = path.join(SCRAPERS_DIR, "schedule");

const DB_CONNECTION_STRING = process.env.NEON_URL;

// --- Helpers ---

async function runCommand(command: string, cwd: string) {
    console.log(`[EXEC] ${command} (in ${cwd})`);
    const { stdout, stderr } = await execAsync(command, { cwd });
    // Cargo prints to stderr effectively for progress, so we might see it there
    if (stderr && !stderr.includes("Finished")) console.warn(`[STDERR] ${stderr}`);
    return stdout;
}

interface SemesterFile {
    filename: string;
    year: number;
    semester: number;
    fullCode: string;
}

// --- Logic ---

async function scrapeAndGetMasterSchedule(): Promise<{ data: any, semester: string }> {
    console.log("--- Step 1: Scraping Master Schedule ---");

    const internalDataDir = path.join(SCHEDULE_SCRAPER_DIR, "matrufsc-scraper", "data");

    // Clean previous runs to ensure freshness
    if (fs.existsSync(internalDataDir)) {
        fs.rmSync(internalDataDir, { recursive: true, force: true });
    }

    try {
        await runCommand("cargo run --release", SCHEDULE_SCRAPER_DIR);
    } catch (e) {
        console.error("Failed to run cargo scraper. Make sure Rust/Cargo is installed and you are online.");
        throw e;
    }

    // Find output file
    if (!fs.existsSync(internalDataDir)) {
        throw new Error(`Scraper output directory not found: ${internalDataDir}`);
    }

    const files = fs.readdirSync(internalDataDir);
    const semesterFiles: SemesterFile[] = files
        .filter(f => f.endsWith("-FLO.json"))
        .map(f => {
            const match = f.match(/^(\d{4})(\d)-FLO\.json$/);
            if (!match) return null;
            return {
                filename: f,
                year: parseInt(match[1]),
                semester: parseInt(match[2]),
                fullCode: `${match[1]}${match[2]}`
            };
        })
        .filter((f): f is SemesterFile => f !== null)
        .filter(f => f.year <= 2030);

    if (semesterFiles.length === 0) {
        throw new Error("No valid schedule files found.");
    }

    // Sort descending
    semesterFiles.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.semester - a.semester;
    });

    const latest = semesterFiles[0];
    console.log(`Selected latest semester: ${latest.fullCode} (${latest.filename})`);

    const filePath = path.join(internalDataDir, latest.filename);
    const rawData = fs.readFileSync(filePath, 'utf-8');
    return { data: JSON.parse(rawData), semester: latest.fullCode };
}

function getCourseIdsFromCurriculum(curriculumJson: any): Set<string> {
    const ids = new Set<string>();

    if (!curriculumJson || !curriculumJson.courses) return ids;

    for (const course of curriculumJson.courses) {
        // Handle compressed format (Array) -> id is index 0
        if (Array.isArray(course)) {
            ids.add(course[0]);
        }
        // Handle object format -> id is .id property
        else if (course.id) {
            ids.add(course.id);
        }
    }
    return ids;
}

function filterScheduleForCurriculum(masterSchedule: any, courseIds: Set<string>): any {
    if (!masterSchedule.FLO) return null;

    const filteredFLO = masterSchedule.FLO.filter((courseEntry: any[]) => {
        const courseId = courseEntry[0];
        return courseIds.has(courseId);
    });

    return {
        DATA: masterSchedule.DATA,
        FLO: filteredFLO
    };
}

async function main() {
    const args = process.argv.slice(2);
    const targetProgramId = args[0];

    if (!DB_CONNECTION_STRING) {
        console.error("NEON_URL environment variable is not set.");
        process.exit(1);
    }

    const client = new Client(DB_CONNECTION_STRING);

    try {
        console.log("Connecting to database...");
        await client.connect();

        // 1. Get Master Schedule
        const { data: masterSchedule, semester } = await scrapeAndGetMasterSchedule();

        // 2. Fetch Curriculums
        let res;
        if (targetProgramId) {
            console.log(`Fetching specific curriculum: ${targetProgramId}`);
            res = await client.query('SELECT * FROM curriculums WHERE "programId" = $1', [targetProgramId]);
        } else {
            console.log("Fetching ALL curriculums...");
            res = await client.query('SELECT * FROM curriculums');
        }

        if (res.rows.length === 0) {
            console.log("No curriculums found to update.");
            return;
        }

        console.log(`Found ${res.rows.length} curriculum(s) to update.`);

        // 3. Update Schedules
        for (const row of res.rows) {
            const { programId, curriculumJson } = row;
            console.log(`Processing Program ID: ${programId}`);

            const courseIds = getCourseIdsFromCurriculum(curriculumJson);
            console.log(`  - Found ${courseIds.size} courses in curriculum.`);

            const filteredSchedule = filterScheduleForCurriculum(masterSchedule, courseIds);

            if (!filteredSchedule || filteredSchedule.FLO.length === 0) {
                console.warn(`  - Warning: No matching classes found in master schedule for this curriculum.`);
                // We typically still want to update it (to empty) or maybe skip? 
                // Let's update it so it reflects reality (no classes).
            } else {
                console.log(`  - Matched ${filteredSchedule.FLO.length} classes.`);
            }

            // Upsert Schedule
            await client.query(`
                INSERT INTO schedules ("programId", "semester", "scheduleJson")
                VALUES ($1, $2, $3)
                ON CONFLICT ("programId", "semester")
                DO UPDATE SET "scheduleJson" = $3;
            `, [programId, semester, filteredSchedule]);

            console.log(`  - Database updated for ${programId} / ${semester}.`);
        }

        console.log("\n=== Update Complete ===");

    } catch (error) {
        console.error("An error occurred:", error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
