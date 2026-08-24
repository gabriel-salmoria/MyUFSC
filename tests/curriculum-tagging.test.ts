/**
 * Tests for the ingestion-time re-tag of non-discipline requirements (#11).
 *
 * Pure-function tests via `node:test` + `tsx` (`pnpm run test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { retagNonDisciplineRequirements } from "@/lib/curriculum-tagging";

test("compact-array: re-tags Atividades Complementares mandatory → optional, only the type", () => {
  const ac = [
    "INE7011",
    "Atividades Complementares",
    0,
    360,
    "",
    [],
    [],
    "mandatory",
    0,
  ];
  const normal = [
    "INE5401",
    "Programação Orientada a Objetos",
    4,
    72,
    "",
    [],
    [],
    "mandatory",
    3,
  ];

  const out = retagNonDisciplineRequirements([ac, normal]);

  assert.equal(out[0][7], "optional", "AC row re-tagged");
  // Every other field of the AC row is untouched.
  assert.deepEqual(
    [out[0][0], out[0][1], out[0][2], out[0][3], out[0][8]],
    ["INE7011", "Atividades Complementares", 0, 360, 0],
  );
  // A normal mandatory discipline is left alone.
  assert.equal(out[1][7], "mandatory");
});

test("object form: re-tags by name, leaves other fields and normal courses", () => {
  const courses = [
    { id: "DEC7003", name: "Atividades Complementares: Eng Comp", type: "mandatory", credits: 0 },
    { id: "MTM3101", name: "Cálculo I", type: "mandatory", credits: 4 },
  ];

  const out = retagNonDisciplineRequirements(courses);

  assert.equal(out[0].type, "optional");
  assert.equal(out[0].id, "DEC7003"); // unchanged
  assert.equal(out[1].type, "mandatory");
});

test("idempotent: a second pass changes nothing", () => {
  const courses = [
    ["INE7011", "Atividades Complementares", 0, 360, "", [], [], "mandatory", 0],
  ];
  const once = retagNonDisciplineRequirements(courses);
  const twice = retagNonDisciplineRequirements(once);
  assert.deepEqual(twice, once);
});

test("does not mutate the input array or rows", () => {
  const ac = ["INE7011", "Atividades Complementares", 0, 360, "", [], [], "mandatory", 0];
  const input = [ac];
  retagNonDisciplineRequirements(input);
  assert.equal(ac[7], "mandatory", "original row untouched");
});

test("non-array input is returned as-is", () => {
  assert.equal(retagNonDisciplineRequirements(undefined as any), undefined);
});
