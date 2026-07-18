---
description: Review the current sprint — verify acceptance criteria, run lint/build/code-review, then open a PR into main.
argument-hint: "[optional sprint folder, defaults to the latest under sprints/]"
---

# /sprint-review

Review and ship the current sprint for **MyUFSC**. Sprint: **$ARGUMENTS** (default: latest
`sprints/<n>-<slug>/`). Assumes `/sprint-run` produced commits on `sprint/<n>-<slug>`.

## Steps

1. **Load context.** Read `sprints/<n>-<slug>/backlog.md` (acceptance criteria) and
   `plan.md`. Get the diff: `git log --oneline main..HEAD` and `git diff main...HEAD`.

2. **Automated checks.**
   - `pnpm run lint`
   - `pnpm run build`
   - Run the **`code-review`** skill on the branch diff (correctness + simplification).
   - Run the **`verify`** skill to exercise the changed flow end-to-end where there's a
     runtime surface.

3. **Acceptance check.** Go story by story through `backlog.md`; mark each acceptance
   criterion pass/fail with evidence (file/line or observed behavior). List any gaps.

4. **Fix or report.** For small issues found, dispatch the owning engineer agent to fix
   them (committed via the **`commit`** skill on the same branch). For larger gaps, record
   them and decide with the maintainer whether they block the PR.

5. **Open the PR.** Once checks pass and acceptance criteria are met, push and open the PR
   **into `main`** using the template:
   `git push -u origin sprint/<n>-<slug>` then
   `gh pr create --base main --fill` (body follows `.github/pull_request_template.md`;
   include "Closes #NN" for any addressed issues). **Never merge locally** — the maintainer
   merges the PR.

6. **Report.** Write the review summary to `sprints/<n>-<slug>/review.md` and give the
   maintainer the PR URL.

## Guardrails

- Don't open the PR if lint/build fail or acceptance criteria aren't met — report instead.
- Don't self-merge or push to `main`.
