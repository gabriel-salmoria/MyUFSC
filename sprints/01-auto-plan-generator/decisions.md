# Sprint 01 — Maintainer decisions (supersede backlog out-of-scope where they conflict)

Resolved with the maintainer after the product-owner grooming. These **override** the
backlog's "out of scope" list where they differ.

## 1. Electives (optativas) are IN scope
The generator must also propose **possible electives** that fit the available time slots,
not just mandatory courses. It needs to reuse the existing pool-based elective model
(`optionalPools` in `CurriculumVisualizer`/`GridVisualizer`) and the offered electives from
the MatrUFSC schedule data. Electives are the primary source of "different possibilities."

## 2. Full reorganization + MULTIPLE scenarios (key change)
The generator MAY reorganize everything (not just fill gaps). More importantly, it should
produce **several candidate plans (scenarios)** and present them in a **modal** where the
student picks the one they like best (e.g. different elective mixes, different turno
trade-offs, different pacing). This replaces the earlier "one preview" assumption.

## 3. Per-course credit cap (varies by course)
Confirmed by research: UFSC's max credits/semester varies by course/curriculum/turno
(~25–33; e.g. Arquitetura 33, Eng. Civil 30–31, Direito 28 / 32 for formandos, Ciências
Sociais 25, Ed. Física 25), under Resolução 17/CUn/97 but set per coordination.
- **v1:** a **configurable cap** the student can adjust before generating, with a sensible
  default (~28 credits). Authoritative per-degree caps are a **future data-enrichment**
  task (would require per-coordination sources) — do NOT block v1 on scraping them.
- Persist the last-used cap if cheap; otherwise default each run.

## 4. Assume most-recent offering repeats + disclaimer
For future semesters beyond scraped MatrUFSC data, assume the most recent offering repeats
(same sections/times) so conflict detection stays meaningful. **Show a disclaimer** in the
UI. Note: **mandatory** offerings are assumed stable; **electives are the ones whose
offering changes per semester**, so elective placement in far-future semesters is the most
uncertain part and the disclaimer should call that out.

## 5. UI entry point
Left to `design`. Likely a button on `ProgressVisualizer` ("Meu Progresso") that opens the
generator (filters: turno toggles + credit cap) → scenario-selection modal → apply.

## Ask the architect to phase it
This is now a large feature. The architect should propose a **phased** plan so Sprint 01
stays shippable — e.g. a core engine first (mandatory + conflict + turno filter + single
plan + preview/apply), then multi-scenario, then electives, then per-degree cap enrichment
— and state clearly what fits in this sprint vs. follow-ups.
