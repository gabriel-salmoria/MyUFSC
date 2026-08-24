/**
 * Golden-master tests for the curriculum status engine
 * (`computeCurriculumStatusMap`), extracted verbatim from
 * `CurriculumVisualizer`'s `mappedCurriculumCourses` memo (Sprint 05, #17
 * Step 4a). Snapshots the resolved status map for a representative curriculum
 * so any future edit to the engine — named-course equivalence resolution or
 * the generic-elective `optionalPools` greedy credit-accounting — is caught.
 *
 * Pure-function tests, run with Node's built-in `node:test` via `tsx`
 * (`pnpm run test`). No React/store/DB.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Curriculum, Course } from "@/types/curriculum";
import type { StudentSemester, StudentCourse } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import {
  computeCurriculumStatusMap,
  type CurriculumStatusEntry,
} from "@/lib/curriculum-status";

function course(
  partial: Partial<Course> & { id: string; name: string; phase: number },
): Course {
  return {
    credits: 4,
    type: "mandatory",
    equivalents: [],
    prerequisites: [],
    ...partial,
  };
}

/**
 * Representative fixture: mandatory courses, a real (non-placeholder) elective
 * pair that feeds the optional pool, three generic OPT placeholders (draining
 * order COMPLETED → IN_PROGRESS → empty), and a declared equivalence pair
 * (MAT1002 ≡ MAT1002B) crediting a renamed course.
 */
const curriculum: Curriculum = {
  id: "test_20191",
  name: "Test Program",
  department: "TST",
  totalPhases: 7,
  courses: [
    course({ id: "MAT1001", name: "Cálculo I", phase: 1 }),
    course({
      id: "MAT1002",
      name: "Cálculo II",
      phase: 2,
      equivalents: ["MAT1002B"],
    }),
    course({
      id: "ELE5001",
      name: "Eletiva Real Um",
      phase: 3,
      type: "optional",
      workload: 72,
    }),
    course({
      id: "ELE5002",
      name: "Eletiva Real Dois",
      phase: 4,
      type: "optional",
      workload: 72,
    }),
    course({
      id: "OPT0001",
      name: "Optativa I",
      phase: 5,
      type: "optional",
      workload: 72,
    }),
    course({
      id: "OPT0002",
      name: "Optativa II",
      phase: 6,
      type: "optional",
      workload: 72,
    }),
    course({
      id: "OPT0003",
      name: "Optativa III",
      phase: 7,
      type: "optional",
      workload: 72,
    }),
  ],
};

function sc(partial: StudentCourse): StudentCourse {
  return partial;
}

const semesters: StudentSemester[] = [
  {
    number: 1,
    totalCredits: 8,
    courses: [
      sc({
        courseId: "MAT1001",
        credits: 4,
        status: CourseStatus.COMPLETED,
        grade: 8,
      }),
      // Renamed course taken under its equivalent id — must credit MAT1002.
      sc({
        courseId: "MAT1002B",
        credits: 4,
        status: CourseStatus.COMPLETED,
        grade: 7,
      }),
    ],
  },
  {
    number: 2,
    totalCredits: 8,
    courses: [
      // Real elective, completed → 72h into the COMPLETED optional pool.
      sc({
        courseId: "ELE5001",
        credits: 4,
        status: CourseStatus.COMPLETED,
        grade: 9,
      }),
      // Real elective, in progress → 72h into the IN_PROGRESS optional pool.
      sc({
        courseId: "ELE5002",
        credits: 4,
        status: CourseStatus.IN_PROGRESS,
      }),
    ],
  },
];

const equivalenceMap = generateEquivalenceMap(curriculum.courses);

/** Serialize the map to a stable, id-sorted, value-only projection. */
function snapshot(map: Map<string, CurriculumStatusEntry>) {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, entry]) => ({
      id,
      status: entry.status,
      grade: entry.grade,
      matchedCourseId: entry.studentCourse?.courseId,
    }));
}

test("computeCurriculumStatusMap: golden-master snapshot", () => {
  const map = computeCurriculumStatusMap(curriculum.courses, semesters, equivalenceMap);

  assert.deepEqual(snapshot(map), [
    // Real electives resolve via exact-id match in the else branch.
    { id: "ELE5001", status: CourseStatus.COMPLETED, grade: 9, matchedCourseId: "ELE5001" },
    { id: "ELE5002", status: CourseStatus.IN_PROGRESS, grade: undefined, matchedCourseId: "ELE5002" },
    // Mandatory, exact match.
    { id: "MAT1001", status: CourseStatus.COMPLETED, grade: 8, matchedCourseId: "MAT1001" },
    // Mandatory, credited via declared equivalence to MAT1002B.
    { id: "MAT1002", status: CourseStatus.COMPLETED, grade: 7, matchedCourseId: "MAT1002B" },
    // Placeholder drained from COMPLETED pool (72h → 0).
    { id: "OPT0001", status: CourseStatus.COMPLETED, grade: undefined, matchedCourseId: undefined },
    // Placeholder drained from IN_PROGRESS pool (72h → 0).
    { id: "OPT0002", status: CourseStatus.IN_PROGRESS, grade: undefined, matchedCourseId: undefined },
    // No pool credits left → DEFAULT.
    { id: "OPT0003", status: CourseStatus.DEFAULT, grade: undefined, matchedCourseId: undefined },
  ]);
});

test("computeCurriculumStatusMap: equivalence credits a renamed course", () => {
  const map = computeCurriculumStatusMap(curriculum.courses, semesters, equivalenceMap);
  const entry = map.get("MAT1002");
  assert.equal(entry?.status, CourseStatus.COMPLETED);
  assert.equal(entry?.studentCourse?.courseId, "MAT1002B");
});

test("computeCurriculumStatusMap: greedy pool draining is COMPLETED → IN_PROGRESS then empty", () => {
  const map = computeCurriculumStatusMap(curriculum.courses, semesters, equivalenceMap);
  assert.equal(map.get("OPT0001")?.status, CourseStatus.COMPLETED);
  assert.equal(map.get("OPT0002")?.status, CourseStatus.IN_PROGRESS);
  assert.equal(map.get("OPT0003")?.status, CourseStatus.DEFAULT);
});

test("computeCurriculumStatusMap: every curriculum course appears exactly once", () => {
  const map = computeCurriculumStatusMap(curriculum.courses, semesters, equivalenceMap);
  assert.equal(map.size, curriculum.courses.length);
  for (const c of curriculum.courses) {
    assert.ok(map.has(c.id), `missing ${c.id}`);
  }
});
