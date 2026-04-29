# App Controllers Rules

Scope: `src/app/`.

- This folder owns app workflow controllers and integration glue.
- New feature logic belongs in a focused controller here, not in `src/app.ts`.
- Keep each controller responsible for one workflow: selection, topbar actions, properties, view mode, transforms, drawing, snapping, export, or input handling.
- Controllers should expose a small public API and receive dependencies through explicit typed context objects.
- Use getters/setters for mutable state owned by `src/app.ts` or another controller.
- Do not import unrelated controllers just to reach state indirectly; pass the needed function or value.
- After moving logic out of `src/app.ts`, leave thin wrappers only when existing call sites need stable names.
