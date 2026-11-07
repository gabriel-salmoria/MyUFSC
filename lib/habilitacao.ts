/**
 * Habilitações ("tracks") — Bacharelado vs Licenciatura and the like.
 *
 * Some UFSC curricula hold one grid per habilitação. The curriculum keeps every
 * habilitação's courses in `allCourses`; `courses` is the view for the one the
 * student picked (default: the first). Every consumer — the phase grid, the
 * electives, the status engine, the plan generator — reads `courses`, so
 * filtering here is the only place the choice has to be applied.
 */

import type { Course, Curriculum } from "@/types/curriculum";

/** The habilitação index to use: the stored choice if valid, else the first. */
export function resolveHabilitacao(
  curriculum: Pick<Curriculum, "habilitacoes">,
  chosen: number | undefined,
): number {
  const count = curriculum.habilitacoes?.length ?? 0;
  return chosen !== undefined && chosen >= 0 && chosen < count ? chosen : 0;
}

/**
 * The courses of one habilitação: shared courses (no `tracks`) as they are,
 * track courses with that track's type and phase, other tracks' courses out.
 */
export function coursesForHabilitacao(
  courses: Course[],
  track: number,
): Course[] {
  const out: Course[] = [];
  for (const course of courses) {
    if (!course.tracks) {
      out.push(course);
      continue;
    }
    const placement = course.tracks[track];
    if (placement) {
      out.push({ ...course, type: placement.type, phase: placement.phase });
    }
  }
  return out;
}

/**
 * The curriculum as the student sees it for habilitação `chosen`. Idempotent:
 * always derives from `allCourses` when present, so it can be re-applied when
 * the student switches habilitação.
 */
export function applyHabilitacao(
  curriculum: Curriculum,
  chosen: number | undefined,
): Curriculum {
  const all = curriculum.allCourses ?? curriculum.courses;
  if (!curriculum.habilitacoes || curriculum.habilitacoes.length < 2) {
    return { ...curriculum, allCourses: all, courses: all };
  }
  const habilitacao = resolveHabilitacao(curriculum, chosen);
  return {
    ...curriculum,
    allCourses: all,
    habilitacao,
    courses: coursesForHabilitacao(all, habilitacao),
  };
}

/** Whether `curriculum` must be re-filtered to show habilitação `chosen`. */
export function needsHabilitacao(
  curriculum: Curriculum,
  chosen: number | undefined,
): boolean {
  return (
    !!curriculum.habilitacoes &&
    curriculum.habilitacoes.length > 1 &&
    curriculum.habilitacao !== resolveHabilitacao(curriculum, chosen)
  );
}
