/**
 * Tests for the plan-generator engine (`lib/plan-generator/engine.ts`).
 *
 * Pure-function tests over plain `Course[]` / `StudentInfo` / `sections`
 * fixtures, run with Node's built-in `node:test` via `tsx` (`pnpm test`).
 *
 * Grouped by the engine's layers, in the same order the engine declares them:
 * candidates -> packing -> bottleneck floor -> graduation -> electives ->
 * the forward packer -> the minimum-semesters search.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Course } from "@/types/curriculum";
import type {
  StudentCourse,
  StudentInfo,
  StudentPlan,
  StudentSemester,
} from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Professor, ClassSchedule } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import { computeBottleneckWeights } from "@/lib/prerequisites";
import {
  analyzeBottlenecks,
  baselineLabel,
  buildElectivePool,
  buildRemainingCandidates,
  computeGraduationReminder,
  courseHours,
  exceptionLabel,
  fillElectivesIntoScenario,
  generatePlanScenarios,
  isNonDisciplineRequirement,
  isTerminalStatus,
  isNightTurnoValid,
  normalizeCourseName,
  packMaxWeight,
  resolveTerminalStatus,
  runGreedy,
  searchMinSemesters,
  searchWithDaytimeExceptions,
  weekdayCellCapacity,
  type PackingCandidate,
  type RunSeed,
} from "@/lib/plan-generator/engine";
import type { GeneratorInput, PlanScenario } from "@/lib/plan-generator/types";

// ── Shared fixtures ─────────────────────────────────────────────────────────
// One set for the whole suite. Each of the seven source files used to carry its
// own near-identical copies; two of them genuinely differed in signature, so
// those accept either shape rather than forcing every call site to change.

const NIGHT: TurnoFilter = { morning: false, afternoon: false, night: true };
const NIGHT_ONLY: TurnoFilter = NIGHT;
const NO_PREF: TurnoFilter = { morning: true, afternoon: true, night: true };

const noEquiv = new Map<string, Set<string>>();

/** `name` defaults to the id — most fixtures don't care what a course is called. */
function course(partial: Partial<Course> & { id: string }): Course {
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

/** Single-cell night slots: 18:30 → day:10, 19:20 → day:11, 20:20 → day:12. */
const cell10 = (day: number) => slot(day, "18:30", "19:20");
const cell11 = (day: number) => slot(day, "19:20", "20:20");
const cell12 = (day: number) => slot(day, "20:20", "21:10");

/** One offering. Takes either explicit slots, or a single day + time range. */
function prof(
  courseId: string,
  classNumber: string,
  slotsOrDay: ClassSchedule[] | number,
  startTime?: string,
  endTime?: string,
): Professor {
  const slots = Array.isArray(slotsOrDay)
    ? slotsOrDay
    : [slot(slotsOrDay, startTime!, endTime!)];
  return {
    professorId: `${courseId}_${classNumber}`,
    name: "Fulano",
    classNumber,
    schedule: startTime ? `${startTime}-${endTime}` : "",
    slots,
    enrolledStudents: 0,
    maxStudents: 40,
  };
}

interface MakeInputOpts {
  creditCap?: number;
  history?: StudentPlan;
  turno?: TurnoFilter;
  fillElectives?: boolean;
}

/**
 * Takes either a bare `TurnoFilter` (+ optional cap) or an options object.
 *
 * `fillElectives` defaults to **true** for the options form and false
 * otherwise: the elective post-pass is opt-in in production, and the options
 * form is what the elective tests use.
 */
function makeInput(
  courses: Course[],
  sections: Record<string, Professor[]>,
  turnoOrOpts: TurnoFilter | MakeInputOpts = {},
  creditCap?: number,
): GeneratorInput {
  const isFilter = turnoOrOpts && "morning" in turnoOrOpts;
  const opts: MakeInputOpts = isFilter
    ? { turno: turnoOrOpts as TurnoFilter, creditCap }
    : (turnoOrOpts as MakeInputOpts);

  const studentInfo: StudentInfo = {
    currentDegree: "TEST",
    interestedDegrees: [],
    name: "Test",
    currentPlan: 0,
    currentPhase: 1,
    plans: [opts.history ?? { semesters: [] }],
  };
  return {
    studentInfo,
    courses,
    sections,
    config: {
      turno: opts.turno ?? NO_PREF,
      creditCap: opts.creditCap ?? 30,
      fillElectives: opts.fillElectives ?? !isFilter,
    },
  };
}

const seed = (config: GeneratorInput["config"]): RunSeed => ({
  id: "t",
  label: "t",
  config,
});

/** Every courseId placed anywhere in a scenario's plan. */
function placedIds(scenario: PlanScenario): Set<string> {
  return new Set(
    scenario.plan.semesters.flatMap((s) => s.courses.map((c) => c.courseId)),
  );
}


// ====================================================== candidates ======================================================

/** Minimal mandatory-course fixture (fields the engine actually reads). */

const emptyPlan: StudentPlan = { semesters: [] };

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


// ========================================================= packing =========================================================

/** A single night grid cell as a section slot. */

function candidate(
  courseId: string,
  weight: number,
  sections: { classNumber: string; slots: ClassSchedule[] }[],
  credits = 4,
): PackingCandidate {
  return { courseId, weight, credits, sections };
}

/** Assert every chosen section's cells are pairwise disjoint. */
function assertDisjoint(chosen: { cells: Set<string> }[]): void {
  const seen = new Set<string>();
  for (const c of chosen) {
    for (const cell of c.cells) {
      assert.ok(!seen.has(cell), `cell ${cell} double-booked`);
      seen.add(cell);
    }
  }
}

// --- conflicting pair → higher weight wins ----------------------------------

test("packMaxWeight: two conflicting courses → the higher-weight one is chosen", () => {
  const a = candidate("A", 10, [
    { classNumber: "a1", slots: [slot(0, "18:30", "19:20")] },
  ]);
  const b = candidate("B", 5, [
    { classNumber: "b1", slots: [slot(0, "18:30", "19:20")] }, // same cell → conflict
  ]);

  const res = packMaxWeight([a, b]);

  assert.equal(res.usedFallback, false);
  assert.equal(res.chosen.length, 1);
  assert.equal(res.chosen[0].courseId, "A");
  assert.equal(res.totalWeight, 10);
});

// --- disjoint pair → both ----------------------------------------------------

test("packMaxWeight: two disjoint courses → both chosen", () => {
  const a = candidate("A", 10, [
    { classNumber: "a1", slots: [slot(0, "18:30", "19:20")] },
  ]);
  const b = candidate("B", 5, [
    { classNumber: "b1", slots: [slot(1, "18:30", "19:20")] },
  ]);

  const res = packMaxWeight([a, b]);

  assert.equal(res.chosen.length, 2);
  assert.equal(res.totalWeight, 15);
  assertDisjoint(res.chosen);
});

// --- two-section course → picks the non-conflicting section ------------------

test("packMaxWeight: a two-section course picks the section that avoids the conflict", () => {
  const a = candidate("A", 10, [
    { classNumber: "a1", slots: [slot(0, "18:30", "19:20")] },
  ]);
  const b = candidate("B", 5, [
    { classNumber: "b1", slots: [slot(0, "18:30", "19:20")] }, // conflicts with A
    { classNumber: "b2", slots: [slot(1, "18:30", "19:20")] }, // free
  ]);

  const res = packMaxWeight([a, b]);

  assert.equal(res.chosen.length, 2);
  const bChoice = res.chosen.find((c) => c.courseId === "B")!;
  assert.equal(bChoice.classNumber, "b2");
  assertDisjoint(res.chosen);
});

// --- secondary credit cap binds ---------------------------------------------

test("packMaxWeight: the secondary credit cap limits the chosen credit sum", () => {
  // Disjoint sections, but cap only admits one 4-credit course.
  const a = candidate("A", 10, [
    { classNumber: "a1", slots: [slot(0, "18:30", "19:20")] },
  ]);
  const b = candidate("B", 5, [
    { classNumber: "b1", slots: [slot(1, "18:30", "19:20")] },
  ]);

  const res = packMaxWeight([a, b], 4);

  assert.equal(res.chosen.length, 1);
  assert.equal(res.chosen[0].courseId, "A"); // higher weight fits the cap
  assert.equal(res.totalWeight, 10);
});

// --- budget overflow → greedy fallback flagged ------------------------------

test("packMaxWeight: node-budget overflow falls back to greedy and sets the flag", () => {
  const cands = [
    candidate("A", 10, [{ classNumber: "a1", slots: [slot(0, "18:30", "19:20")] }]),
    candidate("B", 8, [{ classNumber: "b1", slots: [slot(1, "18:30", "19:20")] }]),
    candidate("C", 6, [{ classNumber: "c1", slots: [slot(2, "18:30", "19:20")] }]),
    candidate("D", 4, [{ classNumber: "d1", slots: [slot(3, "18:30", "19:20")] }]),
  ];

  const res = packMaxWeight(cands, Number.POSITIVE_INFINITY, 1);

  assert.equal(res.usedFallback, true);
  // Greedy still returns a valid, conflict-free packing.
  assertDisjoint(res.chosen);
  assert.ok(res.chosen.length > 0);
  // Highest-weight course is taken first by greedy.
  assert.ok(res.chosen.some((c) => c.courseId === "A"));
});

// --- value overrides weight → cardinality-primary packing -------------------

test("packMaxWeight: an optional value overrides weight → the two-course packing wins", () => {
  // H (weight 10) shares a cell with each of L1, L2 (weight 1 each); L1 and L2
  // are mutually disjoint. Under weight the solver keeps H alone; under a
  // cardinality value (BASE + weight, BASE = 1 + Σ weights, so one extra course
  // always beats any weight delta) it packs {L1, L2}.
  const h = candidate("H", 10, [
    {
      classNumber: "h",
      slots: [slot(0, "18:30", "19:20"), slot(1, "18:30", "19:20")],
    },
  ]);
  const l1 = candidate("L1", 1, [
    { classNumber: "l1", slots: [slot(0, "18:30", "19:20")] }, // conflicts H (Mon)
  ]);
  const l2 = candidate("L2", 1, [
    { classNumber: "l2", slots: [slot(1, "18:30", "19:20")] }, // conflicts H (Tue)
  ]);

  // Default (value absent) → maximize weight → H alone.
  const byWeight = packMaxWeight([h, l1, l2]);
  assert.deepEqual(byWeight.chosen.map((c) => c.courseId).sort(), ["H"]);
  assert.equal(byWeight.totalWeight, 10);

  // Cardinality value = BASE + weight.
  const BASE = 1 + 10 + 1 + 1;
  const cardinality = [h, l1, l2].map((c) => ({ ...c, value: BASE + c.weight }));
  const byCardinality = packMaxWeight(cardinality);
  assert.deepEqual(
    byCardinality.chosen.map((c) => c.courseId).sort(),
    ["L1", "L2"],
  );
  assertDisjoint(byCardinality.chosen);
});

// --- sectionless (no-data) course never conflicts ---------------------------

test("packMaxWeight: a sectionless course (empty slots) is always packable", () => {
  const a = candidate("A", 10, [
    { classNumber: "a1", slots: [slot(0, "18:30", "19:20")] },
  ]);
  const nd: PackingCandidate = {
    courseId: "ND",
    weight: 3,
    credits: 4,
    sections: [{ slots: [] }], // no offering data
  };

  const res = packMaxWeight([a, nd]);

  assert.equal(res.chosen.length, 2);
  const ndChoice = res.chosen.find((c) => c.courseId === "ND")!;
  assert.equal(ndChoice.classNumber, undefined);
  assert.equal(ndChoice.cells.size, 0);
});


// ====================================================== bottleneck ======================================================


// --- fixture builder ---------------------------------------------------------



/** A section (Professor) occupying the given slots. */
function section(classNumber: string, slots: ClassSchedule[]): Professor {
  return {
    professorId: classNumber,
    name: "Fulano",
    classNumber,
    schedule: "",
    slots,
    enrolledStudents: 0,
    maxStudents: 40,
  };
}

/** An 18:30–20:20 two-cell night block on `day` (cells day:10, day:11). */
function nightBlockA(day: number): ClassSchedule {
  return slot(day, "18:30", "20:20");
}
/** A 20:20–22:00 two-cell night block on `day` (cells day:12, day:13). */
function nightBlockB(day: number): ClassSchedule {
  return slot(day, "20:20", "22:00");
}

// --- Task 3: bottleneck weights ---------------------------------------------

test("computeBottleneckWeights: A→B→C→D chain gives root A depth 3", () => {
  const a = course({ id: "A" });
  const b = course({ id: "B", prerequisites: ["A"] });
  const c = course({ id: "C", prerequisites: ["B"] });
  const d = course({ id: "D", prerequisites: ["C"] });

  const w = computeBottleneckWeights([a, b, c, d]);

  assert.equal(w.get("A")!.depth, 3);
  assert.equal(w.get("B")!.depth, 2);
  assert.equal(w.get("C")!.depth, 1);
  assert.equal(w.get("D")!.depth, 0);
  // dependents = transitive count downstream.
  assert.equal(w.get("A")!.dependents, 3);
  assert.equal(w.get("D")!.dependents, 0);
});

test("computeBottleneckWeights: depth dominates dependent count", () => {
  // Narrow-but-deep chain root: depth 3, 3 dependents.
  const a = course({ id: "A" });
  const b = course({ id: "B", prerequisites: ["A"] });
  const c = course({ id: "C", prerequisites: ["B"] });
  const d = course({ id: "D", prerequisites: ["C"] });
  // Wide-but-shallow fan root: depth 1, 5 dependents.
  const r = course({ id: "R" });
  const fan = ["F1", "F2", "F3", "F4", "F5"].map((id) =>
    course({ id, prerequisites: ["R"] }),
  );

  const w = computeBottleneckWeights([a, b, c, d, r, ...fan]);

  assert.equal(w.get("A")!.depth, 3);
  assert.equal(w.get("R")!.depth, 1);
  assert.equal(w.get("R")!.dependents, 5);
  assert.ok(w.get("A")!.dependents < w.get("R")!.dependents);
  // Despite fewer dependents, the deep chain root outranks the wide fan root.
  assert.ok(w.get("A")!.weight > w.get("R")!.weight);
});

test("computeBottleneckWeights: deterministic across runs", () => {
  const courses = [
    course({ id: "A" }),
    course({ id: "B", prerequisites: ["A"] }),
    course({ id: "C", prerequisites: ["A"] }),
  ];
  const first = computeBottleneckWeights(courses);
  const second = computeBottleneckWeights(courses);
  for (const id of ["A", "B", "C"]) {
    assert.deepEqual(first.get(id), second.get(id));
  }
});

test("computeBottleneckWeights: cycle guard yields finite depth", () => {
  // Pathological mutual prereq — must not recurse forever.
  const a = course({ id: "A", prerequisites: ["B"] });
  const b = course({ id: "B", prerequisites: ["A"] });
  const w = computeBottleneckWeights([a, b]);
  assert.ok(Number.isFinite(w.get("A")!.depth));
  assert.ok(Number.isFinite(w.get("B")!.depth));
});

// --- Task 4: collision detection (mirrors the SI INE5614 × INE5607 shapes) ---

test("analyzeBottlenecks: two roots that share Wed 18:30 across all sections collide", () => {
  // INE5614 shape: one Mon + Wed 18:30 block section.
  const eng = course({ id: "INE5614", name: "Engenharia de Software" });
  // INE5607 shape: two sections, both Wed + Thu 18:30 blocks.
  const org = course({ id: "INE5607", name: "Organização e Arquitetura" });
  const courses = [eng, org];
  const sections: Record<string, Professor[]> = {
    INE5614: [section("05238", [nightBlockA(0), nightBlockA(2)])],
    INE5607: [
      section("02238A", [nightBlockA(2), nightBlockA(3)]),
      section("02238B", [nightBlockA(2), nightBlockA(3)]),
    ],
  };

  const analysis = analyzeBottlenecks({
    remaining: courses,
    sections,
    turno: NIGHT,
    weights: computeBottleneckWeights(courses),
  });

  assert.equal(analysis.collisions.length, 1);
  const c = analysis.collisions[0];
  assert.deepEqual([c.a, c.b].sort(), ["INE5607", "INE5614"]);
  // The shared cells include the Wed 18:30 block (day 2, slots 10 & 11).
  assert.ok(c.sharedCells.includes("2:10"));
  assert.ok(c.sharedCells.includes("2:11"));
  assert.equal(c.floorImpact, 1);
});

test("analyzeBottlenecks: a third Tue-only root is not a false-positive collision", () => {
  const eng = course({ id: "INE5614", name: "Engenharia de Software" });
  const org = course({ id: "INE5607", name: "Organização e Arquitetura" });
  const tue = course({ id: "TUE", name: "Terça" }); // Tue-only → disjoint from both
  const courses = [eng, org, tue];
  const sections: Record<string, Professor[]> = {
    INE5614: [section("05238", [nightBlockA(0), nightBlockA(2)])],
    INE5607: [
      section("02238A", [nightBlockA(2), nightBlockA(3)]),
      section("02238B", [nightBlockA(2), nightBlockA(3)]),
    ],
    TUE: [section("01", [nightBlockA(1)])],
  };

  const analysis = analyzeBottlenecks({
    remaining: courses,
    sections,
    turno: NIGHT,
    weights: computeBottleneckWeights(courses),
  });

  // Still exactly one collision, and TUE appears in none.
  assert.equal(analysis.collisions.length, 1);
  assert.ok(
    !analysis.collisions.some((c) => c.a === "TUE" || c.b === "TUE"),
    "Tue-only root must not collide with the Wed-bound pair",
  );
});

// --- Task T1: clique-aware minimum-semesters floor --------------------------

test("analyzeBottlenecks: linear-chain floor equals chain length; a mutex pair is a 2-clique but the deeper chain dominates", () => {
  // Chain A→B→C→D on disjoint Tue/Fri blocks (4 semesters critical path).
  const a = course({ id: "A", name: "A" });
  const b = course({ id: "B", name: "B", prerequisites: ["A"] });
  const c = course({ id: "C", name: "C", prerequisites: ["B"] });
  const d = course({ id: "D", name: "D", prerequisites: ["C"] });
  const chain = [a, b, c, d];
  const chainSections: Record<string, Professor[]> = {
    A: [section("a", [nightBlockA(1)])], // Tue 18:30
    B: [section("b", [nightBlockB(1)])], // Tue 20:20
    C: [section("c", [nightBlockA(4)])], // Fri 18:30
    D: [section("d", [nightBlockB(4)])], // Fri 20:20
  };

  const chainOnly = analyzeBottlenecks({
    remaining: chain,
    sections: chainSections,
    turno: NIGHT,
    weights: computeBottleneckWeights(chain),
  });
  assert.equal(chainOnly.components.criticalPathFloor, 4);
  // No two courses are mutually exclusive → no clique, chromaticFloor 0.
  assert.equal(chainOnly.components.chromaticFloor, 0);
  assert.equal(chainOnly.bottleneckClique, null);
  assert.equal(chainOnly.minSemestersFloor, 4);

  // Add a same-phase mutually-exclusive pair (Mon+Wed vs Wed+Thu, all share Wed).
  const m = course({ id: "M", name: "M" });
  const n = course({ id: "N", name: "N" });
  const withPair = [...chain, m, n];
  const pairSections: Record<string, Professor[]> = {
    ...chainSections,
    M: [section("m", [nightBlockA(0), nightBlockA(2)])],
    N: [
      section("n1", [nightBlockA(2), nightBlockA(3)]),
      section("n2", [nightBlockA(2), nightBlockA(3)]),
    ],
  };

  const withCollision = analyzeBottlenecks({
    remaining: withPair,
    sections: pairSections,
    turno: NIGHT,
    weights: computeBottleneckWeights(withPair),
  });
  assert.ok(withCollision.collisions.some((x) => x.a === "M" && x.b === "N"));
  // {M,N} is a 2-clique → chromaticFloor 2, but the depth-4 chain dominates the
  // admissible floor (M/N schedule in parallel with the chain, not on top of it).
  assert.equal(withCollision.components.chromaticFloor, 2);
  assert.deepEqual(withCollision.bottleneckClique?.courseIds, ["M", "N"]);
  assert.equal(withCollision.minSemestersFloor, 4);
});

test("analyzeBottlenecks: k courses sharing one night cell form a k-clique that sets the floor (SI Monday-18:30 case)", () => {
  // Mirrors the maintainer's real jam: six mandatory courses offered ONLY
  // Monday 18:30, each with a single section on that one cell → all mutually
  // exclusive → a 6-clique. The clique number is the admissible floor (6), where
  // the old pairwise `+1` under-reported it as 5.
  const ids = ["INE5649", "INE5670", "INE5614", "INE5625", "INE5664", "INE5687"];
  const courses = ids.map((id) => course({ id }));
  const sections: Record<string, Professor[]> = Object.fromEntries(
    ids.map((id) => [id, [section(id, [slot(0, "18:30", "19:20")])]]), // Mon cell 0:10
  );

  const analysis = analyzeBottlenecks({
    remaining: courses,
    sections,
    turno: NIGHT,
    weights: computeBottleneckWeights(courses),
  });

  assert.equal(analysis.components.chromaticFloor, 6);
  assert.equal(analysis.minSemestersFloor, 6);
  assert.deepEqual(analysis.bottleneckClique?.courseIds, [...ids].sort());
  // The shared grid cell is Monday (day 0) 18:30 (slot index 10).
  assert.equal(analysis.bottleneckClique?.cell, "0:10");
  // Every member is mutually exclusive with the other five.
  for (const id of ids) assert.equal(analysis.conflictDegrees.get(id), 5);
});

// --- turno-aware capacity floor ---------------------------------------------

test("weekdayCellCapacity scales with the turno filter, not a fixed night constant", () => {
  // 14 TIME_SLOTS × 5 weekdays: 5 morning, 5 afternoon, 4 night rows.
  assert.equal(weekdayCellCapacity(NIGHT), 20);
  assert.equal(
    weekdayCellCapacity({ morning: true, afternoon: false, night: false }),
    25,
  );
  assert.equal(
    weekdayCellCapacity({ morning: true, afternoon: false, night: true }),
    45,
  );
  // All three or none == no preference == the whole weekday grid.
  assert.equal(
    weekdayCellCapacity({ morning: true, afternoon: true, night: true }),
    70,
  );
  assert.equal(
    weekdayCellCapacity({ morning: false, afternoon: false, night: false }),
    70,
  );
});

test("capacityFloor uses the filter's real capacity instead of over-stating it", () => {
  // 30 single-cell courses spread across the whole weekday grid, no two of them
  // mutually exclusive. Under an unrestricted filter that is 30 cells against a
  // 70-cell week → one semester. Dividing by the old hardcoded 20 night cells
  // would have claimed a floor of 2, and since searchMinSemesters early-stops
  // on `makespan <= floor`, an inflated floor makes the search quit early.
  const days = [0, 1, 2, 3, 4];
  const times: [string, string][] = [
    ["07:30", "08:20"],
    ["08:20", "09:10"],
    ["09:10", "10:10"],
    ["13:30", "14:20"],
    ["14:20", "15:10"],
    ["18:30", "19:20"],
  ];
  const courses: Course[] = [];
  const sections: Record<string, Professor[]> = {};
  for (const day of days) {
    for (const [start, end] of times) {
      const id = `C${day}${start.replace(":", "")}`;
      courses.push(course({ id }));
      sections[id] = [section(id, [slot(day, start, end)])];
    }
  }
  assert.equal(courses.length, 30);

  const analysis = analyzeBottlenecks({
    remaining: courses,
    sections,
    turno: { morning: true, afternoon: true, night: true },
    weights: computeBottleneckWeights(courses),
  });

  assert.equal(analysis.components.capacityFloor, 1);
  assert.equal(analysis.minSemestersFloor, 1);
});


// ====================================================== graduation ======================================================

/** Minimal course fixture (fields the function actually reads). */

/** Minimal student-course fixture. */
function sc(
  courseId: string,
  status: CourseStatus,
  credits = 4,
): StudentCourse {
  return { courseId, credits, status };
}

/** Wrap a flat list of student-courses into a single-semester StudentInfo. */
function infoWith(courses: StudentCourse[]): StudentInfo {
  return {
    currentDegree: "208_20191",
    interestedDegrees: [],
    name: "Test",
    currentPlan: 0,
    currentPhase: 1,
    plans: [
      {
        semesters: [{ number: 1, courses, totalCredits: 0 }],
      },
    ],
  };
}

// A real elective: type optional, not a generic placeholder. workload = 72h.
const elective = course({
  id: "INE5443",
  name: "Reconhecimento de Padrões",
  type: "optional",
  workload: 72,
});

// A generic elective placeholder (id contains OPT) — must NOT count.
const placeholder = course({
  id: "OPT0001",
  name: "Optativa I",
  type: "optional",
  workload: 72,
});

// A non-discipline graduation requirement — must never count as an optativa,
// even once issue #11 re-tags it off `mandatory` and it reads as `optional`.
const complementar = course({
  id: "INE7011",
  name: "Atividades Complementares 1",
  type: "mandatory",
  workload: 120,
});

// An ordinary mandatory discipline — never counts toward optativas.
const mandatory = course({
  id: "INE5401",
  name: "Programação Orientada a Objetos",
  type: "mandatory",
  workload: 72,
});

const allCourses = [elective, placeholder, complementar, mandatory];

test("zero progress → the full elective budget remains", () => {
  const info = infoWith([]);
  assert.deepEqual(computeGraduationReminder(info, allCourses), {
    optativasHours: 288,
  });
});

test("partial progress subtracts earned elective hours", () => {
  const info = infoWith([
    sc(elective.id, CourseStatus.COMPLETED), // 72h optativas
    sc(complementar.id, CourseStatus.COMPLETED), // not an optativa
  ]);
  assert.deepEqual(computeGraduationReminder(info, allCourses), {
    optativasHours: 288 - 72,
  });
});

test("over-earning clamps to 0 (never negative)", () => {
  // 5 electives × 72h = 360h > 288h required.
  const big = course({
    id: "INE5644",
    name: "Data Mining",
    type: "optional",
    workload: 360,
  });
  const info = infoWith([sc(big.id, CourseStatus.COMPLETED)]);
  const result = computeGraduationReminder(info, [big]);
  assert.equal(result.optativasHours, 0);
});

test("EXEMPTED counts the same as COMPLETED", () => {
  const info = infoWith([sc(elective.id, CourseStatus.EXEMPTED)]);
  assert.deepEqual(computeGraduationReminder(info, allCourses), {
    optativasHours: 288 - 72,
  });
});

test("PLANNED / IN_PROGRESS / FAILED do NOT count", () => {
  const info = infoWith([
    sc(elective.id, CourseStatus.PLANNED),
    sc(complementar.id, CourseStatus.IN_PROGRESS),
    sc(elective.id, CourseStatus.FAILED),
  ]);
  assert.deepEqual(computeGraduationReminder(info, allCourses), {
    optativasHours: 288,
  });
});

test("mandatory disciplines do NOT count toward optativas", () => {
  const info = infoWith([sc(mandatory.id, CourseStatus.COMPLETED)]);
  assert.deepEqual(computeGraduationReminder(info, allCourses), {
    optativasHours: 288,
  });
});

test("generic elective placeholders do NOT count toward optativas", () => {
  const info = infoWith([sc(placeholder.id, CourseStatus.COMPLETED)]);
  assert.deepEqual(computeGraduationReminder(info, allCourses), {
    optativasHours: 288,
  });
});


// ======================================================= electives =======================================================

// --- fixture builders --------------------------------------------------------

/** A genuine (non-placeholder) elective — real id, no "OPT"/"optativa" tell. */
function optativa(
  partial: Partial<Course> & { id: string; name: string },
): Course {
  return {
    credits: 4,
    type: "optional",
    phase: 1,
    equivalents: [],
    prerequisites: [],
    ...partial,
  };
}



/**
 * Build an input. `history` seeds `plans[0]` (e.g. a completed optativa that
 * lowers the remaining 288h demand); default is an empty plan.
 */

/** Count of appended elective-only semesters on the primary scenario. */
function electiveOnly(scenario: PlanScenario): number {
  return scenario.electiveOnlySemesters;
}

/** A completed optativa in semester 1 that earned `workload` hours of demand. */
function completedOptativaHistory(id: string, workload: number): StudentPlan {
  return {
    semesters: [
      {
        number: 1,
        totalCredits: 4,
        courses: [
          {
            courseId: id,
            instanceId: `hist-${id}`,
            credits: 4,
            status: CourseStatus.COMPLETED,
            phase: 1,
          },
        ],
      },
    ],
  };
}

const primary = (r: { scenarios: PlanScenario[] }): PlanScenario => r.scenarios[0];

/** Ids of every course placed anywhere in the generated plan. */

// --- buildElectivePool -------------------------------------------------------

test("buildElectivePool: keeps offered real optativas, drops placeholders/unoffered", () => {
  const real = optativa({ id: "INE5453", name: "Computação Gráfica" });
  const placeholder = optativa({ id: "OPT0001", name: "Optativa" }); // generic slot
  const unoffered = optativa({ id: "INE5460", name: "Sem Oferta" });
  const sections: Record<string, Professor[]> = {
    INE5453: [prof("INE5453", "01", 0, "18:30", "20:10")],
    OPT0001: [prof("OPT0001", "01", 1, "18:30", "20:10")],
    // INE5460 has no sections
  };

  const pool = buildElectivePool(
    [real, placeholder, unoffered],
    sections,
    { semesters: [] },
    noEquiv,
    NO_PREF,
  );

  assert.deepEqual(pool.map((c) => c.id), ["INE5453"]);
});

test("buildElectivePool: excludes an optativa already completed in the plan; orders by phase then id", () => {
  const a = optativa({ id: "INE5455", name: "B", phase: 5 });
  const b = optativa({ id: "INE5410", name: "A", phase: 2 });
  const done = optativa({ id: "INE5430", name: "Done", phase: 2 });
  const sections: Record<string, Professor[]> = {
    INE5455: [prof("INE5455", "01", 0, "18:30", "20:10")],
    INE5410: [prof("INE5410", "01", 1, "18:30", "20:10")],
    INE5430: [prof("INE5430", "01", 2, "18:30", "20:10")],
  };
  const history = completedOptativaHistory("INE5430", 72);

  const pool = buildElectivePool(
    [a, b, done],
    sections,
    history,
    noEquiv,
    NO_PREF,
  );

  // Done excluded; remaining ordered phase asc (INE5410 phase 2 before INE5455 phase 5).
  assert.deepEqual(pool.map((c) => c.id), ["INE5410", "INE5455"]);
});

// --- fill via generatePlanScenarios -----------------------------------------

test("zero remaining demand → no optativa scheduled, plan is mandatory-only", () => {
  const m = course({ id: "M", name: "Mand" });
  const o1 = optativa({ id: "OA", name: "Opt A" });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 1, "18:30", "20:10")],
  };
  // 288h already earned → demand 0.
  const input = makeInput([m, o1], sections, {
    history: completedOptativaHistory("ODONE", 288),
  });
  // ODONE isn't in the curriculum courses, so add it so the reminder counts it.
  input.courses.push(optativa({ id: "ODONE", name: "Done", workload: 288 }));

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.optativasPlacedHours, 0);
  assert.equal(scenario.graduationReminder.optativasHours, 0);
  assert.ok(!placedIds(scenario).has("OA"), "OA must not be scheduled");
});

test("partial demand → fills free slots and stops once demand is met", () => {
  const m = course({ id: "M", name: "Mand" });
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const ob = optativa({ id: "OB", name: "Opt B", workload: 72 });
  const done = optativa({ id: "ODONE", name: "Done", workload: 216 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 1, "18:30", "20:10")], // distinct cells → no conflict
    OB: [prof("OB", "01", 2, "18:30", "20:10")],
    ODONE: [prof("ODONE", "01", 3, "18:30", "20:10")],
  };
  // 216 earned → demand 72 → exactly one 72h optativa placed.
  const input = makeInput([m, oa, ob, done], sections, {
    history: completedOptativaHistory("ODONE", 216),
  });

  const scenario = primary(generatePlanScenarios(input));
  const ids = placedIds(scenario);

  assert.equal(scenario.optativasPlacedHours, 72);
  assert.equal(scenario.graduationReminder.optativasHours, 0);
  assert.ok(ids.has("OA"), "first pool optativa placed");
  assert.ok(!ids.has("OB"), "second optativa not placed once demand met");
});

test("demand exceeds offered pool → places all it can, reports the shortfall", () => {
  const m = course({ id: "M", name: "Mand" });
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const ob = optativa({ id: "OB", name: "Opt B", workload: 72 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 1, "18:30", "20:10")],
    OB: [prof("OB", "01", 2, "18:30", "20:10")],
  };
  // No completed electives → full 288h demand, pool only covers 144h.
  const input = makeInput([m, oa, ob], sections);

  const scenario = primary(generatePlanScenarios(input));
  const ids = placedIds(scenario);

  assert.equal(scenario.optativasPlacedHours, 144);
  assert.equal(scenario.graduationReminder.optativasHours, 288 - 144);
  assert.ok(ids.has("OA") && ids.has("OB"), "both offered optativas placed");
});

test("an optativa with no turno-valid section is never placed (excluded from pool)", () => {
  const m = course({ id: "M", name: "Mand" });
  // OA is offered only in the morning; a night-only student can never take it.
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 0, "07:30", "09:10")],
  };
  const input = makeInput([m, oa], sections, { turno: NIGHT_ONLY });

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.optativasPlacedHours, 0);
  assert.ok(!placedIds(scenario).has("OA"), "morning-only optativa not placed");
});

test("elective fill respects the per-semester credit cap, spilling to a new semester", () => {
  const m = course({ id: "M", name: "Mand" }); // 4 credits
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 }); // 4 credits
  const ob = optativa({ id: "OB", name: "Opt B", workload: 72 }); // 4 credits
  const done = optativa({ id: "ODONE", name: "Done", workload: 144 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 1, "18:30", "20:10")],
    OB: [prof("OB", "01", 2, "18:30", "20:10")],
    ODONE: [prof("ODONE", "01", 3, "18:30", "20:10")],
  };
  // 144 earned → demand 144 (two 72h optativas). Cap 8 → M(4)+OA(4) fill the
  // generated semester; OB spills into one elective-only semester.
  const input = makeInput([m, oa, ob, done], sections, {
    creditCap: 8,
    history: completedOptativaHistory("ODONE", 144),
  });

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.optativasPlacedHours, 144, "both optativas placed across semesters");
  assert.equal(electiveOnly(scenario), 1, "one elective-only semester appended");
  assert.equal(scenario.graduationReminder.optativasHours, 0);
  for (const sem of scenario.plan.semesters) {
    assert.ok(sem.totalCredits <= 8, `semester ${sem.number} within cap`);
  }
});

// --- US-1: elective-only tail semesters -------------------------------------

test("demand met inside existing free slots appends no extra semester", () => {
  const m = course({ id: "M", name: "Mand" });
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const done = optativa({ id: "ODONE", name: "Done", workload: 216 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 1, "18:30", "20:10")], // free cell in M's semester
    ODONE: [prof("ODONE", "01", 3, "18:30", "20:10")],
  };
  // demand 72 → OA fits beside M, no tail semester needed.
  const input = makeInput([m, oa, done], sections, {
    history: completedOptativaHistory("ODONE", 216),
  });

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.optativasPlacedHours, 72);
  assert.equal(electiveOnly(scenario), 0, "no elective-only semester");
});

test("remaining demand appends elective-only semesters until it hits 0", () => {
  const m = course({ id: "M", name: "Mand" }); // fills its own semester at cap
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const ob = optativa({ id: "OB", name: "Opt B", workload: 72 });
  const done = optativa({ id: "ODONE", name: "Done", workload: 144 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 0, "18:30", "20:10")], // both clash with M's cell...
    OB: [prof("OB", "01", 0, "18:30", "20:10")], // ...so neither fits beside M
    ODONE: [prof("ODONE", "01", 3, "18:30", "20:10")],
  };
  // demand 144; OA/OB clash with M so they can't share M's semester → each needs
  // its own elective-only semester (they also clash with each other).
  const input = makeInput([m, oa, ob, done], sections, {
    history: completedOptativaHistory("ODONE", 144),
  });

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.optativasPlacedHours, 144);
  assert.equal(scenario.graduationReminder.optativasHours, 0);
  assert.equal(electiveOnly(scenario), 2, "two elective-only semesters appended");
});

test("makespan headline excludes appended elective-only semesters", () => {
  const m = course({ id: "M", name: "Mand" });
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 0, "18:30", "20:10")], // clashes with M → tail semester
  };
  const input = makeInput([m, oa], sections); // demand 288

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.totalFutureSemesters, 1, "one mandatory semester (M)");
  assert.ok(electiveOnly(scenario) >= 1, "OA forced into a tail semester");
});

test("pool exhausted appends what it can and still reports the shortfall", () => {
  const m = course({ id: "M", name: "Mand" });
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "18:30", "20:10")],
    OA: [prof("OA", "01", 0, "18:30", "20:10")], // clashes with M
  };
  const input = makeInput([m, oa], sections); // demand 288, pool only 72h

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.optativasPlacedHours, 72);
  assert.equal(scenario.graduationReminder.optativasHours, 288 - 72);
  assert.equal(electiveOnly(scenario), 1);
});

test("empty-mandatory plan with elective demand appends elective-only semesters", () => {
  // No mandatory courses at all → makespan 0, but 288h of optativas are owed.
  const oa = optativa({ id: "OA", name: "Opt A", workload: 72 });
  const ob = optativa({ id: "OB", name: "Opt B", workload: 72 });
  const sections: Record<string, Professor[]> = {
    OA: [prof("OA", "01", 0, "18:30", "20:10")],
    OB: [prof("OB", "01", 1, "18:30", "20:10")],
  };
  const input = makeInput([oa, ob], sections); // demand 288

  const scenario = primary(generatePlanScenarios(input));

  assert.equal(scenario.totalFutureSemesters, 0, "no mandatory semesters");
  assert.ok(electiveOnly(scenario) >= 1, "elective-only semesters appended");
  assert.equal(scenario.optativasPlacedHours, 144, "both optativas placed");
});


// ======================================================== generate ========================================================

// --- fixture builders --------------------------------------------------------


/** One offering (section) for a course, occupying a single grid slot. */

const MORNING_ONLY: TurnoFilter = { morning: true, afternoon: false, night: false };



/** Semester number a course landed in, or undefined if unplaced. */
function placedSemester(scenario: PlanScenario, courseId: string): number | undefined {
  for (const sem of scenario.plan.semesters) {
    if (sem.courses.some((c) => c.courseId === courseId)) return sem.number;
  }
  return undefined;
}

/** Every courseId present in the generated plan. */

// --- (a) prereq chain sequences consecutively -------------------------------

test("a prereq chain A→B→C lands in strictly increasing consecutive semesters, in order", () => {
  const a = course({ id: "A", name: "A" });
  const b = course({ id: "B", name: "B", prerequisites: ["A"] });
  const c = course({ id: "C", name: "C", prerequisites: ["B"] });
  const sections: Record<string, Professor[]> = {
    A: [prof("A", "01", 0, "07:30", "08:20")],
    B: [prof("B", "01", 0, "07:30", "08:20")],
    C: [prof("C", "01", 0, "07:30", "08:20")],
  };
  const input = makeInput([a, b, c], sections, NO_PREF);

  const scenario = runGreedy(input, seed(input.config));
  const sa = placedSemester(scenario, "A");
  const sb = placedSemester(scenario, "B");
  const sc = placedSemester(scenario, "C");

  assert.equal(scenario.unplaceable.length, 0);
  assert.ok(sa !== undefined && sb !== undefined && sc !== undefined);
  assert.equal(sb, sa! + 1);
  assert.equal(sc, sb! + 1);
});

// --- (b) dependent of an unplaceable prereq is reported, not dropped --------

test("a mandatory course whose prereq is unplaceable appears in unplaceable (reason prereq), never missing", () => {
  // E's only section is morning, but the run wants night-only → E is unplaceable.
  const e = course({ id: "E", name: "E" });
  const d = course({ id: "D", name: "D", prerequisites: ["E"] });
  const sections: Record<string, Professor[]> = {
    E: [prof("E", "01", 0, "07:30", "08:20")], // morning only
    D: [prof("D", "01", 0, "18:30", "19:20")], // night (would fit) — irrelevant, prereq blocks
  };
  const input = makeInput([e, d], sections, NIGHT_ONLY);

  const scenario = runGreedy(input, seed(input.config));

  assert.equal(placedSemester(scenario, "D"), undefined); // not silently placed
  const dEntry = scenario.unplaceable.find((u) => u.courseId === "D");
  assert.ok(dEntry, "D must be reported as unplaceable, not missing");
  assert.equal(dEntry!.reason, "prereq");
});

// --- (c) invariant: placed ∪ unplaceable == R, pseudo-course in neither ------

test("invariant: {placed} ∪ {unplaceable} equals the schedulable mandatory disciplines; pseudo-course in neither", () => {
  const p = course({ id: "P100", name: "Programação I" });
  const x = course({ id: "X100", name: "Estrutura de Dados" });
  const n = course({ id: "N100", name: "Redes de Computadores" });
  const ac = course({ id: "AC100", name: "Atividades Complementares 1", phase: 0 });

  const sections: Record<string, Professor[]> = {
    P100: [prof("P100", "01", 0, "07:30", "08:20")], // morning
    X100: [prof("X100", "01", 0, "07:30", "08:20")], // morning, same slot → conflicts with P
    N100: [prof("N100", "01", 0, "18:30", "19:20")], // night only → no morning section
    // AC100 intentionally has NO section entry.
  };
  const input = makeInput([p, x, n, ac], sections, MORNING_ONLY);

  const scenario = runGreedy(input, seed(input.config));

  const placed = placedIds(scenario);
  const unplaceable = new Set(scenario.unplaceable.map((u) => u.courseId));
  const union = new Set([...placed, ...unplaceable]);
  const R = new Set(["P100", "X100", "N100"]);

  // Exact set equality, both directions.
  assert.deepEqual([...union].sort(), [...R].sort());

  // The pseudo-course leaks nowhere.
  assert.ok(!placed.has("AC100"));
  assert.ok(!unplaceable.has("AC100"));
  assert.ok(!scenario.placedWithoutSection.includes("AC100"));

  // Sanity on the individual outcomes exercised by the fixture.
  assert.ok(placed.has("P100"));
  assert.ok(placed.has("X100")); // conflict rolled it forward, still placed
  assert.equal(placedSemester(scenario, "X100"), placedSemester(scenario, "P100")! + 1);
  const nEntry = scenario.unplaceable.find((u) => u.courseId === "N100");
  assert.equal(nEntry?.reason, "no-section-in-turno");
});

// --- (d) regression: both project-name variants place via the normal path ----

test("regression: 'Projetos I' and 'Projeto Integrador I' both get placed", () => {
  const projetos = course({ id: "PROJ1", name: "Projetos I" });
  const integrador = course({ id: "PROJINT1", name: "Projeto Integrador I" });
  const sections: Record<string, Professor[]> = {
    PROJ1: [prof("PROJ1", "01", 0, "07:30", "08:20")],
    PROJINT1: [prof("PROJINT1", "01", 1, "07:30", "08:20")],
  };
  const input = makeInput([projetos, integrador], sections, NO_PREF);

  const scenario = runGreedy(input, seed(input.config));

  assert.notEqual(placedSemester(scenario, "PROJ1"), undefined);
  assert.notEqual(placedSemester(scenario, "PROJINT1"), undefined);
  assert.equal(scenario.unplaceable.length, 0);
});

// --- (e) night filter drops a daytime-only course ---------------------------

test("night filter: a course whose only section is daytime is not placed (no-section-in-turno)", () => {
  const day = course({ id: "DAY", name: "Diurna" });
  const sections: Record<string, Professor[]> = {
    DAY: [prof("DAY", "01", 0, "13:30", "14:20")], // afternoon only
  };
  const input = makeInput([day], sections, NIGHT_ONLY);

  const scenario = runGreedy(input, seed(input.config));

  assert.equal(placedSemester(scenario, "DAY"), undefined);
  const entry = scenario.unplaceable.find((u) => u.courseId === "DAY");
  assert.ok(entry, "daytime-only course must be reported unplaceable");
  assert.equal(entry!.reason, "no-section-in-turno");
});

// --- (f) INE5638 Saturday-only IS placed, consumes zero weekday capacity -----

test("whitelist: INE5638 (Saturday-only) is placed and shares its semester with a night course", () => {
  const proj = course({ id: "INE5638", name: "Introdução a Projetos" });
  const night = course({ id: "NIGHT", name: "Noturna" });
  const sections: Record<string, Professor[]> = {
    // Only offering is Saturday morning → stripped as neutral → zero cells.
    INE5638: [prof("INE5638", "07238", 5, "08:20", "10:00")],
    NIGHT: [prof("NIGHT", "01", 0, "18:30", "19:20")],
  };
  const input = makeInput([proj, night], sections, NIGHT_ONLY);

  const scenario = runGreedy(input, seed(input.config));

  const sProj = placedSemester(scenario, "INE5638");
  const sNight = placedSemester(scenario, "NIGHT");
  assert.ok(sProj !== undefined, "INE5638 must be placed via the whitelist");
  assert.ok(!scenario.unplaceable.some((u) => u.courseId === "INE5638"));
  // Zero weekday capacity → the night course still fits the same semester.
  assert.equal(sProj, sNight);
});

// --- (g) whitelist is id-based, not name-based ------------------------------

test("whitelist is by id: a different course named 'Introdução a Projetos' is NOT whitelisted", () => {
  // Same NAME as the whitelisted course, different id, daytime-only section.
  const impostor = course({ id: "XYZ9999", name: "Introdução a Projetos" });
  const real = course({ id: "INE5638", name: "Introdução a Projetos" });
  const sections: Record<string, Professor[]> = {
    XYZ9999: [prof("XYZ9999", "01", 0, "13:30", "14:20")], // afternoon only
    INE5638: [prof("INE5638", "07238", 5, "08:20", "10:00")], // Saturday
  };
  const input = makeInput([impostor, real], sections, NIGHT_ONLY);

  const scenario = runGreedy(input, seed(input.config));

  // The real id is whitelisted → placed.
  assert.ok(placedSemester(scenario, "INE5638") !== undefined);
  // The name-twin is NOT → dropped as no-section-in-turno.
  assert.equal(placedSemester(scenario, "XYZ9999"), undefined);
  const entry = scenario.unplaceable.find((u) => u.courseId === "XYZ9999");
  assert.equal(entry?.reason, "no-section-in-turno");
});

// --- (h) capacity spread: >5 co-startable night courses spread ~5/semester ---

test("capacity: 7 no-prereq night courses spread across semesters ~5 at a time, none dropped", () => {
  // Each 4-credit course occupies a whole weekday night (18:30–21:50 = the four
  // night cells of one day). Each is offered on all five weekdays, so up to five
  // can co-fit one night week (one per day); the rest roll forward.
  const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];
  const courses = ids.map((id) => course({ id, name: id, credits: 4 }));
  const sections: Record<string, Professor[]> = {};
  for (const id of ids) {
    sections[id] = [0, 1, 2, 3, 4].map((day) =>
      prof(id, `d${day}`, day, "18:30", "21:50"),
    );
  }
  const input = makeInput(courses, sections, NIGHT_ONLY);

  const scenario = runGreedy(input, seed(input.config));

  // None dropped.
  assert.equal(scenario.unplaceable.length, 0);
  const placed = placedIds(scenario);
  for (const id of ids) assert.ok(placed.has(id), `${id} must be placed`);

  // No generated semester exceeds the five-weekday-night capacity.
  for (const sem of scenario.plan.semesters) {
    assert.ok(sem.courses.length <= 5, `semester ${sem.number} over capacity`);
  }
  // The earliest generated semester is packed to the full five.
  const first = scenario.plan.semesters.find((s) => s.courses.length > 0)!;
  assert.equal(first.courses.length, 5);
});

// --- (i) min-semester search never regresses the single pass -----------------

test("no-regression: the min-semester search is never worse than runGreedy", () => {
  // The capacity-spread fixture: the search includes the weight strategy, so its
  // makespan must be ≤ the single-pass baseline on the same input.
  const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];
  const courses = ids.map((id) => course({ id, name: id, credits: 4 }));
  const sections: Record<string, Professor[]> = {};
  for (const id of ids) {
    sections[id] = [0, 1, 2, 3, 4].map((day) =>
      prof(id, `d${day}`, day, "18:30", "21:50"),
    );
  }
  const input = makeInput(courses, sections, NIGHT_ONLY);

  const baseline = runGreedy(input, seed(input.config)).totalFutureSemesters;
  const searched = searchMinSemesters(input, input.config).totalFutureSemesters;
  assert.ok(searched <= baseline, `search ${searched} must be ≤ baseline ${baseline}`);
});

// --- (j) turno slot-capacity generalizes beyond night-only (#10) -------------
//
// The packer's conflict math is cell-based and turno-agnostic; eligibility is
// gated by the turno filter. These fixtures verify morning / afternoon / mixed
// packing packs as many conflict-free courses as the grid allows — the case
// Sprint 03 left "verified for night-only" only.

const AFTERNOON_ONLY: TurnoFilter = {
  morning: false,
  afternoon: true,
  night: false,
};

test("morning-only: two conflict-free morning courses share one semester", () => {
  const a = course({ id: "A", name: "A" });
  const b = course({ id: "B", name: "B" });
  const sections: Record<string, Professor[]> = {
    A: [prof("A", "01", 0, "07:30", "09:10")], // Mon morning
    B: [prof("B", "01", 1, "07:30", "09:10")], // Tue morning (distinct cell)
  };
  const input = makeInput([a, b], sections, MORNING_ONLY);

  const scenario = searchMinSemesters(input, input.config);

  assert.equal(scenario.unplaceable.length, 0);
  assert.equal(placedSemester(scenario, "A"), placedSemester(scenario, "B"),
    "both morning courses land in the same semester");
});

test("no-preference: morning + afternoon + night courses co-schedule in one semester", () => {
  // Different turnos never share a cell, so the mixed grid fits all three at once
  // — proving capacity is not capped at the ten night cells.
  const m = course({ id: "M", name: "Manhã" });
  const t = course({ id: "T", name: "Tarde" });
  const n = course({ id: "N", name: "Noite" });
  const sections: Record<string, Professor[]> = {
    M: [prof("M", "01", 0, "08:20", "10:10")],
    T: [prof("T", "01", 0, "13:30", "15:10")],
    N: [prof("N", "01", 0, "18:30", "20:20")],
  };
  const input = makeInput([m, t, n], sections, NO_PREF);

  const scenario = searchMinSemesters(input, input.config);

  assert.equal(scenario.unplaceable.length, 0);
  assert.equal(placedSemester(scenario, "M"), placedSemester(scenario, "T"));
  assert.equal(placedSemester(scenario, "T"), placedSemester(scenario, "N"));
  assert.equal(scenario.totalFutureSemesters, 1, "all three fit one semester");
});

test("same cell still defers across turnos: two afternoon courses at the same slot split", () => {
  const a = course({ id: "A", name: "A" });
  const b = course({ id: "B", name: "B" });
  const sections: Record<string, Professor[]> = {
    A: [prof("A", "01", 2, "13:30", "15:10")], // Wed afternoon
    B: [prof("B", "01", 2, "13:30", "15:10")], // same cell → must not co-schedule
  };
  const input = makeInput([a, b], sections, AFTERNOON_ONLY);

  const scenario = searchMinSemesters(input, input.config);

  assert.equal(scenario.unplaceable.length, 0);
  assert.notEqual(placedSemester(scenario, "A"), placedSemester(scenario, "B"),
    "same-cell afternoon courses land in different semesters");
});


// ========================================================== search ==========================================================

// --- fixture builders --------------------------------------------------------




/** Single-cell night slots: 18:30 → day:10, 19:20 → day:11, 20:20 → day:12. */




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

test("daytime exception: generatePlanScenarios contrasts the baseline vs 1-de-manhã, drops a non-improving B=2", () => {
  const result = generatePlanScenarios(daytimeCliqueInput(2));

  // Every course here is 4 credits and mutually exclusive at night, so the
  // credit cap never binds and all three load variants collapse to one card.
  assert.equal(result.scenarios.length, 2);

  const [baseline, morning] = result.scenarios;
  assert.equal(baseline.label, "Máximo");
  assert.equal(baseline.totalFutureSemesters, 3);
  assert.equal(baseline.daytimeExceptionsUsed, 0);

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

test("daytime exception: with budget 0 only the load baseline is offered", () => {
  const result = generatePlanScenarios(daytimeCliqueInput(0));
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0].label, "Máximo");
  assert.equal(result.scenarios[0].daytimeExceptionsUsed, 0);
});

// --- load variants -----------------------------------------------------------

/**
 * 12 conflict-free 4-credit courses across distinct night cells, so the CREDIT
 * CAP — not the schedule — is what decides how many fit per semester. That is
 * the situation the speed-vs-load comparison exists for.
 */
function loadVariantInput(creditCap: number): GeneratorInput {
  const courses: Course[] = [];
  const sections: Record<string, Professor[]> = {};
  const cells = [cell10, cell11, cell12];
  let i = 0;
  for (let day = 0; day < 4; day++) {
    for (const cell of cells) {
      const id = `L${i++}`;
      courses.push(course({ id }));
      sections[id] = [prof(id, "1", [cell(day)])];
    }
  }
  return makeInput(courses, sections, NIGHT, creditCap);
}

test("load variants offer a real speed-vs-load trade-off", () => {
  const result = generatePlanScenarios(loadVariantInput(30));
  const byLabel = new Map(result.scenarios.map((s) => [s.label, s]));

  assert.ok(byLabel.has("Máximo"));
  assert.ok(byLabel.has("Equilibrado"));
  assert.ok(byLabel.has("Carga leve"));

  const max = byLabel.get("Máximo")!;
  const balanced = byLabel.get("Equilibrado")!;
  const light = byLabel.get("Carga leve")!;

  // Caps are 30 / 21 / 15 → 7 / 5 / 3 courses per semester over 12 courses.
  assert.equal(max.config.creditCap, 30);
  assert.equal(balanced.config.creditCap, 21);
  assert.equal(light.config.creditCap, 15);

  // Lighter load strictly costs semesters — that IS the trade-off.
  assert.ok(max.totalFutureSemesters < balanced.totalFutureSemesters);
  assert.ok(balanced.totalFutureSemesters < light.totalFutureSemesters);

  // …and buys a lower peak per-semester load.
  const peak = (s: (typeof max)) => Math.max(...s.perSemesterCredits);
  assert.ok(peak(light) < peak(balanced));
  assert.ok(peak(balanced) < peak(max));
});

test("load variants that render identically are collapsed to one card", () => {
  // The clique fixture is schedule-bound, not credit-bound, so every cap
  // produces the same plan — showing it three times would be noise.
  const result = generatePlanScenarios(daytimeCliqueInput(0));
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0].label, "Máximo");
});

test("a tiny credit cap does not emit duplicate variants", () => {
  // cap 10 → variants floor at MIN_VARIANT_CAP (8), so 10/8/8 dedupes to 10/8.
  const result = generatePlanScenarios(loadVariantInput(10));
  const caps = result.scenarios.map((s) => s.config.creditCap);
  assert.deepEqual([...new Set(caps)], caps, "each card must use a distinct cap");
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

// --- turno-derived scenario labels ------------------------------------------

test("baselineLabel reflects the chosen filter, not a hardcoded 'Só à noite'", () => {
  assert.equal(baselineLabel(NIGHT), "Só à noite");
  assert.equal(
    baselineLabel({ morning: true, afternoon: false, night: false }),
    "Só de manhã",
  );
  assert.equal(
    baselineLabel({ morning: false, afternoon: true, night: false }),
    "Só à tarde",
  );
  assert.equal(
    baselineLabel({ morning: true, afternoon: false, night: true }),
    "Manhã e Noite",
  );
  // All three or none both mean "no preference".
  assert.equal(baselineLabel(NO_PREF), "Qualquer turno");
  assert.equal(
    baselineLabel({ morning: false, afternoon: false, night: false }),
    "Qualquer turno",
  );
});

test("exceptionLabel names the turno the promoted sections actually landed in", () => {
  const promotedTo = (startTime: string) => [
    { courseId: "X", classNumber: "1", slots: [slot(0, startTime, "09:10")] },
  ];
  assert.equal(exceptionLabel(promotedTo("08:20"), 1), "1 de manhã");
  assert.equal(exceptionLabel(promotedTo("14:20"), 1), "1 à tarde");
  // Mixed turnos across promotions → a neutral label, never a wrong one.
  assert.equal(
    exceptionLabel(
      [
        { courseId: "X", classNumber: "1", slots: [slot(0, "08:20", "09:10")] },
        { courseId: "Y", classNumber: "1", slots: [slot(1, "14:20", "15:10")] },
      ],
      2,
    ),
    "2 fora do turno",
  );
  // Budget spent but nothing actually promoted → falls back to the budget.
  assert.equal(exceptionLabel([], 2), "2 fora do turno");
});

test("an unrestricted filter gets no turno-exception card, and says why", () => {
  // Same fixture as the clique test but with no turno restriction: the packer
  // already sees every section, so there is nothing left to "promote". The
  // modal needs the flag to explain that instead of looking broken.
  const input = daytimeCliqueInput(2);
  input.config = { ...input.config, turno: NO_PREF };

  const result = generatePlanScenarios(input);
  assert.equal(result.turnoIsUnrestricted, true);
  assert.equal(
    result.scenarios.every((s) => s.daytimeExceptionsUsed === 0),
    true,
    "an unrestricted filter can produce no turno exception",
  );

  // A restricted filter is not flagged, and still gets its comparison card.
  const restricted = generatePlanScenarios(daytimeCliqueInput(2));
  assert.equal(restricted.turnoIsUnrestricted, false);
  assert.ok(restricted.scenarios.some((s) => s.daytimeExceptionsUsed > 0));
});
