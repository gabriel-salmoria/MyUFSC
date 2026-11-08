/**
 * Tests for habilitação (Bacharelado / Licenciatura track) filtering.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyHabilitacao,
  coursesForHabilitacao,
  needsHabilitacao,
  resolveEnfases,
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

// ── Ênfases (Psicologia): index 10 = [slot, option] ─────────────────────────

const psiRows = [
  ["PSI7101", "Psicologia", 3, 54, "", [], [], true, 1],
  ["PSI7013", "Estágio I A (1ª ênfase escolhida)", 12, 216, "", [], [], true, 7, null, [0, 0]],
  ["PSI7014", "Estágio I B (1ª ênfase escolhida)", 12, 216, "", [], [], true, 7, null, [0, 1]],
  ["PSI7033", "Estágio I A (2ª ênfase escolhida)", 12, 216, "", [], [], true, 9, null, [1, 0]],
  ["PSI7034", "Estágio I B (2ª ênfase escolhida)", 12, 216, "", [], [], true, 9, null, [1, 1]],
  ["PSI7808", "Seminários", 2, 36, "", [], [], true, 8, { "0": [true, 8], "1": [false, null] }],
  ["PSI7707", "Seminários (1ª ênfase escolhida)", 4, 72, "", [], [], true, 7, { "1": [true, 7] }],
];
const enfaseOptions = [
  { label: "A – Saúde e Processos Clínicos", name: "Saúde e Processos Clínicos" },
  { label: "B – Trabalho, Organizações e Gestão", name: "Trabalho, Organizações e Gestão" },
];
const psicologia: Curriculum = {
  id: "319",
  name: "Psicologia",
  department: "UFSC",
  totalPhases: 10,
  courses: parseCourses(psiRows),
  habilitacoes: [
    { label: "Bacharelado", name: "Bacharelado" },
    { label: "Bacharelado + Licenciatura", name: "Bacharelado e Licenciatura em Psicologia" },
  ],
  enfases: [
    { label: "1ª ênfase", options: enfaseOptions },
    { label: "2ª ênfase", options: enfaseOptions },
  ],
};

test("parseCourses reads the ênfase version (index 10)", () => {
  assert.deepEqual(psicologia.courses[2].enfase, [0, 1]);
  assert.equal(psicologia.courses[2].tracks, undefined, "null TrackMap = shared");
  assert.equal(psicologia.courses[0].enfase, undefined);
});

test("ênfases default to different options per slot (A, then B)", () => {
  assert.deepEqual(resolveEnfases(psicologia, undefined), [0, 1]);
  assert.deepEqual(resolveEnfases(psicologia, [1, 9]), [1, 1], "out of range → default");
  assert.deepEqual(view(applyHabilitacao(psicologia, undefined)), [
    "PSI7101:M1",
    "PSI7013:M7",
    "PSI7034:M9",
    "PSI7808:M8",
  ]);
});

test("the chosen ênfases pick one version per slot, in every habilitação", () => {
  const lic = applyHabilitacao(psicologia, 1, [1, 0]);
  assert.deepEqual(view(lic), [
    "PSI7101:M1",
    "PSI7014:M7",
    "PSI7033:M9",
    "PSI7808:O0",
    "PSI7707:M7",
  ]);
  assert.deepEqual(lic.enfaseChoice, [1, 0]);
  assert.equal(lic.allCourses?.length, 7, "every version kept");
  assert.equal(needsHabilitacao(lic, 1, [1, 0]), false);
  assert.equal(needsHabilitacao(lic, 1, [0, 0]), true, "ênfase changed");
  assert.equal(needsHabilitacao(lic, 0, [1, 0]), true, "habilitação changed");
});

test("ênfases also apply to a curriculum without habilitações", () => {
  const plain = { ...psicologia, habilitacoes: undefined };
  assert.deepEqual(view(applyHabilitacao(plain, undefined, [1, 1])), [
    "PSI7101:M1",
    "PSI7014:M7",
    "PSI7034:M9",
    "PSI7808:M8",
    "PSI7707:M7",
  ]);
});
