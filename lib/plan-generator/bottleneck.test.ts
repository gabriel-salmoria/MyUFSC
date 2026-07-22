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
import { computeBottleneckWeights } from "@/lib/prerequisites";

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
