/**
 * Tests for positional course status (`lib/semester-status.ts`).
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { StudentCourse, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import {
  inferCurrentPhase,
  isExplicitStatus,
  resolveCourseStatus,
  resolveSemesters,
} from "@/lib/semester-status";

function sc(
  courseId: string,
  status: CourseStatus = CourseStatus.PENDING,
  grade?: number,
): StudentCourse {
  return { courseId, credits: 4, status, grade };
}

function sem(number: number, courses: StudentCourse[]): StudentSemester {
  return {
    number,
    courses,
    totalCredits: courses.reduce((n, c) => n + c.credits, 0),
  };
}

// --- the core rule -----------------------------------------------------------

test("position decides status for a course with no explicit one", () => {
  const at = (n: number) => resolveCourseStatus(CourseStatus.PENDING, n, 5);
  assert.equal(at(1), CourseStatus.COMPLETED); // before → back-filled
  assert.equal(at(4), CourseStatus.COMPLETED);
  assert.equal(at(5), CourseStatus.IN_PROGRESS); // the current semester
  assert.equal(at(6), CourseStatus.PLANNED); // ahead
  assert.equal(at(12), CourseStatus.PLANNED);
});

test("marking a later phase back-fills everything before it", () => {
  const before = resolveCourseStatus(CourseStatus.PENDING, 3, 2);
  const after = resolveCourseStatus(CourseStatus.PENDING, 3, 7);
  assert.equal(before, CourseStatus.PLANNED); // phase 3 is ahead of phase 2
  assert.equal(after, CourseStatus.COMPLETED); // …and behind phase 7
});

// --- explicit statuses win ---------------------------------------------------

test("a recorded outcome survives wherever the course sits", () => {
  // A reprovada in a past semester must never be promoted by the back-fill.
  assert.equal(
    resolveCourseStatus(CourseStatus.FAILED, 2, 5),
    CourseStatus.FAILED,
  );
  // A course finished early inside the current semester stays concluída.
  assert.equal(
    resolveCourseStatus(CourseStatus.COMPLETED, 5, 5),
    CourseStatus.COMPLETED,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.EXEMPTED, 8, 5),
    CourseStatus.EXEMPTED,
  );
});

test("manual per-course overrides win too", () => {
  assert.equal(
    resolveCourseStatus(CourseStatus.IN_PROGRESS, 9, 5),
    CourseStatus.IN_PROGRESS,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.PLANNED, 1, 5),
    CourseStatus.PLANNED,
  );
  assert.equal(isExplicitStatus(CourseStatus.PENDING), false);
  assert.equal(isExplicitStatus(CourseStatus.DEFAULT), false);
  assert.equal(isExplicitStatus(undefined), false);
});

test("an undeclared phase derives nothing", () => {
  // Profiles that never declared where they are must not have a status invented.
  for (const phase of [0, -1, Number.NaN]) {
    assert.equal(
      resolveCourseStatus(CourseStatus.PENDING, 3, phase),
      CourseStatus.PENDING,
    );
  }
});

// --- whole-plan resolution ---------------------------------------------------

test("resolveSemesters derives per semester and preserves grades", () => {
  const semesters = [
    sem(1, [sc("A"), sc("B", CourseStatus.FAILED)]),
    sem(2, [sc("C", CourseStatus.COMPLETED, 9)]),
    sem(3, [sc("D")]),
    sem(4, [sc("E")]),
  ];
  const out = resolveSemesters(semesters, 3);

  assert.equal(out[0].courses[0].status, CourseStatus.COMPLETED); // derived
  assert.equal(out[0].courses[1].status, CourseStatus.FAILED); // explicit wins
  assert.equal(out[1].courses[0].status, CourseStatus.COMPLETED);
  assert.equal(out[1].courses[0].grade, 9); // grade untouched
  assert.equal(out[2].courses[0].status, CourseStatus.IN_PROGRESS);
  assert.equal(out[3].courses[0].status, CourseStatus.PLANNED);
});

test("resolveSemesters is reference-stable when nothing changes", () => {
  // Downstream memos key off this array, so a no-op must not invalidate them.
  const semesters = [sem(1, [sc("A", CourseStatus.COMPLETED)])];
  assert.equal(resolveSemesters(semesters, 0), semesters); // no phase → no-op
  assert.equal(resolveSemesters(semesters, 3), semesters); // all explicit → no-op

  const withDerived = [sem(1, [sc("A")])];
  assert.notEqual(resolveSemesters(withDerived, 3), withDerived);
});

test("resolveSemesters never mutates its input", () => {
  const semesters = [sem(1, [sc("A")])];
  resolveSemesters(semesters, 5);
  assert.equal(semesters[0].courses[0].status, CourseStatus.PENDING);
});

// --- legacy migration --------------------------------------------------------

test("inferCurrentPhase reads the phase out of legacy per-course statuses", () => {
  // Highest semester holding an explicit IN_PROGRESS wins.
  assert.equal(
    inferCurrentPhase([
      sem(1, [sc("A", CourseStatus.COMPLETED)]),
      sem(4, [sc("B", CourseStatus.IN_PROGRESS)]),
      sem(5, [sc("C", CourseStatus.PLANNED)]),
    ]),
    4,
  );

  // No in-progress → one past the last finished semester.
  assert.equal(
    inferCurrentPhase([
      sem(1, [sc("A", CourseStatus.COMPLETED)]),
      sem(3, [sc("B", CourseStatus.EXEMPTED)]),
      sem(6, [sc("C", CourseStatus.PLANNED)]),
    ]),
    4,
  );

  // Nothing to go on → phase 1.
  assert.equal(inferCurrentPhase([]), 1);
  assert.equal(inferCurrentPhase([sem(1, [sc("A", CourseStatus.PLANNED)])]), 1);
});
