# Sprint 02 — Plan Generator: Mandatory Disciplines Only — Technical Plan

Fix two defects in the deterministic (NO AI) plan generator (`lib/plan-generator/`) so the
generated plan graduates in the fewest phases containing **only the main mandatory
disciplines**, respecting credit cap, turno, and prerequisites.

Owner tags per step: `backend-engineer` (pure TS engine/candidates/tests). No UI, store,
DB, or API changes are in scope — both defects live entirely in the pure engine and the
existing modal already renders the result fields unchanged. `design` / `frontend-engineer`
are **not** needed this sprint.

Scope is strictly these two defects. Do not touch the elective (Phase 2) path, scenario
fan-out, store wiring, or the modal.

---

## Goal

For a student with no reprovações the plan should be the curriculum grade itself, phase for
phase, containing every mandatory **discipline** and nothing else:

1. **Defect 1 — non-discipline pollution.** "Atividades Complementares" graduation-
   requirement pseudo-courses (typed `mandatory`, no sections, phase `null`→`0`) must never
   appear in a generated plan — neither placed "Sem turma" nor in `unplaceable`.
2. **Defect 2 — dropped project courses.** The brittle `SEQUENCE_GROUP_MATCHERS` special-
   casing matches no real UFSC course name and, worse, when a grouped course fails
   `placeGroup` it is silently dropped instead of falling through to normal placement. Every
   remaining schedulable mandatory discipline must end up placed (with a section or "sem
   turma") **or** in `unplaceable` with a reason — never silently missing.

**Invariant to enforce (test both directions):** for the set
`R = remaining schedulable mandatory disciplines`, after a run
`{placed ids} ∪ {unplaceable ids} == R` exactly, and no non-discipline id appears in
either set.

---

## Affected files

**Changed (pure engine):**
- `lib/plan-generator/candidates.ts` — add the non-discipline predicate and apply it in
  `buildRemainingCandidates`'s filter (Defect 1). This is the single chokepoint: everything
  downstream (`generate.ts`) consumes `remaining` from here, so excluding here guarantees
  the pseudo-courses never reach placement, `placedWithoutSection`, or `unplaceable`.
- `lib/plan-generator/generate.ts` — remove/neutralize the sequence-group machinery and
  ensure every remaining course reaches `placeSingle` (Defect 2). Update the module
  docstring (lines 22-24, 88-98) which currently documents the removed behavior.

**New (tests — see Testing section for the tooling decision):**
- `lib/plan-generator/candidates.test.ts`
- `lib/plan-generator/generate.test.ts`

**Reused as-is (no change):**
- `normalizeCourseName` in `generate.ts:100-108` (NFD strip → lower → collapse) — the exact
  normalizer the predicate should reuse. Move it to `candidates.ts` (see Step 1) so both
  files share one copy rather than forking a fourth normalizer (the repo already has the
  known 3× `normalizeProfessorId` duplication — do not add to that pattern).
- `parseCourses` (`parsers/curriculum-parser.ts:16-50`) — confirms phase `null`→`0`
  mapping; **do not** rely on `phase === 0` as the discipline signal (it is lossy: a real
  phase-0-less course and a null-phase pseudo-course are indistinguishable after parsing).
- Modal `components/schedule/plan-generator-modal.tsx` — consumes `placedWithoutSection`
  and `unplaceable` unchanged; fewer/again-correct ids flow through automatically.

---

## Approach

### Defect 1 — exclude non-discipline requirements at the candidate source

Add a small named predicate to `candidates.ts` and apply it inside the existing
`buildRemainingCandidates` filter (`candidates.ts:80-84`), alongside the `type ===
"mandatory"` check.

**Recommended detection: normalized-name match.** A course is a non-discipline requirement
when its normalized name contains `"atividades complementares"`. Rationale (weighed against
the alternatives in the bug report):

- **Name-based (recommended).** Robust across curricula and versions. Verified to cover both
  live cases: `INE7011 "Atividades Complementares 1"` (CC 208) and `DEC7003 "Atividades
  Complementares: Engenharia de Computação"` (Eng Comp 655) — both normalize to a string
  containing `"atividades complementares"`. `substring`, not equality, absorbs the trailing
  number / colon-suffixed variants. This is the same normalization approach the codebase
  already trusts for professor-name and course-name matching, so it is idiomatic here.
- **"No sections AND phase null" heuristic (rejected as primary).** `parseCourses` collapses
  `phase null → 0`, so "phase null" is unrecoverable at engine input — only "phase 0"
  remains, which cannot distinguish a genuine early course from a pseudo-course. And "no
  sections" is a transient data condition: a real discipline with no *current* offering
  would be wrongly excluded and silently vanish from the plan (violating the invariant in
  the opposite direction). Reject as the primary signal.

Name the predicate for the property it tests, phrased so the call site reads as intent:

```
/** True for graduation-requirement pseudo-courses that are not schedulable
 *  disciplines (e.g. "Atividades Complementares"). These are typed `mandatory`
 *  in curriculum JSON but have no class sections and no real phase, so the packer
 *  must exclude them: they can be neither scheduled nor sensibly reported as
 *  unplaceable. Matched by normalized name (robust across curricula) rather than
 *  a "no sections / phase 0" heuristic, which parseCourses makes lossy. */
export function isNonDisciplineRequirement(course: Course): boolean { ... }
```

Apply as `course.type === "mandatory" && !isNonDisciplineRequirement(course) &&
resolveTerminalStatus(...) === null`. Export it so a test can assert both cases directly and
so the future elective phase can reuse it.

Trade-off accepted: the wordlist is UFSC-Portuguese-specific and hardcoded, mirroring the
existing `SEQUENCE_GROUP_MATCHERS` and `isTextClean` precedent. If a new non-discipline
requirement surfaces later (e.g. "Estágio" if it is ever typed mandatory with no sections),
it is a one-line addition. Keep the match list to the single verified token for now — do not
speculatively add "estágio"/"tcc" without confirming they exhibit the same shape, since
those often *do* have sections and real phases and must stay schedulable.

### Defect 2 — remove the brittle sequence-group special-casing

**Recommendation: delete the sequence-group mechanism entirely.** The maintainer's real
objective is "place every mandatory discipline as early as prerequisites allow, fewest
phases." The normal path already achieves correct project-chain sequencing for free:

- The project chain is ordered by real prerequisites (Projeto Integrador II lists Projeto
  Integrador I as a prereq, etc.). `buildPrecedenceGraph` (`generate.ts:267-288`) captures
  those edges, `earliestReady` (`:364-373`) enforces `prereq.semester + 1`, and the anchor
  (`anchorOf`, `:360`) pulls each to its curriculum phase. Consecutive, in-order placement
  is the natural outcome — the special case is redundant even when its matchers work.
- Where a chain link has **no** declared prerequisite edge, the "must be consecutive"
  constraint was never a real UFSC rule anyway; the maintainer only wants earliest-feasible
  placement. Dropping it cannot delay graduation and removes a class of silent-drop bugs.
- The matchers match nothing in production (`"projetos i"` vs actual "Projeto Integrador I"),
  so the mechanism is currently pure dead weight plus a silent-drop hazard, not a working
  feature. Fixing the strings would only reintroduce the fragile `placeGroup`-returns-false
  → `continue` drop path (`:480-484`).

Concretely, in `generate.ts`:

1. Delete `SEQUENCE_GROUP_MATCHERS` (`:92-98`), `findSequenceGroups` (`:116-127`),
   `placeGroup` (`:412-450`), the `groupOf`/`placedGroups`/`sequenceGroups` locals
   (`:341,452-456`), and the `ignoreGroup` parameter of `earliestReady` (`:364,367-369`).
   `normalizeCourseName` (`:100-108`) moves to `candidates.ts` for the predicate; if nothing
   else references it in `generate.ts` after the deletion, remove it there.
2. Simplify the placement loop (`:473-486`) to just:
   `for (const course of order) { if (placements.has(course.id)) continue; placeSingle(course); }`
3. Update the docstrings: remove design point 3 (`:22-24`) and the `SEQUENCE_GROUP_MATCHERS`
   JSDoc narrative (`:88-98`).

This is the **minimal, robust** fix: strictly less code, no behavioral special case, and the
existing `placeSingle` → (still unplaced) → `classifyUnplaceable` path (`:510-524`)
guarantees the invariant — a course that `placeSingle` cannot seat is reported with a reason
rather than silently dropped. `placeSingle` returning without committing when
`earliestReady` is `null` (a prereq unplaced) is already handled: that course later surfaces
in `unplaceable` classified as `"prereq"` via `classifyUnplaceable` at `diagnosticPhase`.

No new mechanism is warranted. If the maintainer ever *does* require a hard consecutive
constraint that prerequisites don't already express, it should be reintroduced deliberately
with course-**id** matching (not name matching) and a fall-through-to-`placeSingle`
guarantee — but that is out of scope and speculative for this sprint.

---

## Steps (owner per step)

**Step 1 — Non-discipline predicate + wiring (`backend-engineer`)**
Files: `lib/plan-generator/candidates.ts`, `lib/plan-generator/generate.ts`.
- Move `normalizeCourseName` from `generate.ts:100-108` into `candidates.ts` and export it
  (single source of truth; `generate.ts` imports it only if still needed after Step 2 — it
  will not be).
- Add exported `isNonDisciplineRequirement(course)` using the normalized-name substring
  match on `"atividades complementares"`.
- Add `&& !isNonDisciplineRequirement(course)` to the `buildRemainingCandidates` filter
  (`:80-84`).
Verified by: `candidates.test.ts` (Step 3).

**Step 2 — Remove sequence-group machinery (`backend-engineer`)**
File: `lib/plan-generator/generate.ts`.
- Delete the five constructs listed in Approach/Defect 2 §1, simplify the loop (§2), drop
  the `ignoreGroup` param, and update docstrings (§3).
- Confirm `placeSingle` is the sole placement path and unchanged otherwise.
Verified by: `generate.test.ts` (Step 3) + `pnpm run lint` + `pnpm run build` (type-check
catches any dangling reference to a deleted symbol).

**Step 3 — Tests for both fixes (`backend-engineer`)**
Files: `lib/plan-generator/candidates.test.ts`, `lib/plan-generator/generate.test.ts`.
See Testing section for tooling and cases.

**Step 4 — Verification pass (`backend-engineer`)**
Run lint, build, and the new tests. Optionally spot-check against a real curriculum
(CC 208) that INE7011 is absent and the Projeto Integrador chain lands in consecutive
prereq-ordered phases.

---

## Testing

**Current state:** the repo has **no test tooling and no test files** (`package.json` has no
`test` script, no vitest/jest; zero `*.test.ts` exist). `tsx@^4.22.0` is already a
devDependency.

**Recommendation:** keep it proportional to a hobby project — do **not** pull in Vitest/Jest
config for two pure-function fixes. Author tests with Node's built-in `node:test` +
`node:assert/strict`, runnable via the already-present `tsx`:

- Add script: `"test": "node --import tsx --test lib/plan-generator/*.test.ts"` (or
  `npx tsx --test ...`). Zero new dependencies. If the maintainer prefers Vitest later,
  these `node:test` files migrate with trivial edits.

The engine is fully pure (no React/store/fetch imports — confirmed in `generate.ts` header),
so tests construct plain `Course[]` / `StudentPlan` / `sections` fixtures and assert on the
returned `PlanScenario`. Trade-off: `node:test` has a thinner API than Vitest, but these are
straightforward equality/membership assertions.

**`candidates.test.ts` (Defect 1):**
- `isNonDisciplineRequirement` → `true` for names "Atividades Complementares 1" and
  "Atividades Complementares: Engenharia de Computação" (both verified prod cases); accent
  and case variants.
- `isNonDisciplineRequirement` → `false` for ordinary disciplines, including a course that
  legitimately has empty `equivalents`/no current sections (guards against the rejected
  heuristic sneaking back in).
- `buildRemainingCandidates` excludes an "Atividades Complementares" course even when typed
  `mandatory` and not terminal; still includes a normal mandatory course in the same input.

**`generate.test.ts` (Defect 2 + invariant):**
- **Chain sequencing:** three courses A→B→C linked by prerequisites, ample cap/sections →
  all placed in strictly increasing consecutive semesters, in order. (Proves prereq path
  sequences the project chain without the special case.)
- **No silent drop:** a mandatory course whose prereq is itself unplaceable → the dependent
  appears in `unplaceable` (reason `"prereq"`), never missing.
- **Invariant (core):** for a mixed fixture (placeable + a conflict-only course + a
  no-turno course + an "Atividades Complementares" pseudo-course),
  `{placed ids} ∪ {unplaceable ids}` equals the set of remaining schedulable mandatory
  disciplines exactly, and the pseudo-course id appears in **neither** set nor in
  `placedWithoutSection`.
- **Regression guard for the old names:** a course literally named "Projetos I" and one
  named "Projeto Integrador I" both get placed via the normal path (proves removal didn't
  regress placement for either the old dead-matcher name or the real name).

---

## Risks

- **Invariant is the whole point — test both directions.** The failure mode being fixed is
  *silent omission*. A test that only checks "placed ids are correct" misses it; assert the
  exact set union equals `R` and that non-disciplines are in neither bucket.
- **Over-narrow predicate.** If the substring token is misspelled or made equality-based it
  will miss the colon-suffixed Eng Comp variant. Keep it `includes`, on the normalized
  string, and cover both prod names in the test.
- **Over-broad predicate.** Do not extend the match list to "estágio"/"tcc"/"projeto"
  speculatively — several of those are real schedulable disciplines and excluding them would
  silently drop graduation-required courses. Single verified token only.
- **Dangling references after deletion.** Removing `placeGroup`/`findSequenceGroups`/
  `groupOf` must be complete; TypeScript build will catch stragglers, but also grep for
  `group`, `sequence`, `ignoreGroup` in `generate.ts` after editing.
- **Scenario dedupe unaffected.** `scenarioSignature` (`:559-567`) reads only placements +
  unplaceable ids; fewer courses simply change signatures. No coupling to the removed code.
- **Out of scope, do not touch:** the two parallel curriculum caches, the
  CurriculumVisualizer/GridVisualizer status duplication, and the `normalizeProfessorId` 3×
  duplication are unrelated known debt — this sprint neither fixes nor extends them (moving
  `normalizeCourseName` into `candidates.ts` consolidates rather than forks, staying
  consistent with the guardrail).

---

## Verification

- `pnpm run lint` — clean.
- `pnpm run build` — type-check passes (proves no dangling references to deleted symbols).
- `pnpm run test` (new script) — both test files green, invariant assertions included.
- Manual spot-check (optional): run the generator against CC 208 in dev; confirm INE7011
  "Atividades Complementares 1" appears nowhere in the preview and the Projeto Integrador
  chain lands in consecutive, prereq-ordered phases with sections.
