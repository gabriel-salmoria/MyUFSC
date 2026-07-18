# Contributing to MyUFSC

Thanks for wanting to help! 🎉 MyUFSC is an open-source (GPL-3.0) semester planner for UFSC
students. This guide covers how to get set up and how we work.

## Code of Conduct

By participating you agree to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md). Be kind.

## Local setup

We use **[pnpm](https://pnpm.io/)** and **Node.js** (see `package.json` `packageManager`
for the pinned version).

```bash
# 1. Fork & clone
git clone https://github.com/<you>/MyUFSC.git
cd MyUFSC

# 2. Install
pnpm install

# 3. Run the dev server
pnpm run dev
```

That's it for a basic run. The dev database is an **in-process PGlite** DB that
**auto-seeds** from production on first boot — no Postgres server, no URL, no `.env`
required. It persists to `.dev-db/` (gitignored).

Only if you need Neon/Postgres or the Gemini AI pipeline, copy `.env.example` and fill in
the relevant values, and set the provider in `myufsc.config.local.json` (gitignored):

```json
{ "database": { "provider": "local" } }
```

Useful scripts:

| Command | What it does |
|---|---|
| `pnpm run dev` | Start the Next.js dev server (PGlite) |
| `pnpm run lint` | Lint |
| `pnpm run build` | Production build (must pass before a PR) |

## How we work

### 1. Never commit to `main`

`main` is protected and only advances through merged pull requests. **All work happens on a
feature branch.**

```bash
git checkout -b <type>/<short-slug>   # e.g. feat/professor-directory, fix/timetable-conflict
```

`<type>` matches the commit type below; keep the slug short and kebab-case.

### 2. Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `style`, `test`, `chore`, `ci`, `build`.
Common scopes: `schedule`, `timetable`, `curriculum`, `professors`, `reviews`, `transcript`,
`crypto`, `auth`, `db`, `store`, `dnd`, `scrapers`, `pipeline`, `ui`, `deps`.

Subject: imperative, lowercase, ≤72 chars, no trailing period. Examples:

```
feat(professors): add professor directory page
fix(timetable): correct pairwise conflict detection off-by-one
docs: document the loading-hook waterfall
```

### 3. Open a pull request

1. Push your branch: `git push -u origin <branch>`
2. Open a PR **into `main`** and fill out the template.
3. Make sure `pnpm run lint` and `pnpm run build` pass.
4. Link the issue you're addressing (`Closes #123`).
5. A maintainer reviews and merges — please don't merge your own PR.

## Where to look

- **`CLAUDE.md`** — condensed map of the whole codebase (stack, directory map, data flow,
  DB schema, crypto, known tech debt). Start here.
- **`docs/*.md`** — deep narrative docs, one per subsystem.
- **`TODO.md`** — current roadmap items.
- Good first issues: the "known tech debt" section of `CLAUDE.md` and
  `docs/architecture.md` list concrete, well-scoped cleanups.

## Questions

Open an issue or a GitHub Discussion. Thanks for contributing! 💚
