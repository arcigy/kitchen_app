# Kitchen App Agent Rules

Scope: whole repository.

## Git Safety

- Before any GitHub, push, pull, merge, branch, PR, or release operation, read and follow `docs/git-github-codex-workflow.md`.
- Do not create or switch branches unless the user explicitly asks.
- Never push directly to `main` unless the user explicitly approves a tested release.
- Keep refactor commits small and reversible.
- Do not stage or commit `dist/` build output during refactor work.
- Never commit secrets, `.env` values, API keys, tokens, or private customer data.

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
