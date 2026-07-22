# Sprint 02 — Decisions

## Gate 1 (2026-07-21) — approved to build

- **Defect 2 approach:** *Remove the sequence-group machinery entirely* (maintainer's
  choice, architect's recommendation). Natural prerequisite edges + curriculum-phase
  anchoring already place the project chain (Planejamento/Gestão de Projetos → Projeto
  Integrador I → II) in the earliest feasible, prereq-ordered phases. The Sprint-01
  `SEQUENCE_GROUP_MATCHERS` matched no real UFSC course name and its `placeGroup`-fails →
  `continue` path silently dropped mandatory courses. Deleting it is strictly less code,
  removes the silent-drop hazard, and aligns with "formar mais rápido". The "consecutive
  phases" guarantee is dropped — it was never a real UFSC rule and could delay graduation.

- **Defect 1 approach:** exclude non-discipline requirements at the candidate source
  (`buildRemainingCandidates`) via an exported `isNonDisciplineRequirement` predicate using
  a normalized-name match on `"atividades complementares"`. Rejected the "no sections /
  phase null" heuristic — `parseCourses` collapses `phase null → 0`, making it lossy.

- **Optativas:** already correctly excluded (`type: optional`); this sprint only adds a
  regression guard, no new code.

- **Tests:** Node built-in `node:test` + `node:assert/strict` run via the existing `tsx`
  devDependency. No Vitest/Jest for two pure functions.
