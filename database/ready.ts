import "dotenv/config";
import { Pool, QueryResult } from "pg";

/**
 * SSL modes that `pg` currently treats as an alias for `verify-full`, and warns
 * about on every boot:
 *
 *   SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are
 *   treated as aliases for 'verify-full'. In the next major version … these
 *   modes will adopt standard libpq semantics, which have weaker security
 *   guarantees.
 */
const ALIASED_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

/**
 * Rewrite an aliased `sslmode` to the `verify-full` it already resolves to.
 *
 * This is behaviour-preserving TODAY — it just states the mode `pg` is using
 * anyway — but it pins it, so upgrading to pg v9 (where these modes take on
 * libpq's weaker semantics) can't quietly downgrade our TLS to something that
 * skips certificate verification. It also silences the boot-time warning.
 *
 * Left untouched when the caller already opted into libpq semantics via
 * `uselibpqcompat`, or when the value isn't a parseable URL (a key=value DSN).
 */
function pinSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    if (
      mode &&
      ALIASED_SSL_MODES.has(mode) &&
      !url.searchParams.has("uselibpqcompat")
    ) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    // Not a URL — leave it alone rather than mangle it.
  }
  return connectionString;
}

function getPool(): Pool {
  if (!(global as any)._sharedPool) {
    (global as any)._sharedPool = new Pool({
      connectionString: pinSslMode(process.env.NEON_URL!),
      max: 5,
      idleTimeoutMillis: 0,              // never evict idle clients from the pool
      connectionTimeoutMillis: 10_000,
      keepAlive: true,                   // send TCP keep-alive packets
      keepAliveInitialDelayMillis: 10_000,
    });
  }
  return (global as any)._sharedPool;
}

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

// Store on global so HMR module resets don't trigger re-initialization
function getGlobal<T>(key: string): T | null {
  return (global as any)[key] ?? null;
}
function setGlobal<T>(key: string, val: T): void {
  (global as any)[key] = val;
}

async function buildAdapter(): Promise<DbAdapter & { _pglite?: any }> {
  if (PROVIDER === "neon") {
    if (!process.env.NEON_URL) {
      throw new Error(
        "NEON_URL is not set. Add it to .env or your deployment environment.",
      );
    }
    return {
      async query(sql, params = []) {
        const pool = getPool();
        return await pool.query(sql, params);
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
    _pglite: db,
    async query(sql, params = []) {
      return db.query(sql, params) as unknown as QueryResult;
    },
  };
}

async function getAdapter(): Promise<DbAdapter> {
  const cached = getGlobal<DbAdapter>("_dbAdapter");
  if (cached) return cached;

  let initPromise = getGlobal<Promise<DbAdapter>>("_dbAdapterPromise");
  if (!initPromise) {
    initPromise = buildAdapter();
    setGlobal("_dbAdapterPromise", initPromise);
  }

  const adapter = await initPromise;
  setGlobal("_dbAdapter", adapter);
  return adapter;
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
    const pool = getPool();
    const client = await pool.connect();
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
      client.release();
    }
  } else {
    const adapter = await getAdapter() as any;
    const db = adapter._pglite;
    await db.transaction(async (tx: any) => {
      for (const step of steps) {
        await tx.query(step.sql, step.params ?? []);
      }
    });
  }
};
