/**
 * Tests for the deterministic packer (Defect 2: every remaining schedulable
 * mandatory discipline is placed or reported unplaceable — never silently
 * dropped — and prereq-linked chains still land consecutively without the
 * removed sequence-group machinery).
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`). Fixtures are plain `Course[]` / `StudentInfo` / `sections`
 * objects matching the real shapes (`types/student-plan.ts`,
 * `parsers/class-parser.ts`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Course } from "@/types/curriculum";
import type { StudentInfo } from "@/types/student-plan";
import type { Professor } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import { runGreedy, type RunSeed } from "@/lib/plan-generator/generate";
import type { GeneratorInput, PlanScenario } from "@/lib/plan-generator/types";

// --- fixture builders --------------------------------------------------------

function course(
  partial: Partial<Course> & { id: string; name: string },
): Course {
  return {
    credits: 4,
    type: "mandatory",
    phase: 1,
    equivalents: [],
    prerequisites: [],
    ...partial,
  };
}

/** One offering (section) for a course, occupying a single grid slot. */
function prof(
  courseId: string,
  classNumber: string,
  day: number,
  startTime: string,
  endTime: string,
): Professor {
  return {
    professorId: `${courseId}_${classNumber}`,
    name: "Fulano",
    classNumber,
    schedule: `${startTime}-${endTime}`,
    slots: [{ day, startTime, endTime, location: "" }],
    enrolledStudents: 0,
    maxStudents: 40,
  };
}

const NO_PREF: TurnoFilter = { morning: true, afternoon: true, night: true };
const MORNING_ONLY: TurnoFilter = { morning: true, afternoon: false, night: false };
const NIGHT_ONLY: TurnoFilter = { morning: false, afternoon: false, night: true };

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

/** Semester number a course landed in, or undefined if unplaced. */
function placedSemester(scenario: PlanScenario, courseId: string): number | undefined {
  for (const sem of scenario.plan.semesters) {
    if (sem.courses.some((c) => c.courseId === courseId)) return sem.number;
  }
  return undefined;
}

/** Every courseId present in the generated plan. */
function placedIds(scenario: PlanScenario): Set<string> {
  const ids = new Set<string>();
  for (const sem of scenario.plan.semesters) {
    for (const c of sem.courses) ids.add(c.courseId);
  }
  return ids;
}

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
