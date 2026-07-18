---
description: Plan a sprint — groom the backlog into prioritized stories with acceptance criteria and a task breakdown mapped to agents.
argument-hint: "[sprint focus or theme, e.g. 'professor directory page']"
---

# /sprint-plan

Plan the next sprint for **MyUFSC**. Focus for this sprint: **$ARGUMENTS** (if empty, pull
the highest-value items from `TODO.md` and the tech-debt lists).

## Steps

1. **Determine the sprint slug and folder.** Pick a short kebab-case slug for the theme and
   create `sprints/<n>-<slug>/` (increment `<n>` from existing folders, or start at `01`).

2. **Groom the backlog** — dispatch the **`product-owner`** agent to read `TODO.md`, the
   tech debt in `CLAUDE.md` / `docs/architecture.md` §11 /
   `docs/professor-rating-architecture-issues.md`, and any relevant `gh issue list`. It
   produces prioritized user stories with **acceptance criteria** at
   `sprints/<n>-<slug>/backlog.md`, scoped to a small, shippable sprint.

3. **Design** — dispatch the **`architect`** agent to turn the top stories into a technical
   plan: affected files, data flow, types/API/DB changes, risks, and a **task breakdown
   where each task names its owning agent** (`frontend-engineer` / `backend-engineer` /
   `design`). Output: `sprints/<n>-<slug>/plan.md`.

4. **Assemble the sprint** — dispatch the **`scrum-master`** agent to convert the plan into
   a concrete task list (via TaskCreate) with owners and dependencies, and write
   `sprints/<n>-<slug>/status.md` (initial state).

5. **Present to the maintainer** — summarize the sprint goal, the stories, and the task
   list. **Stop here for approval** — do not start building. Building happens in
   `/sprint-run`.

## Notes

- Keep the sprint small and coherent. Defer anything that doesn't fit.
- No code is written in this command — planning only.
