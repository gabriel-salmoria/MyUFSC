# Sprint 02 — Review

Branch `sprint/02-plan-generator-mandatory-only`, 3 commits off `bcd4009`.

## Checks

| Check | Result |
|---|---|
| `pnpm run build` (incl. `tsc --noEmit` type-check) | ✅ clean — proves no dangling refs after deletion |
| `pnpm run test` (9 tests) | ✅ 9/9 pass |
| `pnpm run lint` | ⚠️ **broken repo-wide, pre-existing** — `next lint` was removed in Next 16 and no ESLint is configured. NOT caused by this sprint. `tsc --noEmit` used as the static gate. |
| Manual diff review | ✅ matches plan; grep confirms no dangling `placeGroup`/`group`/`ignoreGroup`/`byId` refs |

## Diff scope
```
candidates.ts       +29   (normalizeCourseName moved in + isNonDisciplineRequirement + filter)
candidates.test.ts  +100  (new)
generate.ts        -115   (sequence-group machinery deleted; loop simplified)
generate.test.ts    +200  (new)
package.json         +1   (test script)
```

## Acceptance criteria

- **Story 1 — exclude Atividades Complementares:** ✅ `isNonDisciplineRequirement` (name-match
  "atividades complementares") wired into `buildRemainingCandidates`. Tests cover both prod
  variants (`INE7011`, `DEC7003`), accent/case, and that a normal mandatory course is kept.
- **Story 1 regression — optativas stay excluded:** ✅ still gated by `type === "mandatory"`.
- **Story 2 — project courses never silently dropped:** ✅ sequence-group machinery deleted;
  every course goes through `placeSingle` → placed or `unplaceable`. Regression test: both
  "Projetos I" and "Projeto Integrador I" get placed via the normal path. Prereq-linked
  chain test confirms consecutive in-order placement without the special case.
- **Story 3 — completeness invariant:** ✅ test asserts `{placed} ∪ {unplaceable}` equals
  exactly the remaining schedulable mandatory disciplines, pseudo-course in neither bucket.

## Deferred to backlog (not this sprint)
- **Fix `pnpm run lint`** — repo-wide breakage from the Next 16 upgrade (add ESLint flat
  config or repoint the script). Unrelated to the generator; belongs in its own ticket.
