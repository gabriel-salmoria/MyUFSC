export async function register() {
  // Only run in the Node.js runtime (not Edge), and only on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { executeQuery } = await import("@/database/ready");
      // Trigger adapter initialization (and PGlite seeding if local) before
      // the first real request arrives. This moves the cold-start cost to
      // server boot time rather than the first user request.
      await executeQuery("SELECT 1");
      console.log("[instrumentation] DB adapter pre-warmed.");
    } catch (err) {
      console.warn("[instrumentation] DB pre-warm failed:", err);
    }
  }
}
