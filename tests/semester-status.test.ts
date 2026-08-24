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
  PASSING_GRADE,
  clearDerivedStatus,
  inferCurrentPhase,
  isExplicitStatus,
  resolveCourseStatus,
  resolveSemesters,
  resolveStudentCourse,
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

test("a stored IN_PROGRESS/PLANNED never beats position", () => {
  // Regression: a course dragged out of the current semester used to carry its
  // old status into the new one and keep reading "cursando" there. These two
  // are OUTPUTS of the rules, never inputs, so position always re-derives them.
  assert.equal(
    resolveCourseStatus(CourseStatus.IN_PROGRESS, 9, 5),
    CourseStatus.PLANNED,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.PLANNED, 1, 5),
    CourseStatus.COMPLETED,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.PLANNED, 5, 5),
    CourseStatus.IN_PROGRESS,
  );

  assert.equal(isExplicitStatus(CourseStatus.IN_PROGRESS), false);
  assert.equal(isExplicitStatus(CourseStatus.PLANNED), false);
  assert.equal(isExplicitStatus(CourseStatus.PENDING), false);
  assert.equal(isExplicitStatus(CourseStatus.DEFAULT), false);
  assert.equal(isExplicitStatus(undefined), false);
  assert.equal(isExplicitStatus(CourseStatus.COMPLETED), true);
  assert.equal(isExplicitStatus(CourseStatus.FAILED), true);
  assert.equal(isExplicitStatus(CourseStatus.EXEMPTED), true);
});

test("clearDerivedStatus strips positional statuses but keeps outcomes", () => {
  assert.equal(
    clearDerivedStatus(sc("A", CourseStatus.IN_PROGRESS)).status,
    CourseStatus.PENDING,
  );
  assert.equal(
    clearDerivedStatus(sc("A", CourseStatus.PLANNED)).status,
    CourseStatus.PENDING,
  );
  // Outcomes and their grades survive a move untouched.
  const graded = sc("A", CourseStatus.COMPLETED, 8.5);
  assert.equal(clearDerivedStatus(graded), graded);
  assert.equal(clearDerivedStatus(graded).grade, 8.5);
  assert.equal(
    clearDerivedStatus(sc("A", CourseStatus.FAILED)).status,
    CourseStatus.FAILED,
  );
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

// --- moving a course re-derives it ------------------------------------------

test("a moved course is re-derived from its new semester, outcome included", () => {
  // Dragging a concluída into a future semester must turn it planejada. This
  // is what `moveCourse` encodes by resetting the status to PENDING, and it is
  // deliberately stronger than `clearDerivedStatus`: a move is the user saying
  // when they take the course, so it outranks the recorded outcome.
  const moved = { ...sc("A", CourseStatus.COMPLETED, 8.5), status: CourseStatus.PENDING };

  assert.equal(resolveCourseStatus(moved.status, 9, 5), CourseStatus.PLANNED);
  // …and dropping it back into a past semester reads concluída again.
  assert.equal(resolveCourseStatus(moved.status, 2, 5), CourseStatus.COMPLETED);
  // The grade is never destroyed by a mis-drop.
  assert.equal(moved.grade, 8.5);
});

test("a course NOT moved keeps its outcome wherever the back-fill runs", () => {
  // The passive paths (load, apply-plan, phase back-fill) must not rewrite
  // history nobody touched — only an explicit move does.
  assert.equal(
    resolveCourseStatus(CourseStatus.COMPLETED, 9, 5),
    CourseStatus.COMPLETED,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.FAILED, 2, 5),
    CourseStatus.FAILED,
  );
});

// --- the grade decides WHICH outcome a finished course got -------------------

test("a failing grade in a past semester derives reprovado, not concluído", () => {
  // Regression: the back-fill derived a bare COMPLETED for everything behind
  // `currentPhase`, so a course the student failed came out as a green tick
  // the moment its stored FAILED was cleared (by a drag, say).
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 3, 8, 4.5),
    CourseStatus.FAILED,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 3, 8, 8.5),
    CourseStatus.COMPLETED,
  );
  // No grade recorded → still concluída; position is all we have to go on.
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 3, 8),
    CourseStatus.COMPLETED,
  );
});

test("the passing threshold is exactly 6.0 and is shared with setCourseGrade", () => {
  assert.equal(PASSING_GRADE, 6.0);
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 1, 5, PASSING_GRADE),
    CourseStatus.COMPLETED,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 1, 5, PASSING_GRADE - 0.5),
    CourseStatus.FAILED,
  );
});

test("current and future semesters ignore a stale grade", () => {
  // A failed course dragged forward is being RETAKEN — its old grade is stale,
  // not a verdict on the new attempt.
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 5, 5, 3.0),
    CourseStatus.IN_PROGRESS,
  );
  assert.equal(
    resolveCourseStatus(CourseStatus.PENDING, 9, 5, 3.0),
    CourseStatus.PLANNED,
  );
});

test("resolveStudentCourse threads the course's own grade through", () => {
  const failed = sc("A", CourseStatus.PENDING, 4.0);
  assert.equal(
    resolveStudentCourse(failed, 2, 8).status,
    CourseStatus.FAILED,
  );
  const passed = sc("B", CourseStatus.PENDING, 7.0);
  assert.equal(
    resolveStudentCourse(passed, 2, 8).status,
    CourseStatus.COMPLETED,
  );
});
