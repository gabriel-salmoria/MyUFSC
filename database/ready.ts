import "dotenv/config";
import { QueryResult } from "pg";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────
// Read myufsc.config.local.json (gitignored, dev override) first,
// then fall back to myufsc.config.json (committed, production default).
function readDbProvider(): "neon" | "local" {
  const root = path.resolve(process.cwd());
  const files = [
    path.join(root, "myufsc.config.local.json"),
    path.join(root, "myufsc.config.json"),
  ];
  for (const file of files) {
    if (fs.existsSync(file)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(file, "utf-8"));
        const provider = cfg?.database?.provider;
        if (provider === "local" || provider === "neon") return provider;
      } catch {}
    }
  }
  // Hard fallback: if no config found, require explicit NEON_URL.
  return "neon";
}

const DB_PROVIDER = readDbProvider();
console.log(`[db] provider: ${DB_PROVIDER} (loaded from myufsc.config.local.json or myufsc.config.json)`);

// ── Shared adapter interface ──────────────────────────────────────────────────
interface DbAdapter {
  query(sql: string, params?: any[]): Promise<QueryResult>;
}

let _adapter: DbAdapter | null = null;
let _initPromise: Promise<DbAdapter> | null = null;

async function buildAdapter(): Promise<DbAdapter> {
  if (DB_PROVIDER === "neon") {
    // ── Remote: Neon / any Postgres URL ──────────────────────────────────────
    if (!process.env.NEON_URL) {
      throw new Error(
        'Database provider is "neon" but NEON_URL is not set. ' +
        'Check your .env file or set provider to "local" in myufsc.config.local.json.',
      );
    }
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

  // ── Local: in-process PGlite (no server, no URL) ───────────────────────────
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite("./.dev-db"); // file-backed; persists across restarts
  await db.waitReady;

  const { ensureLocalSchema } = await import("@/database/local-setup");
  await ensureLocalSchema(db);

  console.log("[db] Using local PGlite (./.dev-db) — register a new account if logging in for the first time locally");

  return {
    async query(sql, params = []) {
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
  if (DB_PROVIDER === "neon") {
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

