# Kitchen App Agent Rules

Scope: whole repository.

## Git Safety

- Before any GitHub, push, pull, merge, branch, PR, or release operation, read and follow `docs/git-github-codex-workflow.md`.
- When the user asks to implement a scoped feature or fix, creating and switching to one dedicated feature/fix branch from current `origin/develop` is already authorized. Do not create or switch unrelated branches.
- Never push directly to `main` unless the user explicitly approves a tested release.
- For a completed Kitchen App change whose required automated checks pass, automatically publish its branch through a PR to `develop`; the founder tests the result online on `develop`.
- Never push directly to `develop`; use the protected PR workflow and merge only after its required checks pass.
- Keep refactor commits small and reversible.
- Do not stage or commit `dist/` build output during refactor work.
- Never commit secrets, `.env` values, API keys, tokens, or private customer data.

### Founder delivery override

The founder explicitly wants every verified, scoped change visible remotely.
After the relevant tests pass, Codex must autonomously complete the full
feature/fix delivery flow without waiting for separate messages such as
"commit it", "push it", or "merge it":

1. fetch `origin/develop` and integrate it into the scoped branch if needed;
2. re-run the checks affected by that integration;
3. commit only the reviewed scope, never `dist/`, secrets, or customer data;
4. push the feature/fix branch and open a PR to `develop`;
5. wait for required CI; if it is green and there are no unresolved review
   blockers, merge the PR through the protected PR workflow into `develop`;
6. update the canonical `develop` checkout and report the online `develop`
   test path to the founder.

The founder tests completed work online on `develop`. A feature/fix branch is
therefore the expected active-chat branch; do not try to force every worktree
or chat onto `develop`. Never push directly to `main` or `develop`, never
include unrelated dirty files, and never commit secrets or customer data.

Only these steps still require explicit founder approval: a production/main
release, live customer-data mutation or migration, destructive cleanup, and
any unresolved CI or review exception.

## Product Rules

- Preserve existing kitchen layout, pricing, BOM, export, render, and module behavior.
- Do not redesign the product as a generic marketplace or generic automation template.
- Customer-specific workflows and module differences are allowed and should not be flattened away.

## Architecture Rules

- `src/app.ts` is the composition layer only.
- Do not add feature logic directly to `src/app.ts`.
- Put behavior into focused controllers/helpers under the owning folder.
- Prefer explicit typed context objects for controllers.
- Do not use `any` or broad dependency bags when a smaller typed dependency is possible.
- Before adding a feature, identify the owning system, search for existing similar behavior, and extend the existing owner instead of creating a parallel custom implementation.
- If a feature touches editor behavior, selection, delete, move/drag, align, trim/extend, dimensions, temporary dimensions, undo/redo, shortcuts, topbars, or editor modes, read and follow `docs/universal-editor-contract.md` first.
- Do not change runtime behavior during a refactor unless the task explicitly asks for that behavior change and the old behavior is covered by characterization tests.
- Record meaningful refactor or feature slices in `MANUAL_TEST_LOG.csv` with a non-programmer manual test path.

## Required Checks

- Every implemented feature, fix, or user-reported behavior correction needs a focused regression test that protects the working behavior.

Run after structural or UI changes:

```bash
npm run typecheck
npm test
npm run build
npm run test:ui-regression
```

For UI-affecting changes, also load the app in the browser and confirm current console errors are zero.

See also:

- `docs/AI_DEVELOPMENT_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/release-checklist.md`

## graphify

This project has a local knowledge graph at `graphify-out/`.

When the user types `$graphify`, use the installed Graphify skill before any other codebase exploration.

Rules:
- For every codebase or architecture question, first run `graphify query "<question>" --budget 1200`. When the question names a relationship, add `--context <relation>` to keep the returned subgraph minimal. Use `graphify explain "<symbol>"` for a named concept and `graphify path "<A>" "<B>"` for a dependency path.
- Only after the narrow Graphify result identifies source paths or symbols may you search or read those exact relevant files. Do not broad-grep or enumerate the repository first.
- Never manually read, print, parse, or attach the full `graphify-out/graph.json` or the full `graphify-out/GRAPH_REPORT.md`. The Graphify CLI may access its graph internally; agents must use `query`, `explain`, or `path` output instead.
- If the graph result is stale or insufficient, run `graphify update .` and repeat the narrow query. Do not fall back to a full graph/report read.
- `graphify-out/` is generated local state. Its uncommitted changes are expected and must not be treated as product-code changes.
- After modifying code, run `graphify update .` to keep the code graph current (AST-only, no API cost).
