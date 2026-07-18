---
description: Execute the current sprint — dispatch engineers to implement the planned tasks on a feature branch, each as a Conventional Commit.
argument-hint: "[optional sprint folder, defaults to the latest under sprints/]"
---

# /sprint-run

Execute the planned sprint for **MyUFSC**. Sprint: **$ARGUMENTS** (default: the latest
`sprints/<n>-<slug>/`). Requires a `plan.md` from `/sprint-plan`.

## Steps

1. **Load the plan.** Read `sprints/<n>-<slug>/plan.md`, `backlog.md`, and `status.md`.
   Confirm the task list (TaskList). If there's no plan, tell the user to run
   `/sprint-plan` first.

2. **Create the sprint branch.** Never work on `main`. From up-to-date `main`:
   `git checkout -b sprint/<n>-<slug>` (or continue on it if it already exists).

3. **Dispatch via the `scrum-master`.** Hand the task list to the **`scrum-master`** agent,
   which dispatches each task to its owning agent (`frontend-engineer`,
   `backend-engineer`, `design`) in dependency order, parallelizing independent tasks and
   serializing tasks that touch the same files.

4. **Commit per unit of work.** Each completed task is committed with the **`commit`** skill
   — a Conventional Commit on the sprint branch, with the co-author trailer. Do **not**
   open the PR yet (that's `/sprint-review`).

5. **Keep status current.** Update `sprints/<n>-<slug>/status.md` and the task list as
   tasks complete. Note any blockers or scope changes and surface them.

6. **Report.** Summarize what was implemented, the commit log
   (`git log --oneline main..HEAD`), and anything left for review.

## Guardrails

- Stay within the agreed backlog; park new ideas as backlog items rather than expanding scope.
- Run `pnpm run lint` as you go; keep the branch buildable.
- Do not merge to `main` and do not push force.
