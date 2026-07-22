# Sprint 02 — Plan Generator: Mandatory-Only Fixes — Backlog

## Sprint goal

Make the Sprint 01 auto plan generator trustworthy for a real student's mandatory-only
curriculum: every schedulable discipline the student still needs is placed (or explicitly
explained), and non-disciplines (atividades complementares) never show up pretending to be
courses.

---

## Story 1 — Never generate a "course" for Atividades Complementares

**As a** UFSC student, **I want** the auto-generated plan to never include Atividades
Complementares (or other non-schedulable graduation-requirement pseudo-courses) as a
placed-but-"Sem turma" entry, **so that** the preview only shows me real disciplines I can
actually enroll in and attend.

Priority: **P0** — this is the maintainer's reported bug and pollutes every plan for every
curriculum that models complementary-activity credits this way (confirmed in both CC `208`
and Eng. Comp. `655`).

Acceptance criteria:
- [ ] Given the CC curriculum (`208_*`), running the generator on the maintainer's own
  transcript-derived plan produces a preview that does **not** contain `INE7011
  "Atividades Complementares 1"` anywhere — not placed with a section, not in the "Sem
  turma" list, not in the unplaceable list. It is simply absent, as if it were never a
  candidate.
- [ ] Same check holds for `DEC7003 "Atividades Complementares: Engenharia de Computação"`
  on the Eng. Comp. curriculum (`655_*`).
- [ ] The exclusion is general, not a hardcoded ID/name allowlist for these two examples —
  it must also exclude any other curriculum's equivalent complementary-activity pseudo-course
  that shares the identifying trait(s) these two share (no class sections ever offered /
  no schedulable phase), so a newly-ingested curriculum doesn't need a manual patch. The
  identifying trait(s) used are left to `architect`/engineering, but must be verified
  against at least one curriculum beyond CC/Eng. Comp. in the seeded set to confirm no
  false exclusions of real disciplines.
- [ ] Regression guard: `type === "optional"` courses (electives, "optativas") continue to
  be excluded from every generated plan exactly as they are today — this story changes
  nothing about that path. A test/manual check confirms an optional-type course is still
  absent from a generated preview.
- [ ] Regression guard: every other real mandatory discipline in the CC and Eng. Comp.
  curricula that was correctly placed before this change is still placed after it (no
  over-broad filter that accidentally drops real courses alongside complementary
  activities).
- [ ] Manual test (maintainer's case): generate a plan against the maintainer's own CC
  transcript and confirm the preview's course list, "Sem turma" list, and "Não foi possível
  encaixar" list together contain zero complementary-activity entries.

---

## Story 2 — Fix the project sequence (Gerência/Planejamento de Projetos → Projetos I → II)

**As a** UFSC student in a curriculum with a project course sequence, **I want** the
generator to recognize and correctly place Gerência/Planejamento de Projetos, Projetos I,
and Projetos II back-to-back in order, **so that** I don't have to manually notice and fix
a missing required course in my "finished" plan.

Priority: **P0** — directly blocks the maintainer's own test case; a project course
silently missing from a generated plan is a correctness bug, not a cosmetic one.

Acceptance criteria:
- [ ] The sequence-group name matcher recognizes the project chain's actual name(s) as they
  exist in the live curriculum data the generator runs against (verified against real CC
  curriculum data, not the placeholder strings from Sprint 01 which matched nothing) —
  confirm by generating a plan on the maintainer's CC transcript and finding all three
  courses matched into one group.
- [ ] All three project courses appear in the generated preview — each is either placed
  with a semester+section, placed "Sem turma" (no offering data), or listed in "Não foi
  possível encaixar" with a specific reason. None of the three is silently absent from the
  preview the way `sem turma`-eligible courses can currently vanish.
- [ ] When the group *can* be placed (prerequisites satisfiable, at least one feasible
  consecutive block of semesters within the credit cap and turno filter), all three land in
  consecutive semesters in the correct order (Gerência/Planejamento de Projetos → Projetos I
  → Projetos II) — same guarantee Sprint 01 intended but re-verified working end to end.
- [ ] Fix the fallback gap: if the sequence-group placement attempt fails for a structural
  reason (e.g. an external prerequisite for one member truly never becomes satisfiable
  within the generator's semester horizon), the group's members are surfaced individually
  in the unplaceable list with a reason — never silently dropped without ever reappearing
  in the "unplaceable" accounting the way they can today when `placeGroup` fails and the
  loop `continue`s past them.
- [ ] Manual test (maintainer's case): generate a plan against the maintainer's own CC
  transcript/plan and confirm Gerência (or Planejamento) de Projetos, Projetos I, and
  Projetos II all appear in the resulting preview, in that order, in consecutive semesters
  (or — if genuinely blocked by prerequisites/conflicts — each shows up in "Não foi possível
  encaixar" with an accurate reason, never just missing).

---

## Story 3 — Completeness invariant: no remaining mandatory course silently vanishes

**As a** UFSC student, **I want** a guarantee that every schedulable mandatory course I
still need shows up somewhere in the generated preview (placed, "sem turma", or explicitly
unplaceable with a reason), **so that** I can trust the plan is actually complete instead of
having to cross-check it against the curriculum myself.

Priority: **P1** — this is the structural fix that both Story 1 (define "schedulable
mandatory") and Story 2 (a specific case that violated it) sit on top of; called out
separately because it's a testable invariant the maintainer can check on *any* curriculum,
not just CC/Eng. Comp.

Acceptance criteria:
- [ ] Define and enforce the invariant: `{courses placed with a section} ∪ {courses placed
  "Sem turma"} ∪ {courses in "Não foi possível encaixar"}` equals exactly the set of
  remaining schedulable mandatory courses for the student's curriculum (i.e. `type ===
  "mandatory"` minus completed/exempted/in-progress minus the non-schedulable pseudo-courses
  excluded per Story 1) — no course from that set is missing from all three lists, and no
  course appears in more than one.
- [ ] This invariant holds for every scenario/seed the generator produces (Sprint 01's
  "Mais rápido" / "Carga leve" / "Outro mix"), not just the default one.
- [ ] Regression test using at least 2 real seeded curricula beyond CC (e.g. Eng. Comp.
  `655` and one more from the seeded set) confirms the invariant holds, catching any other
  `continue`-past-a-failed-group-or-course style silent drop beyond the specific project
  sequence in Story 2.
- [ ] Manual/automated check: for a curriculum with a deliberately unsatisfiable remainder
  (e.g. a course whose only prerequisite was dropped from a later curriculum version, per
  Sprint 01's known edge case), that course still appears in "Não foi possível encaixar"
  with reason `"prereq"` — confirming the invariant doesn't just hide the gap by relaxing
  placement rules.

---

## Out of scope for this sprint

- Electives/optional-course scheduling (`type === "optional"`) — still deferred to a future
  "Phase 2" per Sprint 01's decision; this sprint only guards that they *stay* excluded
  (Story 1's regression check), it does not add elective handling.
- Complementary-activity credit tracking/UI (e.g. showing the student how many
  complementary-activity credits they still owe) — this sprint only removes them from the
  *schedule-generation* candidate pool; nothing is added to replace or surface that
  requirement elsewhere.
- New sequence groups beyond the existing project chain (Gerência/Planejamento de Projetos →
  Projetos I → Projetos II) — no new curriculum-specific ordering rules are introduced this
  sprint.
- Any change to prerequisite logic, conflict detection, turno filtering, or credit-cap
  packing beyond what's needed to stop the two silent-drop bugs above — those subsystems are
  otherwise considered working per Sprint 01's review.
- Curriculum-data cleanup (e.g. re-tagging Atividades Complementares as a non-`mandatory`
  type at the data-ingestion/pipeline level) — in scope only if `architect`/engineering
  determines that's the simplest correct fix; otherwise this stays a generator-side filter
  and any data-pipeline follow-up is a separate ticket.
- UI/visual redesign of the preview modal — reuses existing `plan-generator-modal.tsx`
  labels and lists ("Sem turma", "Não foi possível encaixar") as-is.

---

## Notes for `architect` / engineering (not prescriptive, context only)

- Confirmed root causes (already investigated by the maintainer — do not re-investigate):
  `lib/plan-generator/candidates.ts`'s `buildRemainingCandidates` filters only on
  `type === "mandatory"`, which includes Atividades Complementares pseudo-courses (typed
  `mandatory`, no class sections, `phase: null` in the data). `lib/plan-generator/generate.ts`'s
  `SEQUENCE_GROUP_MATCHERS` (~line 92) matches literal strings ("gerencia de projetos",
  "projetos i", "projetos ii") that don't match any real UFSC course name — the group never
  forms. Separately, `runGreedy`'s placement loop (~lines 473–485) `continue`s past a
  grouped course when `placeGroup` returns `false`, without adding its members to
  `unplaceable`, so a blocked group can vanish from the preview instead of being reported.
- Story 3's invariant is the acceptance bar that would have caught both Story 1 and Story 2
  as regressions before shipping — recommend a shared test/check that computes this set
  difference, not just eyeballing individual curricula.
