import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.NEON_URL,
});

async function run() {
  const res = await pool.query(`SELECT "programId" FROM curriculums WHERE "programId" LIKE '208_%' ORDER BY "programId" DESC`);
  console.log(res.rows);
  process.exit(0);
}
run();
