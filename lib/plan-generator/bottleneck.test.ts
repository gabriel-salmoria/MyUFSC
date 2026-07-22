/**
 * Tests for the bottleneck signals: `computeBottleneckWeights` (Task 3) and the
 * schedule-collision floor detector (Task 4).
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Course } from "@/types/curriculum";
import type { Professor, ClassSchedule } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import { computeBottleneckWeights } from "@/lib/prerequisites";
import { analyzeBottlenecks } from "@/lib/plan-generator/bottleneck";

const NIGHT: TurnoFilter = { morning: false, afternoon: false, night: true };

// --- fixture builder ---------------------------------------------------------

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

// --- Task 4: minimum-semesters floor ----------------------------------------

test("analyzeBottlenecks: linear-chain floor equals chain length, +1 with a mutex pair", () => {
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
  assert.equal(chainOnly.components.collisionAdjustment, 0);
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
  assert.equal(withCollision.components.collisionAdjustment, 1);
  assert.equal(withCollision.minSemestersFloor, 5); // chain length + 1
});
