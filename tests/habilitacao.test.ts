/**
 * Tests for habilitação (Bacharelado / Licenciatura track) filtering.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyHabilitacao,
  coursesForHabilitacao,
  needsHabilitacao,
  resolveHabilitacao,
} from "@/lib/habilitacao";
import { parseCourses } from "@/parsers/curriculum-parser";
import type { Curriculum } from "@/types/curriculum";

// Compact rows as stored in the DB; index 9 = { "<track>": [isMandatory, phase] }.
const rows = [
  ["SPO7102", "Ciência Política", 4, 72, "", [], [], true, 1],
  ["ANT7101", "Antropologia", 4, 72, "", [], [], true, 1, { "0": [true, 1], "1": [true, 1] }],
  ["MEN7021", "Estágio", 4, 72, "", [], [], true, 7, { "0": [false, null], "1": [true, 7] }],
  ["CSO7808", "TCC", 4, 72, "", [], [], true, 8, { "1": [true, 8] }],
  ["OPT0001", "Optativa I", 4, 72, "", [], [], false, 6, { "0": [false, 6] }],
];

const curriculum: Curriculum = {
  id: "310",
  name: "Ciências Sociais",
  department: "UFSC",
  totalPhases: 9,
  courses: parseCourses(rows),
  habilitacoes: [
    { label: "Licenciatura", name: "Licenciatura em Ciências Sociais" },
    { label: "Bacharelado", name: "Bacharelado em Ciências Sociais" },
  ],
};

const view = (c: Curriculum) =>
  c.courses.map((x) => `${x.id}:${x.type === "mandatory" ? "M" : "O"}${x.phase}`);

test("parseCourses reads the per-habilitação placement", () => {
  const estagio = curriculum.courses.find((c) => c.id === "MEN7021")!;
  assert.deepEqual(estagio.tracks, {
    0: { type: "optional", phase: 0 },
    1: { type: "mandatory", phase: 7 },
  });
  assert.equal(curriculum.courses[0].tracks, undefined, "shared course");
});

test("first habilitação by default", () => {
  assert.equal(resolveHabilitacao(curriculum, undefined), 0);
  assert.equal(resolveHabilitacao(curriculum, 7), 0, "out of range → first");
  assert.deepEqual(view(applyHabilitacao(curriculum, undefined)), [
    "SPO7102:M1",
    "ANT7101:M1",
    "MEN7021:O0", // an elective in Licenciatura
    "OPT0001:O6",
  ]);
});

test("the other habilitação gets its own courses and placement", () => {
  assert.deepEqual(view(applyHabilitacao(curriculum, 1)), [
    "SPO7102:M1",
    "ANT7101:M1",
    "MEN7021:M7",
    "CSO7808:M8",
  ]);
});

test("re-applying derives from allCourses, so switching back works", () => {
  const bach = applyHabilitacao(curriculum, 1);
  const lic = applyHabilitacao(bach, 0);
  assert.equal(lic.allCourses!.length, 5);
  assert.deepEqual(view(lic), view(applyHabilitacao(curriculum, 0)));
  assert.equal(needsHabilitacao(lic, 0), false);
  assert.equal(needsHabilitacao(lic, 1), true);
});

test("curricula without habilitações are untouched", () => {
  const plain: Curriculum = { ...curriculum, habilitacoes: undefined };
  const out = applyHabilitacao(plain, 1);
  assert.equal(out.courses.length, 5);
  assert.equal(needsHabilitacao(out, 1), false);
  assert.deepEqual(coursesForHabilitacao([], 0), []);
});
