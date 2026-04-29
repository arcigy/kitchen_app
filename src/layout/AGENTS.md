# Layout Domain Rules

Scope: `src/layout/`.

- This folder owns app state, history, placement, kitchen context, and layout persistence behavior.
- Preserve JSON-friendly layout data and customer-specific kitchen context.
- Do not force build-time validation of runtime-only secrets or external config.
- Keep history changes deterministic and reversible.
- Do not put DOM rendering or topbar behavior in this folder.
- If placement changes, run UI regression and kitchen context live tests.
