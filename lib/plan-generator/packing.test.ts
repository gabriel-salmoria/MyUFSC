/**
 * Tests for the per-semester max-weight section-packing solver (Task 1).
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ClassSchedule } from "@/parsers/class-parser";
import {
  packMaxWeight,
  type PackingCandidate,
} from "@/lib/plan-generator/packing";

/** A single night grid cell as a section slot. */
function slot(day: number, startTime: string, endTime: string): ClassSchedule {
  return { day, startTime, endTime, location: "" };
}

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
