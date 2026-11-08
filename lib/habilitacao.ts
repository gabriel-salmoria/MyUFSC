/**
 * Habilitações ("tracks") — Bacharelado vs Licenciatura and the like — and
 * ênfases (Psicologia's 1ª/2ª ênfase, A–D).
 *
 * Some UFSC curricula hold one grid per habilitação. The curriculum keeps every
 * habilitação's courses in `allCourses`; `courses` is the view for the one the
 * student picked (default: the first) and, when the curriculum has ênfases,
 * only the versions of the chosen ênfases. Every consumer — the phase grid, the
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
 * The option to use for each ênfase slot: the stored choice if valid, else
 * the slot's own position (1ª ênfase → A, 2ª → B), so the default never picks
 * the same ênfase twice.
 */
export function resolveEnfases(
  curriculum: Pick<Curriculum, "enfases">,
  chosen: number[] | undefined,
): number[] {
  return (curriculum.enfases ?? []).map((slot, i) => {
    const pick = chosen?.[i];
    const count = slot.options.length;
    if (pick !== undefined && Number.isInteger(pick) && pick >= 0 && pick < count) {
      return pick;
    }
    return i < count ? i : 0;
  });
}

/**
 * The courses of one habilitação: shared courses (no `tracks`) as they are,
 * track courses with that track's type and phase, other tracks' courses out;
 * ênfase versions only for the chosen option of their slot.
 */
export function coursesForHabilitacao(
  courses: Course[],
  track: number | undefined,
  enfases: number[] = [],
): Course[] {
  const out: Course[] = [];
  for (const course of courses) {
    if (course.enfase) {
      const [slot, option] = course.enfase;
      if (slot < enfases.length && enfases[slot] !== option) continue;
    }
    if (!course.tracks || track === undefined) {
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
 * The curriculum as the student sees it for habilitação `chosen` and ênfases
 * `chosenEnfases`. Idempotent: always derives from `allCourses` when present,
 * so it can be re-applied when the student changes either choice.
 */
export function applyHabilitacao(
  curriculum: Curriculum,
  chosen: number | undefined,
  chosenEnfases?: number[],
): Curriculum {
  const all = curriculum.allCourses ?? curriculum.courses;
  const hasTracks = !!curriculum.habilitacoes && curriculum.habilitacoes.length > 1;
  const enfaseChoice = resolveEnfases(curriculum, chosenEnfases);
  if (!hasTracks && enfaseChoice.length === 0) {
    return { ...curriculum, allCourses: all, courses: all };
  }
  const habilitacao = hasTracks ? resolveHabilitacao(curriculum, chosen) : undefined;
  return {
    ...curriculum,
    allCourses: all,
    ...(habilitacao !== undefined ? { habilitacao } : {}),
    ...(enfaseChoice.length > 0 ? { enfaseChoice } : {}),
    courses: coursesForHabilitacao(all, habilitacao, enfaseChoice),
  };
}

/** Whether `curriculum` must be re-filtered to show these choices. */
export function needsHabilitacao(
  curriculum: Curriculum,
  chosen: number | undefined,
  chosenEnfases?: number[],
): boolean {
  const tracksChanged =
    !!curriculum.habilitacoes &&
    curriculum.habilitacoes.length > 1 &&
    curriculum.habilitacao !== resolveHabilitacao(curriculum, chosen);
  const enfasesChanged =
    (curriculum.enfases?.length ?? 0) > 0 &&
    JSON.stringify(curriculum.enfaseChoice ?? null) !==
      JSON.stringify(resolveEnfases(curriculum, chosenEnfases));
  return tracksChanged || enfasesChanged;
}
