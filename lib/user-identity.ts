const ANON_ID_KEY = "myufsc-anon-id";

/**
 * Returns a stable anonymous user ID for this browser session.
 * Generated once using crypto.randomUUID() and persisted in localStorage.
 * This ensures the unique-review constraint works correctly and users
 * see consistent pseudonyms across sessions on the same device.
 */
export function getAnonymousUserId(): string {
  if (typeof window === "undefined") return "anon-server";
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}
