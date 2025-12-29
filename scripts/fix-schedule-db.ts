
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const DB_CONNECTION_STRING = process.env.NEON_URL;

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    yellow: "\x1b[33m",
};

async function main() {
    const args = process.argv.slice(2);
    const targetProgramId = args[0]; // Optional program ID

    if (!DB_CONNECTION_STRING) {
        console.error("NEON_URL is not set.");
        process.exit(1);
    }

    const client = new Client(DB_CONNECTION_STRING);
    await client.connect();

    try {
        console.log(`${colors.bright}Starting Database Schedule Migration...${colors.reset}`);

        let query = 'SELECT "programId", "semester", "scheduleJson" FROM schedules';
        let values: any[] = [];

        if (targetProgramId) {
            console.log(`Targeting Program ID: ${colors.green}${targetProgramId}${colors.reset}`);
            query += ' WHERE "programId" = $1';
            values.push(targetProgramId);
        }

        const res = await client.query(query, values);
        console.log(`Found ${res.rows.length} rows to process.`);

        for (const row of res.rows) {
            const { programId, semester, scheduleJson } = row;
            let modified = false;

            // The JSON structure is usually { DATA: string, FLO: array } or just the array sometimes?
            // "classes.json" format is usually { DATA: ..., FLO: [...] }

            if (!scheduleJson || typeof scheduleJson !== 'object') {
                console.log(`${colors.yellow}Skipping invalid JSON for ${programId}-${semester}${colors.reset}`);
                continue;
            }

            // We look for FLO array (or other campuses if flexible, but usually FLO here)
            // It might be scheduleJson.FLO

            let courses = scheduleJson.FLO;
            if (!courses && Array.isArray(scheduleJson)) {
                // Sometimes it might be the array directly? Unlikely based on previous code.
                courses = scheduleJson;
            }

            if (!Array.isArray(courses)) {
                // Maybe nested under program ID? 
                // separator output: { DATA: ..., FLO: filteredFLO }
                // So it should be scheduleJson.FLO
                console.log(`${colors.yellow}No course array found for ${programId}-${semester}${colors.reset}`);
                continue;
            }

            const newCourses = courses.map((course: any) => {
                // Tuple: [id, title_upper, title, classes] -> length 4
                // Target: [id, title, classes] -> length 3
                if (Array.isArray(course) && course.length === 4) {
                    modified = true;
                    return [course[0], course[2], course[3]];
                }
                return course;
            });

            if (modified) {
                scheduleJson.FLO = newCourses;

                // Update DB
                await client.query(
                    'UPDATE schedules SET "scheduleJson" = $1 WHERE "programId" = $2 AND "semester" = $3',
                    [scheduleJson, programId, semester]
                );
                console.log(`Updated ${colors.blue}${programId}-${semester}${colors.reset}: corrected tuples.`);
            } else {
                // console.log(`No changes needed for ${programId}-${semester}`);
            }
        }

        console.log(`${colors.green}Migration Complete!${colors.reset}`);

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

main();
