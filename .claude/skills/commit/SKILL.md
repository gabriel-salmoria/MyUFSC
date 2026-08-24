---
name: commit
description: >
  Commit workflow for the MyUFSC repository. Use whenever the user asks to commit, stage,
  or land changes. Enforces the open-source rule that nothing is committed to `main`:
  always work on a feature branch, write a Conventional Commit, and open a pull request.
  Invoke when the user says "commit", "commit this", "make a PR", or similar.
---

# Commit workflow (MyUFSC)

**Golden rule: never commit to `main`.** This is an open-source project — every change
lands on a feature branch and merges via a pull request. Only stage/commit/push when the
user has asked for it.

## Steps

1. **Inspect.** Run `git status` and `git diff` (and `git diff --staged`). Understand what
   changed and group changes into one or more logical commits — never blindly `git add -A`
   a mixed working tree.

2. **Ensure a feature branch.** Run `git branch --show-current`.
   - If on `main` (or `master`): create and switch to a new branch **before committing**:
     `git checkout -b <type>/<short-slug>` (e.g. `feat/professor-directory`,
     `fix/timetable-conflict`). Pick `<type>` from the commit type; keep the slug short and
     kebab-case.
   - If already on a feature branch: continue on it.
   - Never move work onto `main` and never merge to `main` locally.

3. **Stage** the intended files (`git add <paths>`), one logical group at a time.

4. **Compose the message** using the **`commit-conventions`** skill (load it): imperative
   `<type>(<scope>): <subject>` (≤72 chars), an optional body explaining *why*, and issue
   refs (`Closes #NN`) when relevant. End the commit with the trailer:

   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```

   Prefer a HEREDOC so the body and trailer format cleanly:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <subject>

   <optional body>

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Finish → PR** (when the user wants to publish):
   - `git push -u origin <branch>`
   - Open the PR into `main` with the repo template:
     `gh pr create --base main --fill` (or provide `--title`/`--body`). The body should
     follow `.github/pull_request_template.md` — summary, linked issue, checklist.
   - Report the PR URL back to the user.

## Guardrails

- **Never** `git push --force` / `--force-with-lease` to a shared branch, and never to `main`.
- **Never** run destructive history rewrites (`reset --hard`, `rebase`, `filter-branch`)
  unless the user explicitly asks and understands the consequence.
- If pre-commit hooks or lint fail, fix the issue or report it — do not `--no-verify`.
- Keep secrets out: verify `.env*` and other gitignored files aren't staged.
