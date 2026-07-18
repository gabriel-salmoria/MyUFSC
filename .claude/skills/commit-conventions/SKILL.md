---
name: commit-conventions
description: >
  Conventional Commits reference for the MyUFSC repository — the exact commit types,
  scope vocabulary, subject rules, and message format this project uses. Load this
  whenever writing a commit message, reviewing one, or configuring changelog/release
  tooling. Read before composing any commit in this repo.
---

# Commit conventions (MyUFSC)

This repo follows **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)**.
A commit message is:

```
<type>(<scope>)?<!>?: <subject>

<body?>

<footer?>
```

- `type` and `subject` are required; `scope` and `!` are optional.
- One logical change per commit. If a diff mixes a feature and an unrelated refactor, split it.

## Types

| Type | Use for |
|---|---|
| `feat` | A new user-facing feature or capability |
| `fix` | A bug fix |
| `docs` | Documentation only (README, `docs/*.md`, `CLAUDE.md`, comments) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | A change that improves performance |
| `style` | Formatting/whitespace/UI-styling only, no behavior change |
| `test` | Adding or fixing tests |
| `chore` | Tooling, config, deps, meta — no src behavior change |
| `ci` | CI/workflow changes (`.github/workflows/**`) |
| `build` | Build system or external build deps |

## Scopes

Optional but encouraged. Draw the scope from the subsystem being touched (see the
directory map in `CLAUDE.md`). Common scopes in this repo:

`schedule` · `timetable` · `curriculum` · `professors` · `reviews` · `transcript` ·
`crypto` · `auth` · `db` · `store` · `dnd` (drag-and-drop) · `scrapers` · `pipeline` ·
`ui` · `deps` · `claude` (Claude Code config under `.claude/`).

Use the most specific scope that fits; omit it if a change is genuinely cross-cutting.

## Subject rules

- **Imperative mood**, lowercase start: "add", "fix", "remove" — not "added"/"adds".
- **≤ 72 characters**, no trailing period.
- Describe the *what*, not the *how*. Save detail for the body.

## Body (optional)

- Blank line after the subject.
- Explain *why* and any non-obvious *what*. Wrap ~72 cols.
- Reference issues: `Closes #123`, `Refs #45`.

## Breaking changes

Either append `!` after the type/scope (`feat(db)!: ...`) **and/or** add a footer:

```
BREAKING CHANGE: describe what breaks and the migration path.
```

## Co-author trailer

Commits made with Claude Code end with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## Examples (rewritten from real repo history)

```
fix(professors): keep list focus across selection changes
```
```
feat(dnd): make schedule visualizers draggable
```
```
fix(timetable): restore visualizer to original size on collapse
```
```
refactor(store): dedupe course-status logic shared with GridVisualizer
```
```
docs(claude): move repo reference from skill into CLAUDE.md
```
```
feat(reviews)!: paginate professor reviews

BREAKING CHANGE: /api/professors/[id]/details now returns a `page` cursor
instead of the full review array.
```
