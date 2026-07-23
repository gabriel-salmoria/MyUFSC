# Sprint 03 — Scheduler Core — Technical Plan

Redesign the deterministic (NO AI) plan generator (`lib/plan-generator/`) from a naive
greedy roll-forward into a **proper curricular scheduler for a night student**, targeting
UFSC Sistemas de Informação (SI, `238_20111`).

**Scope: the CORE only.** Four capabilities + two small output additions. Optativas (288h)
and the daytime-exception simulation are **deferred to Sprint 04** — mentioned as future,
not designed here.

Owner tags: almost everything is `backend-engineer` (the engine is pure — no React/store/
fetch imports). Two tiny render lines in the existing modal are `frontend-engineer`. No
`design`, DB, or API work this sprint.

---

## Schedule-data finding (verified before designing — the mandatory Bash check)

`curl "https://myufsc.vercel.app/api/schedule?currentDegree=238_20111"` → **HTTP 200,
15 KB**. Shape (differs from the doc's `scheduleData` naming — verify against this):

```
{ fetchedSemester: "20262",
  availableSemesters: ["20262","20261","20252","20251"],
  "238_20111": { FLO: [ /* 60 course arrays, MatrUFSC format */ ], DATA: "..." } }
```

The section blob is keyed by the **program id** (`"238_20111"`), then by campus (`FLO`).
`parsescheduleData(j["238_20111"])` (`parsers/class-parser.ts:107`) yields
`professors: Record<courseId, Professor[]>` with **56 courses carrying sections**. Each
`Professor` exposes `slots: ClassSchedule[]` (`{day, startTime, endTime}`, day 0=Mon..
5=Sat), which is exactly what `expandToCells` consumes. Data is live and sufficient.

**The maintainer's collision example is real in today's data** (semester 20262), parsed
through the real pipeline:

| Course | Sections | Slots (day/start) |
|---|---|---|
| `INE5638` "Introdução a Projetos" | 1 (`07238`) | **Sat 08:20** only |
| `INE5614` "Eng. Software" (Projetos chain root) | 1 (`05238`) | **Mon 18:30**, **Wed 18:30** |
| `INE5607` "Org. Arquitetura" (SO→Redes chain root) | 2 (`02238A`, `02238B`) | both **Wed 18:30**, **Thu 18:30** |

- `INE5638`'s only offering is **Saturday morning** — it would be discarded by any naive
  "start ≥ 18:00" night filter, confirming the whitelist exception is load-bearing, not
  hypothetical. Its slot is Saturday → stripped as neutral → consumes **zero** weekday
  capacity.
- `INE5614` and `INE5607` **cannot co-start**: every section pair shares the **Wed 18:30**
  cell (5614 has one section fixed on Wed; both of 5607's sections are Wed+Thu). No
  conflict-free pairing exists → one chain slips +1 semester. The collision detector (Task 4)
  can be built and unit-tested directly against these exact shapes.

Grid night slots (`TIMETABLE_CONFIG.TIME_SLOTS`): indices `10=18:30, 11=19:20, 12=20:20,
13=21:10`. A 2-credit night course spans two cells = one "block": block A `{18:30,19:20}`
or block B `{20:20,21:10}`. **5 weekdays × 2 blocks = the 10 weekly slots** the capacity
model is built on. Observed SI start times confirm this: 89 sections at 18:30, 46 at 20:20,
the rest daytime/Saturday.

**Impact on the design: none blocking.** All four capabilities are grounded in real,
currently-available data. The one caveat is temporal — the snapshot is `20262`; the
generator reuses it for all future semesters (see Output Addition 2).

---

## Goal

For an SI night student, produce a plan where each semester is a **maximum-value,
time-conflict-free set** of night-eligible mandatory courses, ordered so structural
bottlenecks are never needlessly delayed, and where the result **honestly reports the
minimum-semesters floor** — including floors forced by two central courses that cannot
share a semester because all their sections collide.

---

## Affected files

**New (pure engine):**
- `lib/plan-generator/packing.ts` — the per-semester max-weight section-packing solver
  (Task 1). Exact branch-and-bound with a node-budget guard + greedy fallback.
- `lib/plan-generator/bottleneck.ts` — bottleneck weights, top-K critical roots, the
  mutual-exclusion collision detector, and the minimum-semesters floor (Tasks 3 & 4).
- `lib/plan-generator/night.ts` — night-turno predicate + the Saturday-exception whitelist,
  keyed by course **id** (Task 2). Small; could fold into `schedule-conflict.ts`, but a
  generator-local file keeps the SI-specific whitelist out of the shared conflict util.

**Changed (pure engine):**
- `lib/plan-generator/generate.ts` — replace `placeSingle`'s independent roll-forward with a
  semester-by-semester call into the packing solver; wire weights, night filter, collisions,
  floor, and the two output flags. Update the module docstring (the "anchor to the grade"
  narrative changes for the night scheduler — see Task 1 decision).
- `lib/plan-generator/types.ts` — add `bottleneckCollisions`, `minSemestersFloor`,
  `assumesReusedFutureSchedule`/`scheduleSnapshotSemester`, and the graduation-requirements
  reminder to `PlanScenario`; extend `GeneratorConfig` (optional secondary cap semantics +
  optional whitelist override for tests).
- `lib/prerequisites.ts` — refactor `computeBlocksCounts` to share its `requiredBy` build
  with a new `computeBottleneckWeights` (transitive-dependent count **and** critical-path
  depth). No behavior change to existing `computeBlocksCounts` callers.

**Changed (UI — `frontend-engineer`, ~15 lines total):**
- `components/schedule/plan-generator-modal.tsx` — render three read-only additions: the
  `bottleneckCollisions` diagnostic, the "horários futuros são estimados" assumption note,
  and the 360h/288h graduation reminder. No logic change; the modal already maps
  `unplaceable`/`placedWithoutSection` (`:287,409,430`).

**New (tests — `node:test` via `tsx`, matching Sprint 02):**
- `lib/plan-generator/packing.test.ts`, `lib/plan-generator/bottleneck.test.ts`, and new
  cases appended to `generate.test.ts`. The `test` script already exists
  (`package.json:12`) and globs `lib/plan-generator/*.test.ts`.

**Reused as-is (do not fork):** `expandToCells`, `sectionsConflict`, `sectionInTurno`,
`stripNeutralDays`, `turnoOfSlot`, `SATURDAY_DAY` (`lib/schedule-conflict.ts`);
`checkPrerequisites`, `generateEquivalenceMap`; the existing `buildRemainingCandidates`,
`buildPrecedenceGraph`, `cloneToHistory`, `computeStartSemester`, `earliestReady` scaffolding
in `generate.ts`.

---

## Task 1 — Slot-based night capacity via per-semester max-weight packing

**The change.** Today `placeSingle` (`generate.ts:347`) seats each course independently at
its earliest feasible semester in a fixed course order — a greedy roll-forward that never
reasons about which *set* of courses best fills a semester. Replace it with a
**semester-by-semester packing loop**: for each semester `n` (ascending from `startN`),
compute the eligible set, solve for the **maximum-weight conflict-free set of (course,
section) picks**, commit them, then advance — courses that don't fit roll to `n+1` (where
newly-satisfied prereqs may make more eligible). This is a max-weight independent set on the
section-conflict graph, not a naive greedy.

**Eligibility of course `c` at semester `n`:**
1. prereqs satisfied by committed history + everything committed in semesters `< n`
   (reuse `earliestReady`'s prereq logic against `placements`);
2. `n ≥ startN` only — NO phase floor. The grade-anchor is relaxed (Gate-1 decision): a
   course is eligible as soon as its prereqs are met, regardless of nominal phase;
3. `c` has ≥1 turno-valid section under the night filter + whitelist (Task 2), OR has no
   section data (placed "sem turma", zero cells — preserves current `NO_DATA` behavior).

**The solver (`packing.ts`).** Input: eligible courses, each with its list of turno-valid
sections (cell-sets, Saturday already stripped → neutral courses contribute empty sets and
never conflict), a node-weight per course (Task 3), and the optional secondary credit cap.
Output: chosen `{courseId, classNumber}[]` maximizing total weight.

Model = weighted **set packing** (choose ≤1 section per course; chosen cell-sets pairwise
disjoint). Exact branch-and-bound:

```
sort eligible by weight desc (tie: fewer sections first, then id)  // strong branches first
dfs(index, occupiedCells, creditsUsed, chosen):
  prune if weight(chosen) + optimisticRemaining(index) <= best     // bound
  at leaf → record best
  for each section s of course[index] whose cells ∩ occupiedCells = ∅
      and creditsUsed + credits ≤ secondaryCap:
    dfs(index+1, occupiedCells ∪ s.cells, creditsUsed+credits, chosen+[c,s])
  dfs(index+1, occupiedCells, creditsUsed, chosen)                 // skip course[index]
```

Occupancy is naturally bounded — only 10 weekday (day,block) cells exist at night, so at
most ~5 courses ever co-fit; the disjointness prune collapses the tree hard. Guard with a
**node budget** (e.g. 50 000 dfs calls); on overflow, fall back to greedy-by-weight
(pick highest-weight course, first non-conflicting section, repeat) and flag the scenario so
the fallback is observable in tests. `optimisticRemaining` = sum of weights of not-yet-
decided courses (admissible bound; keeps it exact under budget).

**Complexity.** Weights precomputed once, `O(V+E)`. Per semester: worst case exponential in
eligible-set size but bounded by the 10-cell capacity and the weight bound; in practice a
handful of nodes for SI (≤ ~12 eligible, ≤ 3 sections each). Whole run ≈ `O(semesters ×
budget)` with budget a small constant in practice.

**Decision — credit cap: keep as optional secondary limit, do NOT keep as the primary
capacity constraint.** The primary capacity is now the conflict-free packing itself (you
physically cannot exceed 10 night cells). The `creditCap` stays enforced *inside* the
solver as an extra pruning constraint so a student who wants ≤3 courses/semester still can,
and so the existing modal cap input and the "Carga leve" seed keep working unchanged.
Default night behavior: the cap rarely binds (5 night courses ≈ 20 credits < default 30).
Rationale: replacing it outright would break the modal contract and the fan-out seeds for no
benefit; demoting it to secondary is the minimal, backward-compatible move.

**Decision — RELAX the grade-anchor → earliest-feasible critical-path scheduling
(maintainer override at Gate 1; see `decisions.md`).** Eligibility rule 2's phase floor
`anchorOf(c) ≤ n` is **dropped**: a course is eligible as soon as its prerequisites are met
(by history + everything committed in semesters `< n`), independent of its nominal
curriculum phase. The only lower bound is `n ≥ startN`. This makes the packer a classic
critical-path/list scheduler, which is what actually minimizes total semesters — the
maintainer's stated goal — for a night student capped at ~5 courses/semester. `anchorOf` is
no longer a placement constraint (bottleneck weight from Task 3 is the primary priority; it
may still feed a deterministic tie-break). Consequence accepted: the plan may diverge
substantially from the official phase layout, with bottleneck chains starting as early as
prerequisites allow. Update the `generate.ts` docstring to reflect this (the Sprint 01
"anchor to the grade" narrative no longer applies).

**Files:** `packing.ts` (new), `generate.ts` (replace the `order`-loop + `placeSingle` with
the per-semester packing loop; `pickSection`'s conflict/turno logic is absorbed into the
solver's section-filtering). Keep `commit`, `ensureSemester`, materialization, and
`classifyUnplaceable` — a course never chosen by any semester's solve up to `maxN` still
falls through to `unplaceable` with a reason, preserving the Sprint 02 invariant
(`{placed} ∪ {unplaceable} == R`).

**Tested by** `packing.test.ts`: two mutually-conflicting courses → solver picks the
higher-weight one; two disjoint courses → picks both; a course offered on two sections where
only one avoids a conflict → picks that section; secondary cap caps the chosen credit sum;
node-budget overflow → greedy fallback returns a valid (possibly non-optimal) packing and
sets the flag. Plus a `generate.test.ts` case: >5 night-eligible no-prereq courses at the
same anchor → spread across consecutive semesters ~5 at a time, none dropped.

---

## Task 2 — Night-only turno filter with the fixed Saturday `INE5638` exception

**The change.** "Night only" = `TurnoFilter {night:true}` — already precise via
`turnoOfSlot` (`schedule-conflict.ts:116`, night = start ≥ 18:00) and `sectionInTurno`
(all slots must be night). No threshold change needed. The gap is the **whitelisted
exception**: `INE5638`'s only section is Saturday 08:20 → `sectionInTurno` returns false →
the course would be wrongly dropped.

**Encode the exception by course id (never by name).** New `night.ts`:

```ts
/** Courses allowed to bypass the night-only turno filter. SI's INE5638
 *  "Introdução a Projetos" is offered ONLY Saturday morning (verified in the
 *  20262 snapshot); Saturday is neutral in conflict detection so it consumes no
 *  weekday capacity. Keyed by id — the Sprint 01/02 name-matcher fiasco is the
 *  cautionary tale (see sprints/02 plan, Defect 2). */
export const NIGHT_TURNO_EXCEPTIONS: ReadonlySet<string> = new Set(["INE5638"]);

export function isNightTurnoValid(course, prof, turno, exceptions = NIGHT_TURNO_EXCEPTIONS) {
  return exceptions.has(course.id) || sectionInTurno(prof.slots, turno);
}
```

The solver and `classifyUnplaceable` call `isNightTurnoValid` instead of `sectionInTurno`
directly. Because `stripNeutralDays` already empties `INE5638`'s Saturday cells, the
whitelisted section carries an **empty cell-set** → never conflicts → placed with its real
`classNumber` while consuming zero weekday capacity. Exactly the real-world behavior.

**Decision — whitelist location & overridability.** Keep it a module-level `Set` in
`night.ts` (not in the shared `schedule-conflict.ts`, which must stay curriculum-agnostic),
and accept an optional `exceptions` override so tests can inject fixtures and Sprint 04 can
extend it (daytime exceptions) without touching this constant. Trade-off: SI-specific
knowledge lives in the generator — acceptable, it is the only night degree in scope, and id-
keying makes adding SItiy-4's exceptions a one-line change.

**Tested by** `generate.test.ts`: with `NIGHT_ONLY`, a course whose only section starts
13:30 is filtered out (→ `no-section-in-turno` or rolled); `INE5638` with a Saturday-only
section **is placed** (not unplaceable) and adds **zero** weekday cells to its semester's
occupancy (assert another night course sharing that semester still fits). Also assert the
match is id-based: a *different* course literally named "Introdução a Projetos" with a
daytime-only section is NOT whitelisted.

---

## Task 3 — Bottleneck-priority weighting

**The change.** Extend the precedence signal from "count of transitive dependents"
(`computeBlocksCounts`) to a **bottleneck weight = f(critical-path depth, dependents
unlocked)**, used as the node weight in the Task-1 solver and as the placement tie-break.

**`prerequisites.ts` refactor.** Factor the `requiredBy` (dependents) adjacency build out of
`computeBlocksCounts`, then add:

```ts
// depth(c) = longest dependent chain rooted at c = # of future semesters a delay
//            of c would cascade ("semesters unlocked"). Memoized DFS over requiredBy,
//            cycle-guarded (mirror memoLongest in generate.ts).
// dependents(c) = transitive |requiredBy*| (the existing computeBlocksCounts value).
// weight(c) = depth(c) * W + dependents(c),  W = courses.length  (depth dominates,
//            dependents breaks ties). Chain-roots of deep chains sort first.
export function computeBottleneckWeights(courses): Map<string,
  { depth: number; dependents: number; weight: number }>
```

`computeBlocksCounts` keeps its signature/behavior (still used by `candidates.ts:104` and
the modal-independent ordering) — it just delegates the shared graph build. The SI Projetos
chain (Gerência → Projeto Integrador I → II → …, ~4 deep) gives `INE5614` a large `depth`;
`INE5607` (opens SO→Redes) likewise — both float to the top-K roots Task 4 consumes.

**Use in `generate.ts`:** the solver's node-weight = `weight(c)` so, when capacity binds and
more courses are eligible than fit, the max-weight IS keeps the chain-roots and defers the
leaves — delaying a root (which cascades) is what we avoid. The existing `order` sort's
`blocks` tie-break (`generate.ts:370`) is replaced by `weight`.

**Complexity.** `O(V+E)` (two memoized passes over the DAG). Negligible.

**Tested by** `bottleneck.test.ts`: A→B→C→D chain gives A `depth 3`; a root that unlocks a
wide-but-shallow fan has lower `depth` than a narrow-but-deep chain root (asserts depth
dominates count); weights are deterministic. Plus a `packing.test.ts` case: a chain-root and
a leaf conflict for the one slot → solver keeps the root.

---

## Task 4 — Schedule-collision bottleneck-floor detection (highest design value)

**The insight to surface.** Two structurally-central courses can be individually placeable
yet **mutually exclusive** — no section pair avoids a time collision — so they can never
share a semester, forcing one chain +1 semester and *setting the minimum-semesters floor
independent of packing quality*. This is a **diagnostic** on the result, plus its effect on a
computed floor. It is deliberately a targeted pairwise detector over the top-K critical
roots, **not** a global optimum solver.

**`bottleneck.ts` — the detector.**

```
topK = the K courses with highest bottleneck weight (K = 8), restricted to
       "co-startable roots": prereqs already satisfiable by history / no remaining
       prereq among R (they could plausibly compete for the same early semester).
for each unordered pair (u, v) in topK:
   uSecs = turno-valid sections of u  (night filter + whitelist, Saturday stripped)
   vSecs = turno-valid sections of v
   if uSecs and vSecs both non-empty
      and NO (su, sv) with stripNeutralDays(su.cells) ∩ stripNeutralDays(sv.cells) = ∅:
        → mutually exclusive → push { a:u.id, b:v.id, sharedCells:[...], floorImpact:1 }
```

For SI this fires on exactly `(INE5614, INE5607)` — verified above: all pairs share Wed
18:30. Empty-section or no-data courses are skipped (can't prove exclusion).

**Minimum-semesters floor (`minSemestersFloor` on the scenario).** Combine three admissible
lower bounds — the floor is their max, then adjusted:

1. **Critical-path floor** = longest prereq chain length (in semesters) among remaining `R`.
2. **Capacity floor** = `ceil(Σ weekday-cells demanded by R / 10)` — the bare number of
   night-semesters needed just to fit the cell-hours (Saturday courses excluded from demand).
3. **Collision adjustment**: build a conflict graph over the detected mutually-exclusive
   pairs *restricted to roots sharing the same anchor phase*; add its (greedy) chromatic-
   style excess — practically **+1 per independent forcing pair** — to whichever chain it
   extends. Bounded and heuristic (pairwise only; ignores triples).

`floor = max(criticalPath, capacity) + collisionAdjustment`. Report both the raw components
and the final floor so the modal can explain "não dá para terminar antes de N semestres, e o
choque INE5614×INE5607 adiciona +1".

**Decision — scope & honesty of the floor.** State the limits explicitly in the field's
doc: (a) pairwise over top-K only — a 3-way mutual exclusion is under-counted; (b) it is a
*lower bound / diagnostic*, not a proof the floor is achievable; (c) it is computed against
the **reused** schedule snapshot (Output Addition 2), so it is an assumption, not a
guarantee. This is acceptable per the brief — "a targeted detector over the top-K
critical-path courses is acceptable." Do **not** attempt a global ILP.

**Where it runs.** Once per scenario (it depends on turno + section data, which are per-run),
inside `runGreedy`, attached to the returned `PlanScenario`. Cost `O(K²·S²)` ≈ trivial.

**SPIKE first (recommended), then build.** The pairwise detection and the collision→floor
composition are the semantically uncertain part. Before finalizing the `minSemestersFloor`
formula, run a ~1-hour spike: a throwaway `tsx` script that feeds the **live SI snapshot**
(already shown fetchable) through `computeBottleneckWeights` + the detector and confirms it
(i) flags `INE5614×INE5607`, (ii) does not flag a known co-startable disjoint pair, and
(iii) yields floor = nominal + 1. Freeze the formula from what the real data supports, then
port the validated logic + a hand-authored fixture mirroring the 5614/5607 shapes into
`bottleneck.test.ts`. Tasks 1–3 are straight builds.

**`types.ts` addition:**
```ts
export interface BottleneckCollision {
  a: string; b: string;            // course ids, mutually exclusive
  sharedCells: string[];           // e.g. ["2:10"]  (Wed, 18:30 block) — for the message
  floorImpact: number;             // semesters this forces (1 for a pair)
}
// on PlanScenario:
bottleneckCollisions: BottleneckCollision[];
minSemestersFloor: number;
```

**Tested by** `bottleneck.test.ts`: fixture with 5614 (one Mon+Wed 18:30 section) and 5607
(two Wed+Thu 18:30 sections) → one collision `{a,b}` with `sharedCells` = the Wed 18:30
cell; add a third root with a Tue-only section → **no** collision with either (guards false
positives); floor of a linear-chain fixture = chain length, and +1 once a same-anchor
mutually-exclusive pair is introduced.

---

## Output Addition A — future semesters are an assumption

The generator has one schedule snapshot (`fetchedSemester` `20262`) and reuses it for every
future semester. Add to `PlanScenario`: `assumesReusedFutureSchedule: boolean` (true whenever
any placement lands beyond the snapshot semester — effectively always) and
`scheduleSnapshotSemester: string` (pass `fetchedSemester` through `GeneratorInput`). Modal
(`frontend-engineer`) renders a one-line note: *"Horários de semestres futuros são estimados
a partir da oferta de {semester}."* Small; no logic impact.

## Output Addition B — graduation-requirements reminder

Mandatory disciplines are not the whole degree. Surface a static reminder on the result
(constant in the engine, e.g. `graduationReminder: { complementaresHours: 360, optativasHours:
288 }` — optativas scheduling is Sprint 04). Modal renders: *"Além das disciplinas: 360h de
atividades complementares e 288h de optativas (não incluídas neste plano)."* One constant +
one render line.

---

## Steps (owner per step)

1. **Weights** (`backend-engineer`) — refactor `computeBlocksCounts` + add
   `computeBottleneckWeights` in `prerequisites.ts`; `bottleneck.test.ts` weight cases.
2. **Night filter + whitelist** (`backend-engineer`) — `night.ts` (`isNightTurnoValid`,
   `NIGHT_TURNO_EXCEPTIONS`); wire into diagnosis path.
3. **Packing solver** (`backend-engineer`) — `packing.ts` branch-and-bound + budget/fallback;
   `packing.test.ts`.
4. **Rewire `generate.ts`** (`backend-engineer`) — replace `placeSingle`/`order` loop with the
   per-semester packing loop; feed weights + night filter; keep clone/anchor/materialize/
   `classifyUnplaceable`; update docstring. Extend `generate.test.ts` (night filter, INE5638,
   capacity spread, Sprint 02 invariant still holds).
5. **SPIKE → collision detector + floor** (`backend-engineer`) — validate against the live SI
   snapshot, freeze the formula, build `bottleneck.ts` detector + `minSemestersFloor`, attach
   to `PlanScenario`; `bottleneck.test.ts` collision + floor cases.
6. **Types + output flags** (`backend-engineer`) — `types.ts` fields; thread
   `scheduleSnapshotSemester` through `GeneratorInput`; graduation-reminder constant.
7. **Modal render** (`frontend-engineer`) — three read-only blocks (collisions, assumption
   note, reminder). Pass `fetchedSemester` into the `generatePlanScenarios` input at
   `plan-generator-modal.tsx:119`.
8. **Verify** — `pnpm run lint`, `pnpm run build`, `pnpm run test`; manual SI spot-check in
   dev (INE5638 on Saturday, 5614×5607 collision surfaced, floor = nominal+1).

Steps 1–3 are independent and can land in parallel; 4 depends on 1–3; 5 depends on 1; 6 on
4–5; 7 on 6.

---

## Risks

- **Whitelist by id, never name.** The Sprint 01/02 sequence-matcher matched no real course
  and silently dropped work. `NIGHT_TURNO_EXCEPTIONS` is id-keyed and unit-asserted to be
  id-based. Do not reintroduce name matching.
- **Solver blow-up.** Exact set-packing is NP-hard; the 10-cell capacity bounds it, but a
  pathological eligible set could still explode — the node-budget + greedy fallback is
  mandatory, not optional, and the fallback path must be tested.
- **Floor honesty.** `minSemestersFloor` is a diagnostic lower bound over top-K pairs against
  a reused snapshot — document all three limits on the field. Over-claiming it as a guaranteed
  minimum would mislead. Spike-validate against live data before freezing.
- **Snapshot drift.** The whole scheduler assumes `20262` sections repeat; Addition A makes
  this visible to the student. A future semester that drops the sole 18:30 section of a
  course would silently change reality — out of scope to solve, but the assumption flag is the
  honest mitigation.
- **Sprint 02 invariant must survive.** `{placed} ∪ {unplaceable} == R`, no non-discipline in
  either set — re-run the existing `generate.test.ts` invariant case after the rewrite; the
  packing loop must still route never-chosen courses to `classifyUnplaceable`.
- **Known debt — do not reintroduce.** No new normalizer forks; reuse `schedule-conflict.ts`
  math; do not touch the two curriculum caches or the Curriculum/Grid status duplication.
- **Spike vs build.** Task 4 detector/floor = **spike then build** (semantic uncertainty).
  Tasks 1–3 and both output additions = straight **build** (mechanics are clear; solver has a
  bounded fallback).

---

## Verification

- `pnpm run lint` clean; `pnpm run build` type-checks (catches dangling refs after the
  `generate.ts` rewrite).
- `pnpm run test` green — `packing.test.ts`, `bottleneck.test.ts`, extended
  `generate.test.ts`, and the retained Sprint 02 invariant case.
- Manual dev spot-check against SI `238_20111`: `INE5638` placed on Saturday consuming no
  weekday slot; night-only plan contains no daytime section; `bottleneckCollisions` reports
  `INE5614 × INE5607`; `minSemestersFloor` = nominal critical-path + 1; the assumption note
  and 360h/288h reminder render in the modal.

---

## Iteration 2 — minimum-semester search

Iteration 1 shipped the night critical-path packer. Root cause #1 (weights over the full
curriculum instead of `remaining`) is already fixed on `main` — `generate.ts:278` calls
`computeBottleneckWeights(remaining)`. This iteration addresses root cause #2: a single
greedy forward pass that optimizes **per-semester bottleneck weight** is a *proxy* for the
maintainer's true objective ("o número total de semestres … é o que se quer minimizar").
Max-weight-per-semester can under-fill (one high-weight course blocking two lighter ones)
and can defer the wrong root. The fix: make the generator **explicitly search for the
minimum-total-semesters plan** — run the existing packer under several deterministic
priority rules and return the shortest.

### Goal

`generatePlanScenarios` returns, as "Mais rápido", the **minimum-makespan** plan the engine
can find over a small fixed set of deterministic strategies, tagged `isOptimal` when it
provably hits `minSemestersFloor`. Never worse than Iteration 1's single-pass result (the
current strategy is one of the K searched), and ideally 12→11 for SI `238_20111`.

### Affected files

- **`lib/plan-generator/packing.ts`** — parameterize the maximized quantity. Add an optional
  `value?: number` to `PackingCandidate`; the solver maximizes `Σ value` with `value ?? weight`
  (so the bound `suffix[]`, the `orderCandidates` sort, and the greedy fallback all read
  `value`). No algorithmic change — the same branch-and-bound, budget, and fallback. This is
  the single hook that lets one strategy express "cardinality-primary" by reusing the solver
  instead of writing a new one.
- **`lib/plan-generator/search.ts`** (new) — the strategy set, the `packForward` strategy
  runner (extracted from `runGreedy`'s per-semester loop), the makespan comparator, and
  `searchMinSemesters(ctx, config)`.
- **`lib/plan-generator/generate.ts`** — split `runGreedy` into (a) a config-independent
  `prepareGeneration(input)` returning the shared context (clone, `workingInfo`, `remaining`,
  `startN`, `maxN`, `graph`, `weights`, `courseById`, `equivMap`), and (b) `packForward(ctx,
  config, valueOf)` — the current `for n in startN..maxN` pack loop, now taking a per-course
  `valueOf` function, plus the materialization + `classifyUnplaceable` tail. `runGreedy`
  becomes `packForward` under the weight strategy (kept for the existing single-run tests).
  `generatePlanScenarios` calls `searchMinSemesters`.
- **`lib/plan-generator/types.ts`** — add to `PlanScenario`: `isOptimal: boolean` (achieved
  makespan == `minSemestersFloor`), `strategyId: string` (which rule won — debug/telemetry).
  `minSemestersFloor` and `totalFutureSemesters` already exist and are the "vs floor" pair the
  UI needs.
- **`lib/plan-generator/search.test.ts`** (new) + cases in `generate.test.ts` — see Testing.

### Search shape — recommendation: **multi-strategy greedy** (not beam)

Compared the two:

| | Multi-strategy greedy | Bounded beam |
|---|---|---|
| Cost | K × one forward pass | B × branches × semesters + heuristic + state dedup |
| New machinery | a `valueOf` param + a K-way min | partial-plan state, per-semester *multi*-packing enumeration, makespan heuristic, beam pruning/dedup |
| Reuse of Iteration-1 code | ~total (`packForward` = today's loop) | partial (packer must return N maximal packings, not one) |
| Determinism | trivial (fixed strategy list) | needs a total order on partials |
| Payoff at this size | attacks both failure modes directly | marginal — makespan is only ~9–12 deep |

**Recommend multi-strategy greedy.** The current engine's weakness is not that greedy
per-semester packing is bad — the 10-cell night capacity makes each semester's packing nearly
exact already. The weakness is a *single fixed priority rule*. Trying a handful of
deterministic rules and keeping the min-makespan directly attacks both documented failure
modes (under-fill, wrong-root-deferral) while reusing `packMaxWeight` and the whole forward
loop verbatim. Beam search adds a partial-state engine and a makespan heuristic for a problem
that is ~9–12 semesters deep with ≤~12 eligible/semester — over-engineering for a hobby
project, and it still can't guarantee the optimum without a large B. Per the brief: favor the
simplest design that reliably matches/beats a hand plan.

### Strategy set (declaration order = deterministic final tie-break)

Each strategy differs **only** in the per-course `value` fed to the (unchanged) solver.
For the cardinality strategies, `BASE = 1 + Σ(weights of the eligible candidates this
semester)`; since one extra selected course adds `BASE > Σ weights`, maximizing `Σ value`
maximizes **count first, then the tiebreak** — expressing "maximize cardinality, then X" in
the existing summed-value solver with no new code.

1. **S1 — weight-primary** `value = weight` *(current behavior)*. Keeps the deepest chain
   roots when capacity binds; wins when a leaf and a root compete for the last slot and
   deferring the root would cascade downstream (the INE5614/INE5607 shape). Including it
   **guarantees the search never regresses** Iteration 1.
2. **S2 — cardinality-primary, weight tiebreak** `value = BASE + weight`. Maximizes courses
   per semester → fills under-filled phases (the maintainer's "mais disciplinas por fase").
   Wins the primary reported failure mode: when one heavy course blocks two lighter
   conflict-disjoint ones, packing the two uses the same night capacity yet advances more of
   the plan, so the tail shortens by a semester.
3. **S3 — cardinality-primary, depth tiebreak** `value = BASE + depth` (depth from the
   weights map). Same fill as S2, but when several max-count packings tie it advances the
   *deepest still-pending chain* first, scheduling the critical chain's next link as early as
   possible. Wins when two equal-cardinality packings tie and only one keeps the long chain
   progressing (avoiding a later stall).

**Why not a separate pure critical-path-depth strategy?** `weight = depth·scale + dependents`
already makes depth dominate dependents (`prerequisites.ts:98`), so a depth-primary rule is
nearly identical to S1 and adds no diversity. Depth is genuinely distinct only as a
*cardinality* tiebreak — which is exactly S3. Avoiding the redundant strategy keeps K minimal.

**K = 3.** A 4th rule (weight-primary with a rotated candidate order, to shake
ordering-induced ties) is cheap to add later *iff* a fixture demonstrates S1–S3 miss an
optimum; do not ship it speculatively. The dead `sectionRotation` field on `RunSeed`
(declared, never read by `runGreedy`) is superseded — the solver already picks the
value-maximizing conflict-free section per course — and should be dropped or repurposed only
if "Outro mix" is retained (see Scenario fan-out).

### Objective & tie-break (fully deterministic)

Compare scenarios by this chain, all ascending (smaller is better); first difference wins:

1. `unplaceable.length` — place more of R (guards against a strategy "winning" by dumping
   courses into `unplaceable`; in practice this set is strategy-invariant, see below).
2. `totalFutureSemesters` — **the makespan; the primary objective.**
3. `peakSemesterCredits` — flattest load among equal-length plans (nicer, and aligned with
   the "carga leve" spirit).
4. `Σ (placementSemester × bottleneckWeight)` over placed courses — earlier completion of
   the critical chains.
5. strategy declaration index (S1 < S2 < S3) — a stable final tiebreak so the result is
   byte-for-byte deterministic (same input → same plan).

`unplaceable` is structurally determined by prereq feasibility, night-turno availability, and
whether a course can ever fit within the `SAFETY_MAX_SPAN` window — none of which the packing
*order* changes for a healthy curriculum. So in practice all strategies place the same set and
ranking collapses to makespan; keeping criterion 1 first is a cheap correctness guard.

### Lower bound & early stop

`minSemestersFloor` (from `analyzeBottlenecks`, `bottleneck.ts`) is an admissible lower bound
on future semesters and is **config-dependent but strategy-independent** — compute it **once
per config**, before running the strategies (hoisted out of the per-strategy path; today it
runs inside each `runGreedy`). Then:

- If a strategy's `totalFutureSemesters == minSemestersFloor`, it has hit the lower bound →
  **provably optimal, stop early**, set `isOptimal = true`, skip the remaining strategies.
- Otherwise run all K and set `isOptimal = (best.totalFutureSemesters == minSemestersFloor)`.

Always attach both numbers so the modal can render "ótimo" when equal and "melhor encontrado
(piso: N)" otherwise. Honesty caveat (already documented on `minSemestersFloor`): the floor is
a top-K pairwise diagnostic against a reused snapshot, so `isOptimal` means "matched our
admissible lower bound," not a global feasibility proof — acceptable, and strictly better
information than today.

### Invariants preserved (the search only *wraps* the packer)

- **Relaxed anchor / earliest-feasible** — `packForward` reuses the identical `prereqsReadyBy`
  eligibility; untouched.
- **Night filter + INE5638 Saturday exception** — `buildCandidate` / `isNightTurnoValid`
  reused verbatim; the strategy changes only `value`, never section eligibility.
- **`remaining`-based weights** — weights still computed over `remaining` in
  `prepareGeneration`; strategies derive `value` from them, never recompute over the full
  curriculum.
- **Sprint-02 invariant `{placed} ∪ {unplaceable} == R`** — each strategy materializes through
  the existing tail; the search returns one materialized scenario, so the invariant holds for
  the winner unchanged.
- **Collision-floor diagnostic** — computed once per config, attached to the winner. Unchanged.
- **Budget + fallback** — `packMaxWeight`'s node budget and `usedFallback` flag are untouched;
  the winner's `usedPackingFallback` reflects its own run.

### Performance budget

- **Worst case:** `K × SAFETY_MAX_SPAN × DEFAULT_NODE_BUDGET` dfs calls =
  `3 × 16 × 50 000 ≈ 2.4M` node visits, each a handful of set ops on ≤10-element cell sets —
  still well under a second, and this bound is never approached because the 10-cell night
  capacity collapses each semester's B&B to a few dozen nodes.
- **Typical case (SI):** a few thousand node visits total across all three strategies.
- **Hard cap / fallback:** the outer loop is a **fixed-length list** (K = 3, a compile-time
  constant) so it cannot blow up combinatorially; the only unbounded surface is inside
  `packMaxWeight`, which already caps at `DEFAULT_NODE_BUDGET` and degrades to greedy-by-value
  with the observable flag. Early-stop on `== floor` usually ends the search after S1 or S2.
  No new budget knob needed — mirror and reuse the existing pattern.

### Scenario fan-out — recommendation: **search replaces the seed fan-out**

Today `generatePlanScenarios` fans S1/S2/S3 seeds that now dedupe to essentially one plan
(`generate.ts:483`). Replace that with:

1. **"Mais rápido" = the min-semester search** over `input.config` (the K strategies).
   Carries `isOptimal` + `minSemestersFloor`. This is the headline card and the whole point of
   the iteration.
2. **"Carga leve"** — re-run `searchMinSemesters` with the lowered `creditCap`
   (`MIN_REASONABLE_CAP`/`CARGA_LEVE_CAP_DELTA` logic kept). A lower cap genuinely spreads load
   into more, lighter semesters — a real trade-off card. Include **only if** its
   `scenarioSignature` differs from "Mais rápido" (reuse the existing dedupe).
3. **Drop "Outro mix"** (the section-rotation seed): it produced near-duplicates, and the
   strategy search now explores multiple genuinely-distinct packings internally. Its
   `sectionRotation` mechanism becomes dead and should be removed.

Net: the outer fan-out shrinks from "3 seeds × 1 strategy" to "1–2 caps × K strategies," and
the returned list is 1–2 truly-distinct cards (fastest, and optionally a lighter-load
alternative) instead of three look-alikes. `scenarioSignature` dedupe + the `≤4` cap stay.

### Steps (owner per step)

1. **Parameterize the solver** (`backend-engineer`) — add `value?: number` to
   `PackingCandidate`; solver/bound/sort/fallback read `value ?? weight`. Extend
   `packing.test.ts`: a cardinality case (`value = BASE + weight`) picks the 2-course packing
   over the 1 high-weight course; default (`value` absent) reproduces existing behavior.
2. **Extract `prepareGeneration` + `packForward`** (`backend-engineer`) — split `runGreedy` in
   `generate.ts`; `packForward(ctx, config, valueOf)` returns a materialized `PlanScenario`
   (minus the search-only fields). `runGreedy` = `packForward` under S1's `valueOf` so existing
   `generate.test.ts` keeps passing.
3. **`search.ts`** (`backend-engineer`) — the strategy list (S1–S3 with their `valueOf` +
   per-semester `BASE`), the comparator, `searchMinSemesters(input, config)` with floor
   hoisting + early-stop, sets `isOptimal`/`strategyId`.
4. **Rewire `generatePlanScenarios`** (`backend-engineer`) — Mais rápido = search(base cap);
   Carga leve = search(light cap) if distinct; remove Outro mix + `sectionRotation`.
5. **Types** (`backend-engineer`) — `isOptimal`, `strategyId` on `PlanScenario`.
6. **Tests** (`backend-engineer`) — `search.test.ts` (below) + a `generate.test.ts`
   no-regression assertion.
7. **Modal** (`frontend-engineer`, ~2 lines) — render "ótimo" vs "melhor encontrado (piso: N)"
   from `isOptimal`/`minSemestersFloor`. No logic change.

Steps 1–2 are independent; 3 depends on 1–2; 4–5 on 3; 6 on 3–5; 7 on 5.

### Testing

- **Search finds a known-optimal instance where weight-greedy gives T+1** (`search.test.ts`).
  Fixture: high-weight `H` (deep chain root) shares one night cell with each of `L1` and `L2`
  (leaves), while `L1` and `L2` are mutually disjoint; set `weight(H) > weight(L1)+weight(L2)`.
  - Assert **S1 in isolation** (`packForward` under weight `valueOf`) packs `{H}` alone in the
    first semester → `L1,L2` roll forward → makespan `T+1`.
  - Assert **`searchMinSemesters`** returns makespan `T` (S2 packs `{L1,L2}` first,
    cardinality > 1) and `strategyId` is the cardinality strategy.
  - Add a matching `H` chain so the min makespan is genuinely `T`, not incidentally equal.
- **Never worse than baseline (the key invariant)** — over each existing `generate.test.ts`
  fixture, assert `searchMinSemesters(...).totalFutureSemesters <=`
  `runGreedy(...).totalFutureSemesters`. The search *includes* S1, so this must hold by
  construction; the test locks it against future strategy edits. Covers the "never regresses
  the fresh-SI 9-semester result" requirement without shipping the full SI curriculum as a
  fixture (the SI shape reduces to the capacity-spread + collision fixtures already present).
- **Early-stop / optimality flag** — a linear-chain fixture whose makespan equals its
  `minSemestersFloor` → `isOptimal === true`; the H/L1/L2 fixture where the achieved makespan
  is above the floor → `isOptimal === false`.
- **Determinism** — run `generatePlanScenarios` twice on one input, assert identical
  `scenarioSignature` for every returned scenario.

### Risks

- **Cardinality `BASE` must dominate.** `BASE = 1 + Σ eligible weights` is required each
  semester; a too-small BASE lets weight leak past count and silently reverts S2/S3 to S1.
  Unit-assert the cardinality pick directly (Step 1 test).
- **Floor must be hoisted, not recomputed per strategy** — otherwise early-stop reads a
  strategy-local floor. Compute once per config in `searchMinSemesters`.
- **`isOptimal` honesty** — it means "matched the admissible top-K/reused-snapshot floor," not
  a global proof; keep the existing floor caveats and let the modal phrase it as "ótimo
  (estimado)".
- **Don't reintroduce debt** — the search reuses `packMaxWeight`, `computeBottleneckWeights`,
  `analyzeBottlenecks`, `isNightTurnoValid`, `schedule-conflict.ts` math; no new normalizers,
  no second packer, no status-logic fork.

### Verification

- `pnpm run lint` clean; `pnpm run build` type-checks (catches dangling refs from the
  `runGreedy` split).
- `pnpm run test` green — new `search.test.ts`, extended `packing.test.ts`, the
  never-worse-than-baseline assertion, and all retained Iteration-1 cases (esp. the Sprint-02
  invariant and the INE5638 whitelist).
- Manual dev spot-check on SI `238_20111`: "Mais rápido" reports **11** semesters (down from
  12), phases fill more densely, `bottleneckCollisions` still surfaces INE5614×INE5607, and the
  modal shows "ótimo" or "melhor encontrado (piso: N)".
