# Sprint 04 — Decisions

## Context (verified against the maintainer's real SI case, 238_20111)
- Maintainer's remaining set = 23 mandatory (incl. INE5614 to redo). Under STRICT night-only
  the true floor is **6 future semesters**, not 5: six courses are offered ONLY Monday 18:30
  and form a mutual-exclusion clique — INE5649, INE5670, INE5614, INE5625, INE5664, INE5687
  (graph-coloring of the night conflict graph = 6). The generator currently reports floor=5
  (understated: pairwise top-K + fixed +1 misses the 6-clique) and produces 7 future (strands
  INE5649 to the tail).
- INE5631 "Projetos I" and INE5660 "Projetos II" have NO section data in the snapshot →
  placed sem turma (free).
- The maintainer's 11-semester plan is IMPOSSIBLE strictly at night; it requires moving ~1
  of the Monday-18:30 clique courses to a daytime section. Moving one breaks the clique →
  floor 5 → 11 total. This is the maintainer's own "aceitar 1 de manhã encurta um semestre".

## Gate-1 decision (2026-07-22)
- **Build the daytime-exception simulation FIRST** (maintainer choice over fixing the
  night-only floor/packing first).
- The generator runs at exception budgets B = 0 (strict night), 1, 2 and returns a COMPARISON:
  each budget's min-semester plan + which course(s) were promoted to a daytime section and
  which section. Objective stays "fewest total semesters".
- Promotion is search-driven: candidates are the contended courses (night-conflict clique /
  high conflict-degree); the search picks the ≤B promotions that minimize makespan.
- Fold in a **clique-aware floor** (graph-coloring lower bound over the night conflict graph)
  so the reported floor is honest (6) and names the Monday-18:30 bottleneck — needed anyway to
  pick promotion candidates.
- Deferred still: optativas 288h accounting; AND-of-OR data model.
