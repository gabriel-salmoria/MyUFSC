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
import {
  searchMinSemesters,
  searchWithDaytimeExceptions,
} from "@/lib/plan-generator/search";
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

test("search: isOptimal is false when the makespan exceeds the (loose) clique floor", () => {
  // A 5-cycle (pentagon) conflict graph: each course conflicts with its two
  // neighbours, no triangle. An odd cycle needs 3 colours, so the minimum
  // makespan is 3 — but its largest clique is only 2, so the clique-based floor
  // is a loose 2 that no packing can reach → isOptimal must be false.
  // Edge cells: AB=0:10, BC=0:11, CD=0:12, DE=1:10, EA=1:11.
  const courses = ["A", "B", "C", "D", "E"].map((id) => course({ id }));
  const sections: Record<string, Professor[]> = {
    A: [prof("A", "1", [cell10(0), cell11(1)])], // AB, EA
    B: [prof("B", "1", [cell10(0), cell11(0)])], // AB, BC
    C: [prof("C", "1", [cell11(0), cell12(0)])], // BC, CD
    D: [prof("D", "1", [cell12(0), cell10(1)])], // CD, DE
    E: [prof("E", "1", [cell10(1), cell11(1)])], // DE, EA
  };
  const input = makeInput(courses, sections, NIGHT);

  const searched = searchMinSemesters(input, input.config);
  assert.equal(searched.totalFutureSemesters, 3);
  assert.equal(searched.minSemestersFloor, 2);
  assert.ok(
    searched.minSemestersFloor < searched.totalFutureSemesters,
    "clique floor is below the achievable makespan",
  );
  assert.equal(searched.isOptimal, false);
  assert.equal(searched.unplaceable.length, 0);
});

// --- Daytime-exception promotion search (Task T2/T3/T4) ---------------------

/**
 * Three courses offered ONLY Monday 18:30 at night → a mutually-exclusive
 * 3-clique (strict-night makespan 3). Course X ALSO has a Monday-morning
 * section, so spending one daytime exception on X breaks the clique: X runs in
 * the morning alongside a night course and the makespan drops to 2. Y and Z have
 * no daytime alternative, so they are never promotion candidates.
 */
function daytimeCliqueInput(daytimeExceptionBudget?: number): GeneratorInput {
  const courses = ["X", "Y", "Z"].map((id) => course({ id }));
  const sections: Record<string, Professor[]> = {
    X: [
      prof("X", "night", [slot(0, "18:30", "19:20")]), // Mon 18:30 (night)
      prof("X", "morning", [slot(0, "08:20", "09:10")]), // Mon 08:20 (daytime)
    ],
    Y: [prof("Y", "night", [slot(0, "18:30", "19:20")])],
    Z: [prof("Z", "night", [slot(0, "18:30", "19:20")])],
  };
  const input = makeInput(courses, sections, NIGHT);
  if (daytimeExceptionBudget !== undefined) {
    input.config = { ...input.config, daytimeExceptionBudget };
  }
  return input;
}

test("daytime exception: strict night is a 3-clique (makespan 3); promoting one course reaches makespan 2", () => {
  const input = daytimeCliqueInput();

  // B=0 — strict night: the 3-clique forces one course per semester.
  const night = searchMinSemesters(input, input.config);
  assert.equal(night.totalFutureSemesters, 3);
  assert.equal(night.daytimeExceptionsUsed, 0);
  assert.equal(night.promotedCourses.length, 0);
  assert.equal(night.isOptimal, true); // matches the chromatic floor of 3

  // B=1 — one daytime exception breaks the clique and saves a semester.
  const promoted = searchWithDaytimeExceptions(input, input.config, 1);
  assert.ok(promoted, "a viable promotion must exist");
  assert.equal(promoted!.totalFutureSemesters, 2);
  assert.equal(promoted!.daytimeExceptionsUsed, 1);
  assert.deepEqual(
    promoted!.promotedCourses.map((p) => p.courseId),
    ["X"], // only X has a daytime alternative
  );
  assert.equal(promoted!.promotedCourses[0].classNumber, "morning");
  assert.equal(promoted!.unplaceable.length, 0);
});

test("daytime exception: generatePlanScenarios contrasts night vs 1-de-manhã, drops a non-improving B=2", () => {
  const result = generatePlanScenarios(daytimeCliqueInput(2));

  // Two cards: the honest night baseline and the improving 1-exception plan.
  assert.equal(result.scenarios.length, 2);

  const [night, morning] = result.scenarios;
  assert.equal(night.label, "Só à noite");
  assert.equal(night.totalFutureSemesters, 3);
  assert.equal(night.daytimeExceptionsUsed, 0);

  assert.equal(morning.label, "1 de manhã");
  assert.equal(morning.totalFutureSemesters, 2);
  assert.equal(morning.daytimeExceptionsUsed, 1);
  assert.deepEqual(
    morning.promotedCourses.map((p) => p.courseId),
    ["X"],
  );
  // B=2 cannot beat B=1 (only one course is promotable) → no third card.
  assert.ok(
    !result.scenarios.some((s) => s.label === "2 de manhã"),
    "a non-improving 2-exception scenario must be dropped",
  );
});

test("daytime exception: with budget 0 the comparison is night-only", () => {
  const result = generatePlanScenarios(daytimeCliqueInput(0));
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0].label, "Só à noite");
  assert.equal(result.scenarios[0].daytimeExceptionsUsed, 0);
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
