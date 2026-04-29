# Source Tree Rules

Scope: `src/`.

- Keep domain code in the smallest correct owner folder.
- Do not move behavior between domains just to reduce file count.
- Keep shared types shared only when more than one domain truly needs them.
- If behavior touches layout state, history, or placement, check `src/layout/` first.
- If behavior touches app workflow, tools, selections, tabs, or pointer/keyboard flow, check `src/app/` first.
- If behavior touches DOM panel rendering, form rows, or reusable UI widgets, check `src/ui/` first.
- If behavior touches cabinet geometry or params, check `src/modules/`, `src/model/`, and `src/geometry/`.
