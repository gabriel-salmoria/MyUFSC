---
description: Run a full sprint cycle — plan → run → review — with maintainer approval gates between phases.
argument-hint: "[sprint focus or theme]"
---

# /sprint-cycle

Run a complete sprint for **MyUFSC** end to end: **plan → build → review**. Theme:
**$ARGUMENTS**. This chains `/sprint-plan`, `/sprint-run`, and `/sprint-review` with human
gates so the maintainer stays in control.

## Flow

1. **Plan** — perform the `/sprint-plan` steps (product-owner → architect → scrum-master),
   producing `backlog.md`, `plan.md`, and the task list under `sprints/<n>-<slug>/`.

   **⛔ GATE 1 — approval to build.** Present the sprint goal, stories, and task list.
   Wait for the maintainer's go-ahead. If they want changes, revise the plan and re-present.

2. **Run** — perform the `/sprint-run` steps: create `sprint/<n>-<slug>`, dispatch the
   engineers via the scrum-master, and commit each task as a Conventional Commit. Keep
   `status.md` current.

3. **Review** — perform the `/sprint-review` steps: lint, build, `code-review`, `verify`,
   and the acceptance-criteria check. Fix small issues in place.

   **⛔ GATE 2 — approval to open the PR.** Present the review summary (checks + acceptance
   results + commit log). Only after the maintainer approves, push and
   `gh pr create --base main` with the template. Never merge locally.

4. **Wrap up.** Report the PR URL and note anything deferred to the next sprint's backlog.

## Guardrails

- Honor both gates — never build without Gate 1, never open the PR without Gate 2.
- Everything stays on a feature branch; `main` only advances via the merged PR.
- Keep scope to the approved backlog.
