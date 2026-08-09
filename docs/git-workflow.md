# Git workflow

This repository uses a protected `develop` workflow. The objective is simple:
every completed, verified feature becomes available for founder testing on the
online `develop` environment without risking `main` or another active task.

## Branches and responsibilities

| Branch | Purpose | Who tests it |
| --- | --- | --- |
| `main` | Production only. Never receive a direct push. | Founder approves a release after online `develop` QA. |
| `develop` | Shared, CI-verified integration branch. | Founder tests finished work online here. |
| `feature/*`, `fix/*` | One isolated implementation task. | Codex implements, tests, commits, pushes and opens a PR. |
| `release/*` | Optional stabilization-only release preparation. | Founder approves promotion to `main`. |

An active Codex chat should normally display its own `feature/*` or `fix/*`
branch. That is intentional. A Git branch cannot safely be checked out as
`develop` in every concurrent worktree; the online test target is always the
single shared `develop` branch.

## Autonomous feature delivery

When the founder asks Codex to implement a feature or correction, this whole
flow is automatic. The founder does **not** need to separately ask for commit,
push, PR, merge, or deploy to `develop`.

1. Inspect `git status`, fetch `origin`, and start one branch from current
   `origin/develop`.
2. Implement the smallest compatible scope and add focused regression tests.
3. Run required checks: at least `npm run typecheck`, `npm test`, and
   `npm run build`; also run UI/browser checks when the change affects UI or
   editor behavior.
4. Re-check the diff and ensure it has no generated `dist/`, secrets,
   customer data, or unrelated worktree changes.
5. Commit the scoped change, push its branch, and open a PR to `develop`.
6. Wait for required CI. If CI is green and no review blocker exists, merge the
   PR through GitHub into `develop`.
7. Fast-forward the canonical `develop` checkout and report the exact online
   test scenario to the founder.

If `develop` changed while the task was open, Codex first integrates current
`origin/develop`, resolves conflicts deliberately, and repeats the affected
checks before opening or merging the PR.

## CI speed without lowering release safety

Every PR waits for the required `fast-verify` job: dependency installation,
secret scan, typecheck, lint, full unit suite, production build, dependency
policy, and CodeQL. The slower restore drill and full browser/UI regression
run automatically after every `develop` update, nightly, before a release, or
on a PR labelled `full-regression`.

Codex must add that label before merging a PR which changes editor interaction,
project save/load or import/export, authentication, tenant access, pricing,
database/storage, deployment, or another recovery-critical path. It can be
requested manually for any PR. This keeps ordinary changes fast while ensuring
that high-risk changes still have the full gate before merge.

## Founder test loop

After a PR is merged, the founder tests the online `develop` environment and
responds with one of:

- `Otestované, funguje.` The feature remains in `develop`.
- `Na develope nefunguje: [repro, expected, actual].` Codex opens a new
  `fix/*` branch and repeats the autonomous delivery flow.
- `Develop je ako celok otestovaný. Priprav release do main.` Codex prepares a
  release PR; `main` is changed only after explicit founder approval.

## Worktree safety

- One active task per worktree and one scoped branch per task.
- Before any branch switch, inspect `git status`.
- Preserve unfinished work with a WIP commit on its own branch or a named
  stash. Never use `reset --hard`, `clean -fd`, or a forced checkout to switch
  contexts.
- Never merge untested WIP branches merely to make a branch label say
  `develop`.

## Never do this

- Push directly to `main` or `develop`.
- Force-push a shared branch.
- Merge failing CI, bypass a review blocker, or mix unrelated work in one PR.
- Commit `.env`, API keys, tokens, customer projects, exports, or generated
  `dist/` output.
- Promote `develop` to `main` without the founder's explicit online approval.
