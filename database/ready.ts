import "dotenv/config";
import { QueryResult } from "pg";

// ── Shared adapter interface ──────────────────────────────────────────────────
interface DbAdapter {
  query(sql: string, params?: any[]): Promise<QueryResult>;
}

let _adapter: DbAdapter | null = null;
let _initPromise: Promise<DbAdapter> | null = null;

/**
 * Determine the database provider.
 *
 * Priority:
 *   1. DB_PROVIDER env var  (set on Vercel / CI)
 *   2. myufsc.config.local.json  (gitignored, local dev override)
 *   3. myufsc.config.json        (committed, production default)
 *   4. Hard fallback → "neon"
 *
 * All filesystem access is inside this function so it NEVER runs at
 * module-evaluation time in a bundled / serverless context.
 */
function readDbProvider(): "neon" | "local" {
  // 1. Explicit env var — always wins (set DB_PROVIDER=neon on Vercel)
  const envProvider = process.env.DB_PROVIDER;
  if (envProvider === "local" || envProvider === "neon") {
    console.log(`[db] provider "${envProvider}" from DB_PROVIDER env var`);
    return envProvider;
  }

  // 2 & 3. Config file (only attempted in environments that have a real FS)
  try {
    // require() is used instead of import so this code path can be tree-shaken
    // by Turbopack and never evaluated in edge / bundled contexts.
    const fs   = require("fs")  as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root  = process.cwd();

    for (const filename of ["myufsc.config.local.json", "myufsc.config.json"]) {
      const file = path.join(root, filename);
      if (fs.existsSync(file)) {
        const cfg = JSON.parse(fs.readFileSync(file, "utf-8"));
        const provider = cfg?.database?.provider;
        if (provider === "local" || provider === "neon") {
          console.log(`[db] provider "${provider}" from ${filename}`);
          return provider;
        }
      }
    }
  } catch {
    // Running in an environment without filesystem access (edge runtime etc.)
    // Fall through to default.
  }

  console.log('[db] provider "neon" (default fallback)');
  return "neon";
}

async function buildAdapter(): Promise<DbAdapter> {
  const provider = readDbProvider();

  if (provider === "neon") {
    // ── Remote: Neon / any Postgres URL ──────────────────────────────────────
    if (!process.env.NEON_URL) {
      throw new Error(
        'DB_PROVIDER is "neon" but NEON_URL env var is not set. ' +
        'Add it to .env or to your Vercel/CI environment variables.',
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

  console.log(
    "[db] Using local PGlite (./.dev-db) — " +
    "register a new account if logging in for the first time locally",
  );

  return {
    async query(sql, params = []) {
      return db.query(sql, params) as unknown as QueryResult;
    },
  };
}

/**
 * Returns (and caches) the active database adapter.
 */
async function getAdapter(): Promise<DbAdapter> {
  if (_adapter) return _adapter;
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
 * Execute multiple queries in a single transaction.
 * Uses a single connection so FK constraints are checked atomically.
 *
 * @param steps Array of { sql, params } objects to execute in order.
 */
export const executeTransaction = async (
  steps: Array<{ sql: string; params?: any[] }>,
): Promise<void> => {
  const provider = readDbProvider();

  if (provider === "neon") {
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
