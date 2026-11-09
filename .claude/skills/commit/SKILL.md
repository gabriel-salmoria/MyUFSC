---
name: commit
description: >
  Commit workflow for the MyUFSC repository. Use whenever the user asks to commit, stage,
  or land changes. Commits go straight to `main` (sole maintainer) as Conventional
  Commits; branches/PRs only when explicitly asked. Invoke when the user says "commit",
  "commit this", "push", or similar.
---

# Commit workflow (MyUFSC)

**Commit directly to `main`.** The maintainer is the only regular dev and works on `main`
— don't create a feature branch or open a PR unless the user asks for one. Only
stage/commit/push when the user has asked for it.

## Steps

1. **Inspect.** Run `git status` and `git diff` (and `git diff --staged`). Understand what
   changed and group changes into one or more logical commits — never blindly `git add -A`
   a mixed working tree.

2. **Stay on the current branch.** Normally that's `main` — commit there. If the user asked
   for a branch, use `git checkout -b <type>/<short-slug>` (e.g. `fix/timetable-conflict`).

3. **Stage** the intended files (`git add <paths>`), one logical group at a time.

4. **Compose the message** using the **`commit-conventions`** skill (load it): imperative
   `<type>(<scope>): <subject>` (≤72 chars), an optional body explaining *why*, and issue
   refs (`Closes #NN`) when relevant. End the commit with the trailer:

   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```

   Prefer a HEREDOC so the body and trailer format cleanly:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <subject>

   <optional body>

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Push** (when the user wants to publish): `git push` to `main`. Only open a PR
   (`gh pr create --base main --fill`, following `.github/pull_request_template.md`) if the
   user explicitly asks for one.

## Guardrails

- **Never** `git push --force` / `--force-with-lease` to `main`.
- **Never** run destructive history rewrites (`reset --hard`, `rebase`, `filter-branch`)
  unless the user explicitly asks and understands the consequence.
- If pre-commit hooks or lint fail, fix the issue or report it — do not `--no-verify`.
- Keep secrets out: verify `.env*` and other gitignored files aren't staged.
