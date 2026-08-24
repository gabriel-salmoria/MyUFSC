/**
 * Tests for the remaining graduation-requirement hours computation
 * (`computeGraduationReminder`): elective (optativas) + non-discipline
 * status gating, and floor clamping.
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`). No React/store/DB — plain `Course[]` / `StudentInfo`
 * fixtures against the exported function.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Course } from "@/types/curriculum";
import type { StudentCourse, StudentInfo } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { computeGraduationReminder } from "@/lib/plan-generator/graduation";

/** Minimal course fixture (fields the function actually reads). */
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
