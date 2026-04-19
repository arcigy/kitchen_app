# Kitchen App — Architecture

## Stack

TypeScript + Three.js + Vite. No UI framework. DOM API for UI.

## Current src/ structure

src/
├── core/ # Scene, camera, rendering, disposal, export
├── data/ # Materials and hardware definitions
├── geometry/ # Module geometry builder dispatcher
├── layout/ # Kitchen layout state, wall solver, app state
├── materials/ # PBR material definitions, UV grain
├── model/ # Cabinet module types (god-file)
├── modules/ # Parametric cabinet modules (drawerLow, etc.)
│ ├── [module]/
│ │ ├── geometry.ts
│ │ ├── controls.ts
│ │ └── types.ts
│ └── \_registry.ts # Central export of all module builders & controls
├── rendering/ # SSGI pipeline, photo path tracer
├── ui/ # UI panels (layout, part, topbar, underlay)
└── walls2d/ # 2D wall solver, snapping

## Folder ownership

- src/modules/ → Andrej (Build mode, parametric cabinet modules)
- src/layout/ → Branislav (production layout, wall drawing, placement)
- src/core/ → shared scene/camera/renderer — coordinate before changing
- src/walls2d/ → Branislav (2D wall solver — do not touch during module work)
- server/ → Blender render pipeline — completely separate from frontend

## Module folder convention

Every cabinet module lives in src/modules/[name]/ with exactly:

- geometry.ts — Three.js mesh construction + parameters
- controls.ts — UI controls panel for this module
- types.ts — TypeScript types for this module only

## Adding a new module

1. Create src/modules/[name]/ with the 3 files above
2. Register in src/modules/\_registry.ts
3. Do NOT touch main.ts or app.ts

## Shared types rule

Only types used by 3 or more modules go in src/types/shared.ts
Module-specific types stay in the module folder.

## God-file warning

src/model/cabinetTypes.ts contains all module types — do not split
this file until explicitly instructed. Import from it as usual.

## AI token rule

Always read ARCHITECTURE.md first before reading any other file.
Only read files directly relevant to the current task.

## AI collaboration rules (two developers)

DEVELOPER OWNERSHIP:

- Andrej owns: src/modules/, src/geometry/buildModule.ts
- Branislav owns: src/layout/, src/walls2d/, src/core/, src/ui/

BEFORE making any change, identify which developer owns the affected files.

IF the task touches ONLY one developer's files � proceed.

IF the task touches src/model/cabinetTypes.ts OR src/modules/\_registry.ts:
� State explicitly: This file is shared. I am modifying: [list exact changes]`n� Then proceed.

IF the task touches files owned by BOTH developers:
� Stop and ask: This change affects both Andrej's and Branislav's files. Should I split this into two separate tasks?`n
NEVER modify these without being explicitly asked:

- src/model/cabinetTypes.ts (god-file � high risk)
- src/geometry/buildModule.ts (dispatcher � affects all modules)
- src/main.ts
