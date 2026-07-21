/**
 * Tests for the remaining-candidate resolution (Defect 1: non-discipline
 * graduation requirements must never reach placement).
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`). No React/store/DB — plain `Course[]` / `StudentPlan`
 * fixtures against the exported engine functions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Course } from "@/types/curriculum";
import type { StudentPlan } from "@/types/student-plan";
import {
  buildRemainingCandidates,
  isNonDisciplineRequirement,
} from "@/lib/plan-generator/candidates";

/** Minimal mandatory-course fixture (fields the engine actually reads). */
function course(partial: Partial<Course> & { id: string; name: string }): Course {
  return {
    credits: 4,
    type: "mandatory",
    phase: 1,
    equivalents: [],
    prerequisites: [],
    ...partial,
  };
}

const emptyPlan: StudentPlan = { semesters: [] };
const noEquiv = new Map<string, Set<string>>();

test("isNonDisciplineRequirement: true for the numbered CC variant", () => {
  assert.equal(
    isNonDisciplineRequirement(
      course({ id: "INE7011", name: "Atividades Complementares 1" }),
    ),
    true,
  );
});

test("isNonDisciplineRequirement: true for the colon-suffixed Eng Comp variant", () => {
  assert.equal(
    isNonDisciplineRequirement(
      course({
        id: "DEC7003",
        name: "Atividades Complementares: Engenharia de Computação",
      }),
    ),
    true,
  );
});

test("isNonDisciplineRequirement: true across accent and case variants", () => {
  // Accent-laden and upper-cased spellings must normalize to the same token.
  assert.equal(
    isNonDisciplineRequirement(
      course({ id: "X1", name: "ATIVIDADES COMPLEMENTARES" }),
    ),
    true,
  );
  assert.equal(
    isNonDisciplineRequirement(
      course({ id: "X2", name: "Atívidades   Complementáres 2" }),
    ),
    true,
  );
});

test("isNonDisciplineRequirement: false for ordinary disciplines", () => {
  // A normal discipline with empty equivalents / that may lack current sections
  // must NOT be treated as a pseudo-course (guards the rejected heuristic).
  assert.equal(
    isNonDisciplineRequirement(
      course({ id: "MTM3101", name: "Cálculo I", equivalents: [] }),
    ),
    false,
  );
  assert.equal(
    isNonDisciplineRequirement(course({ id: "FSC7112", name: "Física I" })),
    false,
  );
});

test("buildRemainingCandidates: excludes an Atividades Complementares course, keeps a normal mandatory course", () => {
  const ac = course({
    id: "INE7011",
    name: "Atividades Complementares 1",
    phase: 0,
  });
  const normal = course({ id: "INE5401", name: "Programação Orientada a Objetos" });

  const remaining = buildRemainingCandidates([ac, normal], emptyPlan, noEquiv);
  const ids = remaining.map((c) => c.id);

  assert.deepEqual(ids, ["INE5401"]);
  assert.ok(!ids.includes("INE7011"));
});
