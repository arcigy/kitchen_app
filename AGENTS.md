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

## Required Checks

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
