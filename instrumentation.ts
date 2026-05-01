export async function register() {
  // Only run in the Node.js runtime (not Edge), and only on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { executeQuery } = await import("@/database/ready");
      // Trigger adapter initialization (and PGlite seeding if local) before
      // the first real request arrives. This moves the cold-start cost to
      // server boot time rather than the first user request.
      await executeQuery("SELECT 1");

      // Ensure aggregates query indexes exist (idempotent, cheap if already present)
      await executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_professor_courses_course_id
        ON professor_courses ("courseId")
      `);
      await executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_reviews_professor_top_level
        ON reviews ("professorId")
        WHERE "parentId" IS NULL
      `);
      await executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_reviews_professor_course_top_level
        ON reviews ("professorId", "courseId")
        WHERE "parentId" IS NULL
      `);

      console.log("[instrumentation] DB adapter pre-warmed.");

      // Neon's compute auto-suspends after 5 minutes of inactivity, adding
      // 500–1500 ms to the next query. Ping every 4 minutes to keep it awake.
      // Guard against multiple registrations during HMR / module reloads.
      if (!(global as any)._heartbeatStarted) {
        (global as any)._heartbeatStarted = true;
        setInterval(async () => {
          try {
            await executeQuery("SELECT 1");
          } catch (err) {
            console.warn("[instrumentation] DB heartbeat failed:", err);
          }
        }, 4 * 60 * 1000);
      }
    } catch (err) {
      console.warn("[instrumentation] DB pre-warm failed:", err);
    }
  }
}
