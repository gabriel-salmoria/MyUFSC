const ANON_ID_KEY = "myufsc-anon-id";

/**
 * Returns a stable anonymous user ID for this browser session.
 * Generated once using crypto.randomUUID() and persisted in localStorage.
 * This ensures the unique-review constraint works correctly and users
 * see consistent pseudonyms across sessions on the same device.
 */
export function getAnonymousUserId(userId?: string | null): string {
  if (userId) return userId;
  if (typeof window === "undefined") return "anon-server";
  // localStorage access can throw (private browsing, storage partitioning,
  // quota, a browser extension) — this function is called from a `useMemo`
  // used throughout the review UI, so an uncaught throw here would crash
  // the whole professor details dialog, not just review submission. Fall
  // back to a fresh (unpersisted) id rather than letting that happen.
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
