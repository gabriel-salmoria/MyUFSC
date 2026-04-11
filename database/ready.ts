import "dotenv/config";
import { QueryResult } from "pg";

// ── Shared adapter interface ──────────────────────────────────────────────────
interface DbAdapter {
  query(sql: string, params?: any[]): Promise<QueryResult>;
}

let _adapter: DbAdapter | null = null;
let _initPromise: Promise<DbAdapter> | null = null;

async function buildAdapter(): Promise<DbAdapter> {
  if (process.env.NEON_URL) {
    // ── Remote path: Neon / any Postgres URL ─────────────────────────────────
    const { Client } = await import("pg");
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

  // ── Local path: in-process PGlite (no server, no URL) ──────────────────────
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite("./.dev-db"); // file-backed; persists across restarts
  await db.waitReady;

  const { ensureLocalSchema } = await import("@/database/local-setup");
  await ensureLocalSchema(db);

  console.log("[db] Using local PGlite (./.dev-db)");

  return {
    async query(sql, params = []) {
      // PGlite returns the same shape as pg.QueryResult
      return db.query(sql, params) as unknown as QueryResult;
    },
  };
}

/**
 * Returns (and caches) the active database adapter.
 * Picks PGlite for local dev when NEON_URL is absent, pg.Client otherwise.
 */
async function getAdapter(): Promise<DbAdapter> {
  if (_adapter) return _adapter;
  // Prevent concurrent initialisation races
  if (!_initPromise) _initPromise = buildAdapter();
  _adapter = await _initPromise;
  return _adapter;
}

/**
 * Execute a SQL query through whichever backend is active.
 * @param query  SQL string with $1, $2, … placeholders
 * @param params Query parameters
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
 * Execute multiple queries in a single transaction with deferred FK checks.
 * Use this when renaming primary keys that are referenced by foreign keys.
 *
 * @param steps Array of { sql, params } objects to execute in order.
 */
export const executeTransaction = async (
  steps: Array<{ sql: string; params?: any[] }>,
): Promise<void> => {
  if (process.env.NEON_URL) {
    // ── Remote: one pg.Client for the whole transaction ──────────────────────
    const { Client } = await import("pg");
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
    // ── Local: PGlite — initialise adapter (ensures schema is ready) then
    //          use its built-in transaction() method ─────────────────────────
    await getAdapter(); // ensure PGlite is booted
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

