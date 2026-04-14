import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.NEON_URL,
});

async function run() {
  const res = await pool.query(`SELECT id, name FROM programs WHERE id LIKE '208_%' ORDER BY id DESC`);
  console.log(res.rows);
  process.exit(0);
}
run();
