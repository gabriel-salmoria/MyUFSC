import "dotenv/config";
import { Client, QueryResult } from "pg";

// ── Provider detection ────────────────────────────────────────────────────────
// Priority:
//   1. DB_PROVIDER env var  ("neon" | "local") — explicit override
//   2. NEON_URL present     → "neon"
//   3. Neither              → "local"  (in-process PGlite, no server needed)
function getProvider(): "neon" | "local" {
  const p = process.env.DB_PROVIDER;
  if (p === "neon" || p === "local") return p;
  return process.env.NEON_URL ? "neon" : "local";
}

const PROVIDER = getProvider();

// ── Shared adapter interface ──────────────────────────────────────────────────
interface DbAdapter {
  query(sql: string, params?: any[]): Promise<QueryResult>;
}

let _adapter: DbAdapter | null = null;
let _initPromise: Promise<DbAdapter> | null = null;

async function buildAdapter(): Promise<DbAdapter> {
  if (PROVIDER === "neon") {
    if (!process.env.NEON_URL) {
      throw new Error(
        "NEON_URL is not set. Add it to .env or your deployment environment.",
      );
    }
    return {
      async query(sql, params = []) {
        const client = new Client(process.env.NEON_URL!);
        await client.connect();
        try {
          return await client.query(sql, params);
        } finally {
          await client.end();
        }
      },
    };
  }

  // ── Local: in-process PGlite (no server, no URL) ───────────────────────────
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite("./.dev-db");
  await db.waitReady;

  const { ensureLocalSchema } = await import("@/database/local-setup");
  await ensureLocalSchema(db);

  console.log("[db] local PGlite (.dev-db/) ready");

  return {
    async query(sql, params = []) {
      return db.query(sql, params) as unknown as QueryResult;
    },
  };
}

async function getAdapter(): Promise<DbAdapter> {
  if (_adapter) return _adapter;
  if (!_initPromise) _initPromise = buildAdapter();
  _adapter = await _initPromise;
  return _adapter;
}

/**
 * Execute a SQL query through whichever backend is active.
 */
export const executeQuery = async (
  query: string,
  params: any[] = [],
): Promise<QueryResult> => {
  try {
    const adapter = await getAdapter();
    return await adapter.query(query, params);
  } catch (err) {
    console.error("Error executing query:", err);
    throw err;
  }
};

/**
 * Execute multiple queries atomically (single connection, FK-safe).
 */
export const executeTransaction = async (
  steps: Array<{ sql: string; params?: any[] }>,
): Promise<void> => {
  if (PROVIDER === "neon") {
    const client = new Client(process.env.NEON_URL!);
    await client.connect();
    try {
      await client.query("BEGIN");
      for (const step of steps) {
        await client.query(step.sql, step.params ?? []);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      await client.end();
    }
  } else {
    await getAdapter();
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite("./.dev-db");
    await db.waitReady;
    await db.transaction(async (tx) => {
      for (const step of steps) {
        await tx.query(step.sql, step.params ?? []);
      }
    });
  }
};
