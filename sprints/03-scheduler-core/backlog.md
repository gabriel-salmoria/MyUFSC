# Sprint 03 — Scheduler Core Redesign — Backlog

## Sprint goal

Replace the plan generator's credit-cap greedy packer with the maintainer's real model —
weekly night time-slot capacity, one course per collision-free slot-pair, priority given to
structural bottlenecks — and make the engine **honest about its own floor**: when two
bottleneck courses can only be offered in colliding sections, the generator must say so
instead of silently reporting a plan that looks one semester shorter than it can actually be.
Anchored throughout to the maintainer's own verified case: Sistemas de Informação, curriculum
`238_20111` (91 courses, 9 phases).

**Sequencing note:** the four P0 stories are listed in dependency order (1 → 2 → 3 → 4), not
by independent priority — each one's acceptance criteria assume the previous one is done.
Story 5 is independent and can land any time in the sprint.

---

## Story 1 — Night-only turno filter respects the fixed `INE5638` Saturday exception

**As a** night-track SI student, **I want** the generator's night-turno filter to still
accept `INE5638` "Introdução a Projetos" even though its only section meets Saturday
morning, **so that** a mandatory course isn't wrongly reported as unplaceable ("sem turma no
turno escolhido") just because UFSC offers it outside normal night hours.

Priority: **P0** — smallest of the four core stories, and every other story's test fixtures
depend on `INE5638` being a valid candidate under a night-only run; do this first.

Acceptance criteria:
- [ ] Given the SI curriculum (`238_20111`) and `config.turno = { morning: false,
  afternoon: false, night: true }`, generating a plan that reaches `INE5638`'s anchor
  semester places it (or correctly reports it deferred/no-data for a real, orthogonal
  reason) — it is never classified `"no-section-in-turno"` solely because its section
  starts before 18h on Saturday.
- [ ] The exception is scoped to `INE5638` specifically (a fixed, named allowance) — it does
  not relax the turno filter for any other course. A manual/automated check confirms a
  different SI course whose only section is a genuine weekday-morning or -afternoon offering
  is still correctly excluded/deferred under a night-only run.
- [ ] Saturday's existing "neutral for conflict" treatment (`stripNeutralDays`,
  `SATURDAY_DAY`) is untouched — this story only changes turno-eligibility, not conflict
  detection. A Saturday section (whether `INE5638`'s or any other course's) still never
  registers a same-semester conflict with anything else.
- [ ] Regression guard: with no turno preference (all-false or all-true), behavior is
  unchanged from today — every section remains eligible regardless of this exception.
- [ ] Manual test: run the generator on a plan anchored so `INE5638` is due, night-only
  turno, and confirm it is placed with its real Saturday-morning section rather than
  appearing in "Não foi possível encaixar" with reason "Sem turma no turno escolhido".

---

## Story 2 — Slot-based night capacity model with true per-semester packing

**As a** night-track SI student, **I want** each generated semester to be packed by actual
weekly time-slot capacity (5 weekdays × 2 night start times, 18:30 and 20:20 = 10 slots,
most courses consuming 2 as an "aula dupla") instead of a raw credit-sum cap, choosing the
best-fitting *set* of eligible courses rather than filling one course at a time in a fixed
order, **so that** a generated night semester matches what a student can physically attend
and isn't arbitrarily short (or long) because credit totals don't reflect real slot geometry.

Priority: **P0** — this is the core algorithm swap the rest of the redesign builds on.

Acceptance criteria:
- [ ] For a night-only run (`config.turno.night = true`, others false), the packer's
  per-semester capacity is derived from weekly night slot geometry (5 days × {18:30, 20:20}
  = 10 slot-units/week), not `config.creditCap` — a semester is full when its committed
  sections' slot-units reach that ceiling, not when summed credits hit a number. The
  existing `creditCap` input continues to work unchanged for non-night-restricted runs (no
  regression to today's "Mais rápido"/"Carga leve"/"Outro mix" seeds when turno preference
  is off).
- [ ] Given the SI curriculum and a night-only run anchored at a phase with more than 5
  eligible, mutually-non-conflicting mandatory courses (a normal on-grade SI phase), the
  packer places at most the number of courses whose combined slot-units fit in 10 (in
  practice ≈5 two-slot courses/week for a phase with no 1-slot or 3-slot outliers) — never
  overfills a semester past the slot ceiling even though every individual course was below
  the old credit cap.
- [ ] When more eligible, mutually-compatible courses exist for a semester than fit the
  slot ceiling, the packer chooses a genuine **maximum-weight independent set** over the
  semester's conflict graph (nodes = eligible courses, edges = section time-cell collisions
  per `sectionsConflict`/`stripNeutralDays`) — not a first-fit/first-in-order placement that
  can leave slot-units unused when a different combination would have fit more or
  higher-priority courses. (Story 3 defines the weight function used by this packer; this
  story may ship with the existing priority order as a placeholder weight and be re-verified
  once Story 3 lands.)
- [ ] Regression guard: prerequisite ordering, the grade-anchoring behavior (`anchorOf`),
  and Saturday-neutral conflict handling all continue to hold — this story changes *how many
  and which* courses a semester can hold, not *when* a course becomes eligible.
- [ ] Manual test (SI case): run a night-only generation across the full 9-phase SI
  curriculum from a fresh (no history) student and confirm no generated semester's night
  sections collide, no semester exceeds 10 night slot-units, and the total semester count is
  less than or equal to what the old credit-cap packer produced for the same input (the new
  packer must never be structurally worse, only more accurate).

---

## Story 3 — Bottleneck-priority ordering by weighted unlock depth

**As a** UFSC student whose remaining courses form multiple prerequisite chains, **I want**
the generator to prioritize a course by how many future semesters delaying it would cost
(not just how many other courses it unlocks), **so that** when a semester can't fit every
eligible course, the one actually gating my graduation timeline gets the slot.

Priority: **P0** — refines the weight function Story 2's packer consumes; depends on Story 2
existing first.

Acceptance criteria:
- [ ] A new weight is computed per remaining course: the length of its longest downstream
  prerequisite chain, weighted by how many semesters that chain spans (not the existing
  `computeBlocksCounts` raw dependent-count, which treats a course unlocking 5 unrelated
  terminal courses the same as one unlocking a single 5-semester-deep chain). The packer in
  Story 2 uses this weight when choosing among eligible courses that don't all fit.
- [ ] SI case: `INE5614` "Engenharia de Software" (opens the Projetos chain) and `INE5607`
  "Organização e Arquitetura de Computadores" (opens the SO→Redes chain) both rank above a
  same-phase course with no long downstream chain, when all three compete for a slot-limited
  night semester — verified by inspecting the packer's chosen set/order for that phase.
  Reference: `docs/professor-rating-architecture-issues.md`-style verification, i.e. an
  explicit before/after comparison against the raw-dependent-count ordering, not just
  eyeballing the output.
- [ ] Regression guard: for a semester where every eligible course fits within capacity
  (no contention), the new weight has no effect on which courses are placed — only the
  choice *among competing* courses changes, not placement itself.
- [ ] Tie-break remains deterministic (documented, e.g. fall back to `phase` then `id`) so
  repeated runs on identical input produce identical plans.
- [ ] Manual test (SI case): construct/point to a phase where `INE5614` and `INE5607`
  compete for a night slot against a terminal (no-dependents) elective-adjacent mandatory
  course, and confirm the bottleneck course is the one placed on time while the terminal
  course is the one deferred — not the reverse.

---

## Story 4 — Schedule-collision bottleneck-floor diagnostic

**As a** UFSC student relying on the generated plan's semester count, **I want** the
generator to detect when two structurally-central bottleneck courses can't be scheduled in
the same semester because their only offered sections collide in time, and tell me that this
raises my true minimum number of semesters, **so that** I don't mistake an artificially
short-looking plan for the real fastest path, and understand *why* it isn't shorter.

Priority: **P0** — the maintainer's central insight for this sprint; depends on Stories 1–3
(needs the corrected candidate pool, real conflict graph, and bottleneck weights to identify
which collisions actually matter).

Acceptance criteria:
- [ ] The engine detects, for any semester where two or more courses tie (or nearly tie) for
  highest bottleneck weight (per Story 3) but their only turno-eligible sections collide
  (per `sectionsConflict`), that this collision forces at least one of them to a later
  semester than the prereq-graph-height computation alone would suggest — and records this
  as a distinct diagnostic, separate from the existing per-course "conflict" unplaceable
  reason.
- [ ] SI case (ground truth): with a night-only run and no other constraints, the engine
  identifies that `INE5614` (Engenharia de Software, opens the Projetos chain) and
  `INE5607` (Organização e Arquitetura, opens the SO→Redes chain) have their unique night
  sections colliding on Wed 18:30, and surfaces a diagnostic equivalent to "these two
  bottlenecks collide → the true minimum-semester floor is +1 versus a naive prereq-height
  estimate" — not just a silent one-semester slip with no explanation.
- [ ] The diagnostic identifies both courses by ID/name, states which one was deferred and
  by how many semesters, and is attached to the `PlanScenario` result (new field(s) on
  `GeneratorResult`/`PlanScenario` — exact shape left to `architect`/engineering) so the
  existing `plan-generator-modal.tsx` preview can render it; this story does not require the
  UI to render it yet if UI work doesn't fit the sprint, but the data must be present and
  correct on the result object (verified via a direct call to the generator, not just the
  modal).
- [ ] Regression guard: a semester with no bottleneck collision (the common case) produces
  no diagnostic entries — this is a targeted detector, not a blanket "here's every conflict"
  dump that would drown the signal.
- [ ] Manual test (SI case): generate a night-only plan for a fresh SI student and confirm
  the `INE5614`/`INE5607` collision is present in the result's diagnostics with the correct
  courses, day/time, and semester delta, cross-checked against the maintainer's own manual
  analysis of the live schedule data.

---

## Story 5 — Remind the student that Atividades Complementares + optativas aren't in the schedule

**As a** UFSC student reading a generated plan, **I want** a clear note that the 360h of
Atividades Complementares and my optativa credit requirement are graduation requirements the
generator does not schedule, **so that** I don't mistake "plan complete" for "nothing else
needed to graduate."

Priority: **P2** — small, independent, high value-per-effort; do not let it block the P0
scheduler work.

Acceptance criteria:
- [ ] The generated-plan preview (or the result data it renders from) includes a visible
  note stating that Atividades Complementares (already excluded from placement since Sprint
  02) and optativas/electives (still out of scheduling scope) are separate graduation
  requirements not represented in the semester-by-semester output.
- [ ] The note appears whenever a scenario is generated for a curriculum that models
  Atividades Complementares as a graduation requirement (SI's `INE5673`–`INE5677` and CC's
  `INE7011` both qualify) — not hardcoded to SI only.
- [ ] Regression guard: this story adds a disclaimer only — it does not change which courses
  are placed, excluded, or reported unplaceable (no behavior change to Sprint 02's exclusion
  logic).
- [ ] Manual test: generate a plan for the SI curriculum and confirm the note is visible
  without needing to open a separate help panel or hover state.

---

## Out of scope for Sprint 03 (explicitly deferred)

- **Optativas / electives scheduling and the 288h optativa credit accounting.** Still
  `type === "optional"` excluded from placement, exactly as today. Story 5 only adds a
  *reminder* that this requirement exists — it adds zero scheduling logic for electives.
  Full elective scheduling (which optativa, how many, credit-accounting toward the 288h) is
  a future sprint.
- **Daytime-exception simulation** (modeling a student who can occasionally take a
  daytime/afternoon section to relieve a night bottleneck). This sprint's capacity model
  covers night-only runs; mixed-turno slot accounting and "what if I take one daytime
  course" simulation are future work.
- **AND-of-OR prerequisite data model changes.** The existing equivalence-map-based
  AND-of-OR handling (verified on `INE5687`) is left as-is. Arbitrary non-equivalence OR
  prerequisite groups are not modeled this sprint, pending a CAGR cross-check the maintainer
  has flagged as a prerequisite to that work.
- **Curriculum-data changes/re-ingestion.** No changes to how curricula are scraped, parsed,
  or stored; Sprint 03 is generator-logic only, working against the existing `238_20111`
  data as ground truth.
- **UI/visual redesign of the plan-generator modal.** Story 4's diagnostic must be present
  on the result data; rendering it richly in `plan-generator-modal.tsx` (beyond a minimal
  surface) is fair game if time allows but is not a blocking acceptance criterion.
- **Generalizing slot-capacity accounting to arbitrary/mixed turno combinations.** Story 2's
  slot model is verified for night-only; a morning-only or mixed-turno slot ceiling follows
  the same shape but is not independently re-verified this sprint (ties to the
  daytime-exception deferral above).

---

## Notes for `architect` / engineering (context only, not prescriptive)

- Ground truth already verified by the maintainer against live prod data — do not
  re-investigate: SI program `238_20111` (91 courses, 9 phases); `INE5614` (Eng. de
  Software) and `INE5607` (Org. e Arquitetura) have unique night sections colliding Wed
  18:30; `INE5638` "Introdução a Projetos" is Saturday-morning-only and mandatory.
- Existing primitives to reuse, not duplicate: `lib/schedule-conflict.ts`
  (`expandToCells`, `sectionsConflict`, `sectionInTurno`, `stripNeutralDays`,
  `SATURDAY_DAY`); `lib/prerequisites.ts` (`computeBlocksCounts`, `checkPrerequisites`);
  `lib/plan-generator/candidates.ts` (`buildRemainingCandidates`,
  `isNonDisciplineRequirement`); the precedence graph (`buildPrecedenceGraph`,
  `memoLongest`) already in `lib/plan-generator/generate.ts` is the natural base for
  Story 3's weighted-depth metric rather than a from-scratch graph walk.
- Story 2's packer redesign replaces `runGreedy`'s current one-course-at-a-time
  `placeSingle` loop (lib/plan-generator/generate.ts:347-359) for the slot-constrained case;
  the `SemState.cells`/`SemState.credits` bookkeeping and `pickSection` section-choice logic
  can likely be reused underneath a new per-semester batch-selection step.
- Story 4's diagnostic is the one genuinely new concept this sprint — there's no existing
  code path that reasons about "two courses' sections structurally can't coexist" as
  opposed to "this one course's section conflicts with what's already been placed." Budget
  real design time here; it's the maintainer's stated central insight for the sprint and the
  most likely story to need an `architect` pass before implementation starts.
- `TIMETABLE_CONFIG.TIME_SLOTS` (`styles/course-theme.ts`) confirms the night grid: 18:30 /
  19:20 / 20:20 / 21:10 cell rows, i.e. two "aula dupla" start times (18:30, 20:20) per
  weekday, matching the maintainer's 10-slots/week model exactly.
