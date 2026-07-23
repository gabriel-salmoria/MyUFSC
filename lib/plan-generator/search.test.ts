/**
 * Tests for the minimum-total-semesters search (Iteration 2).
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`). Fixtures are plain `Course[]` / `StudentInfo` / `sections`
 * objects matching the real shapes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Course } from "@/types/curriculum";
import type { StudentInfo } from "@/types/student-plan";
import type { Professor, ClassSchedule } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import {
  runGreedy,
  generatePlanScenarios,
  type RunSeed,
} from "@/lib/plan-generator/generate";
import { searchMinSemesters } from "@/lib/plan-generator/search";
import type { GeneratorInput, PlanScenario } from "@/lib/plan-generator/types";

// --- fixture builders --------------------------------------------------------

function course(
  partial: Partial<Course> & { id: string },
): Course {
  return {
    name: partial.id,
    credits: 4,
    type: "mandatory",
    phase: 1,
    equivalents: [],
    prerequisites: [],
    ...partial,
  };
}

function slot(day: number, startTime: string, endTime: string): ClassSchedule {
  return { day, startTime, endTime, location: "" };
}

function prof(courseId: string, classNumber: string, slots: ClassSchedule[]): Professor {
  return {
    professorId: `${courseId}_${classNumber}`,
    name: "Fulano",
    classNumber,
    schedule: "",
    slots,
    enrolledStudents: 0,
    maxStudents: 40,
  };
}

/** Single-cell night slots: 18:30 → day:10, 19:20 → day:11, 20:20 → day:12. */
const cell10 = (day: number) => slot(day, "18:30", "19:20");
const cell11 = (day: number) => slot(day, "19:20", "20:20");
const cell12 = (day: number) => slot(day, "20:20", "21:10");

const NIGHT: TurnoFilter = { morning: false, afternoon: false, night: true };
const NO_PREF: TurnoFilter = { morning: true, afternoon: true, night: true };

function makeInput(
  courses: Course[],
  sections: Record<string, Professor[]>,
  turno: TurnoFilter,
  creditCap = 30,
): GeneratorInput {
  const studentInfo: StudentInfo = {
    currentDegree: "TEST",
    interestedDegrees: [],
    name: "Test",
    currentPlan: 0,
    currentSemester: "20251",
    plans: [{ semesters: [] }],
  };
  return { studentInfo, courses, sections, config: { turno, creditCap } };
}

const seed = (config: GeneratorInput["config"]): RunSeed => ({
  id: "t",
  label: "t",
  config,
});

/** Structural signature: sorted `courseId@semester#class` + sorted unplaceable. */
function signature(scenario: PlanScenario): string {
  const placements = scenario.plan.semesters
    .flatMap((sem) =>
      sem.courses.map((c) => `${c.courseId}@${sem.number}#${c.class ?? ""}`),
    )
    .sort();
  const unplaceable = scenario.unplaceable.map((u) => u.courseId).sort();
  return JSON.stringify({ placements, unplaceable });
}

// --- (a) constructed instance where weight-greedy needs T+1, search finds T --

/**
 * A 6-cycle conflict graph (courses A..F on distinct single night cells). It is
 * 2-colorable, so the minimum makespan is T = 2. Ids are chosen so the solver's
 * id-ascending branch order makes the weight strategy (S1) pick a *maximal* IS
 * of size 2, cascading to 3 semesters (T + 1). A cardinality strategy finds a
 * size-3 independent set (a color class) and finishes in 2.
 *
 * Edges (shared cell): A-C (0:10), C-E (0:11), E-B (0:12), B-D (1:10),
 * D-F (1:11), F-A (1:12).
 */
function sixCycleInput(): GeneratorInput {
  const courses = ["A", "B", "C", "D", "E", "F"].map((id) => course({ id }));
  const sections: Record<string, Professor[]> = {
    A: [prof("A", "A", [cell10(0), cell12(1)])],
    C: [prof("C", "C", [cell10(0), cell11(0)])],
    E: [prof("E", "E", [cell11(0), cell12(0)])],
    B: [prof("B", "B", [cell12(0), cell10(1)])],
    D: [prof("D", "D", [cell10(1), cell11(1)])],
    F: [prof("F", "F", [cell11(1), cell12(1)])],
  };
  return makeInput(courses, sections, NIGHT);
}

test("search: weight-greedy needs T+1 semesters but the search finds T", () => {
  const input = sixCycleInput();

  // S1 in isolation (runGreedy = packForward under the weight strategy).
  const single = runGreedy(input, seed(input.config));
  assert.equal(single.totalFutureSemesters, 3, "weight-greedy takes T+1 = 3");

  // The search finds the 2-colorable optimum.
  const searched = searchMinSemesters(input, input.config);
  assert.equal(searched.totalFutureSemesters, 2, "search finds T = 2");
  assert.ok(
    searched.strategyId.startsWith("cardinality"),
    "a cardinality strategy wins",
  );
  // Every course still placed, nothing dropped.
  assert.equal(searched.unplaceable.length, 0);
});

// --- (b) isOptimal true when the floor is reached ---------------------------

test("search: isOptimal is true when the achieved makespan equals the floor", () => {
  const input = sixCycleInput();
  const searched = searchMinSemesters(input, input.config);
  assert.equal(searched.minSemestersFloor, 2);
  assert.equal(searched.totalFutureSemesters, 2);
  assert.equal(searched.isOptimal, true);
});

// --- (b') isOptimal false when the best makespan is above the floor ----------

test("search: isOptimal is false when no strategy reaches the (loose) floor", () => {
  // A triangle: three courses all sharing one night cell → mutually exclusive,
  // so each needs its own semester (makespan 3). The floor is a loose lower
  // bound of 2 (critical-path 1, +1 for the detected collision), which no
  // packing can reach → isOptimal must be false.
  const courses = ["T1", "T2", "T3"].map((id) => course({ id }));
  const sections: Record<string, Professor[]> = {
    T1: [prof("T1", "1", [cell10(0)])],
    T2: [prof("T2", "1", [cell10(0)])],
    T3: [prof("T3", "1", [cell10(0)])],
  };
  const input = makeInput(courses, sections, NIGHT);

  const searched = searchMinSemesters(input, input.config);
  assert.equal(searched.totalFutureSemesters, 3);
  assert.ok(
    searched.minSemestersFloor < searched.totalFutureSemesters,
    "floor is below the achievable makespan",
  );
  assert.equal(searched.isOptimal, false);
  assert.equal(searched.unplaceable.length, 0);
});

// --- (c) determinism ---------------------------------------------------------

test("search: same input → byte-for-byte identical scenarios (determinism)", () => {
  const first = generatePlanScenarios(sixCycleInput());
  const second = generatePlanScenarios(sixCycleInput());

  assert.equal(first.scenarios.length, second.scenarios.length);
  for (let i = 0; i < first.scenarios.length; i++) {
    assert.equal(
      signature(first.scenarios[i]),
      signature(second.scenarios[i]),
      `scenario ${i} must be identical across runs`,
    );
    assert.equal(
      first.scenarios[i].strategyId,
      second.scenarios[i].strategyId,
    );
    assert.equal(
      first.scenarios[i].isOptimal,
      second.scenarios[i].isOptimal,
    );
  }
});

// --- (d) never worse than the single-pass baseline --------------------------

test("search makespan is never worse than the weight-greedy baseline", () => {
  // A chain A→B→C (baseline optimal), the 6-cycle (baseline suboptimal), and a
  // capacity-spread of no-prereq night courses. In every case the search, which
  // includes the weight strategy, must match or beat the single pass.
  const chain = (() => {
    const a = course({ id: "A" });
    const b = course({ id: "B", prerequisites: ["A"] });
    const c = course({ id: "C", prerequisites: ["B"] });
    const sections: Record<string, Professor[]> = {
      A: [prof("A", "1", [cell10(0)])],
      B: [prof("B", "1", [cell10(0)])],
      C: [prof("C", "1", [cell10(0)])],
    };
    return makeInput([a, b, c], sections, NO_PREF);
  })();

  const spread = (() => {
    const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];
    const courses = ids.map((id) => course({ id }));
    const sections: Record<string, Professor[]> = {};
    for (const id of ids) {
      sections[id] = [0, 1, 2, 3, 4].map((day) =>
        prof(id, `d${day}`, [slot(day, "18:30", "21:50")]),
      );
    }
    return makeInput(courses, sections, NIGHT);
  })();

  for (const input of [chain, sixCycleInput(), spread]) {
    const baseline = runGreedy(input, seed(input.config)).totalFutureSemesters;
    const searched = searchMinSemesters(input, input.config).totalFutureSemesters;
    assert.ok(
      searched <= baseline,
      `search (${searched}) must be ≤ baseline (${baseline})`,
    );
  }
});

// --- Sprint-02 invariant survives the search --------------------------------

test("invariant: search winner places-or-reports every remaining discipline", () => {
  // Two morning-only courses that conflict + one night-only course, under a
  // morning filter: the night course is unplaceable, the other two are placed.
  const p = course({ id: "P100", name: "Programação I" });
  const x = course({ id: "X100", name: "Estrutura de Dados" });
  const n = course({ id: "N100", name: "Redes" });
  const sections: Record<string, Professor[]> = {
    P100: [prof("P100", "1", [slot(0, "07:30", "08:20")])],
    X100: [prof("X100", "1", [slot(0, "07:30", "08:20")])], // conflicts P100
    N100: [prof("N100", "1", [cell10(0)])], // night only
  };
  const input = makeInput(
    [p, x, n],
    sections,
    { morning: true, afternoon: false, night: false },
  );

  const searched = searchMinSemesters(input, input.config);
  const placed = new Set(
    searched.plan.semesters.flatMap((s) => s.courses.map((c) => c.courseId)),
  );
  const unplaceable = new Set(searched.unplaceable.map((u) => u.courseId));
  const union = [...new Set([...placed, ...unplaceable])].sort();
  assert.deepEqual(union, ["N100", "P100", "X100"]);
  assert.ok(placed.has("P100") && placed.has("X100"));
  assert.ok(unplaceable.has("N100"));
});
