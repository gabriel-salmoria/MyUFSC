/**
 * Store-level tests for the habilitação (Bacharelado / Licenciatura) choice:
 * the real Zustand store, the way the app drives it.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { useStudentStore } from "@/lib/student-store";
import { parseCourses } from "@/parsers/curriculum-parser";
import type { Curriculum } from "@/types/curriculum";
import type { StudentInfo } from "@/types/student-plan";

const DEGREE = "310_20071";

// Compact rows as the DB stores them; index 9 = per-habilitação placement.
const rows = [
  ["SPO7102", "Ciência Política", 4, 72, "", [], [], true, 1],
  ["MEN7021", "Estágio", 4, 72, "", [], [], true, 7, { "0": [false, null], "1": [true, 7] }],
  ["CSO7808", "TCC", 4, 72, "", [], [], true, 8, { "1": [true, 8] }],
  ["OPT0001", "Optativa I", 4, 72, "", [], [], false, 6, { "0": [false, 6] }],
];

function curriculum(): Curriculum {
  return {
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
}

function student(habilitacoes?: Record<string, number>): StudentInfo {
  return {
    currentDegree: DEGREE,
    interestedDegrees: [],
    name: "Teste",
    currentPlan: 0,
    currentPhase: 1,
    plans: [{ semesters: [] }],
    ...(habilitacoes ? { habilitacoes } : {}),
  };
}

const store = () => useStudentStore.getState();
const view = () =>
  store().curriculumCache[DEGREE].courses.map(
    (c) => `${c.id}:${c.type === "mandatory" ? "M" : "O"}`,
  );

beforeEach(() => {
  store().setStudentInfo(null);
  useStudentStore.setState({ curriculumCache: {} });
});

test("a cached curriculum shows the first habilitação by default", () => {
  store().setStudentInfo(student());
  store().cacheCurriculum(DEGREE, curriculum());
  assert.deepEqual(view(), ["SPO7102:M", "MEN7021:O", "OPT0001:O"]);
  assert.equal(store().curriculumCache[DEGREE].habilitacao, 0);
});

test("choosing a habilitação re-filters the cache and is saved in the profile", () => {
  store().setStudentInfo(student());
  store().cacheCurriculum(DEGREE, curriculum());
  store().setHabilitacao(DEGREE, 1);
  assert.deepEqual(view(), ["SPO7102:M", "MEN7021:M", "CSO7808:M"]);
  assert.deepEqual(store().studentInfo?.habilitacoes, { [DEGREE]: 1 });
  assert.equal(store().curriculumCache[DEGREE].allCourses?.length, 4, "all tracks kept");
  store().setHabilitacao(DEGREE, 0);
  assert.deepEqual(view(), ["SPO7102:M", "MEN7021:O", "OPT0001:O"], "switching back");
});

test("a profile loaded after the curriculum was cached applies its saved choice", () => {
  // The profile route prefetches curricula before the profile is decrypted.
  store().cacheCurriculum(DEGREE, curriculum());
  assert.equal(store().curriculumCache[DEGREE].habilitacao, 0);
  store().setStudentInfo(student({ [DEGREE]: 1 }));
  assert.deepEqual(view(), ["SPO7102:M", "MEN7021:M", "CSO7808:M"]);
});

test("re-caching (e.g. after a refetch) keeps the student's choice", () => {
  store().setStudentInfo(student({ [DEGREE]: 1 }));
  store().cacheCurriculum(DEGREE, curriculum());
  assert.deepEqual(view(), ["SPO7102:M", "MEN7021:M", "CSO7808:M"]);
});

test("a stored choice out of range falls back to the first habilitação", () => {
  store().setStudentInfo(student({ [DEGREE]: 5 }));
  store().cacheCurriculum(DEGREE, curriculum());
  assert.equal(store().curriculumCache[DEGREE].habilitacao, 0);
});

test("curricula without habilitações are untouched", () => {
  const plain = { ...curriculum(), habilitacoes: undefined };
  store().setStudentInfo(student());
  store().cacheCurriculum(DEGREE, plain);
  assert.equal(store().curriculumCache[DEGREE].courses.length, 4);
  store().setHabilitacao(DEGREE, 1);
  assert.equal(store().curriculumCache[DEGREE].courses.length, 4);
});

// ── Ênfases ──────────────────────────────────────────────────────────────────

const PSI = "319_20101";
const options = [
  { label: "A – Saúde", name: "Saúde" },
  { label: "B – Trabalho", name: "Trabalho" },
];
function psicologia(): Curriculum {
  return {
    id: "319",
    name: "Psicologia",
    department: "UFSC",
    totalPhases: 10,
    courses: parseCourses([
      ["PSI7101", "Psicologia", 3, 54, "", [], [], true, 1],
      ["PSI7013", "Estágio I A", 12, 216, "", [], [], true, 7, null, [0, 0]],
      ["PSI7014", "Estágio I B", 12, 216, "", [], [], true, 7, null, [0, 1]],
      ["PSI7033", "Estágio I A", 12, 216, "", [], [], true, 9, null, [1, 0]],
      ["PSI7034", "Estágio I B", 12, 216, "", [], [], true, 9, null, [1, 1]],
    ]),
    enfases: [
      { label: "1ª ênfase", options },
      { label: "2ª ênfase", options },
    ],
  };
}
const psiView = () => store().curriculumCache[PSI].courses.map((c) => c.id);
const psiStudent = (enfases?: Record<string, number[]>): StudentInfo => ({
  ...student(),
  currentDegree: PSI,
  ...(enfases ? { enfases } : {}),
});

test("ênfases: defaults, choosing one slot keeps the other, saved in the profile", () => {
  store().setStudentInfo(psiStudent());
  store().cacheCurriculum(PSI, psicologia());
  assert.deepEqual(psiView(), ["PSI7101", "PSI7013", "PSI7034"]);
  store().setEnfase(PSI, 1, 0);
  assert.deepEqual(psiView(), ["PSI7101", "PSI7013", "PSI7033"]);
  assert.deepEqual(store().studentInfo?.enfases, { [PSI]: [0, 0] });
  store().setEnfase(PSI, 0, 1);
  assert.deepEqual(psiView(), ["PSI7101", "PSI7014", "PSI7033"]);
  assert.deepEqual(store().studentInfo?.enfases, { [PSI]: [1, 0] });
});

test("ênfases: a profile loaded after the curriculum was cached applies its choice", () => {
  store().cacheCurriculum(PSI, psicologia());
  store().setStudentInfo(psiStudent({ [PSI]: [1, 1] }));
  assert.deepEqual(psiView(), ["PSI7101", "PSI7014", "PSI7034"]);
  // and re-caching keeps it
  store().cacheCurriculum(PSI, psicologia());
  assert.deepEqual(psiView(), ["PSI7101", "PSI7014", "PSI7034"]);
});
