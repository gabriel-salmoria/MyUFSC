import { unstable_cache } from "next/cache";
import { getCurriculumByProgramId } from "@/database/curriculum/db-curriculum";

/**
 * Cached curriculum read, shared by `/api/curriculum/[programId]` and the
 * profile route's prefetch bundle so both hit one cache entry.
 *
 * The Data Cache outlives deployments on Vercel, so a curriculum rewritten in
 * the DB (scripts/reingest-curricula.ts) shows up only once its entry expires.
 * Keep the TTL short, and bump the version to force a fresh read on the next
 * deploy.
 */
export function getCachedCurriculum(programId: string) {
  return unstable_cache(
    () => getCurriculumByProgramId(programId),
    ["curriculum", "v2", programId],
    { revalidate: 3600 },
  )();
}
