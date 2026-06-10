# Project Save/Load Contract

This document is mandatory for future changes that add or change project state.

## Goal

Project save, load, download, and import must remain a durable product contract.

A project is considered safe only when this sequence works:

```text
create project
edit every supported entity
save
download .fqp
import .fqp
load imported project
edit imported project
save again
load again
compare state
```

## Mandatory Rule

If a feature creates state that the user expects to keep, it must be covered by all of these:

- serializer
- restore path
- validation path
- roundtrip test assertion
- import/download compatibility

Do not treat UI visibility as proof that save/load works.

## Required Scripts

Run these before considering save/load-sensitive work done:

```bash
npm run typecheck
npm run build
npm run test:project-save-load
npm run test:project-roundtrip-full
npm run test:ui-regression
```

`npm test` should also be run. If it fails because of known unrelated fixtures/timeouts, record the exact failures in the final notes.

## Main Guards

### `test:project-save-load`

Fast project stability flow. It covers:

- normal save
- normal load
- recent activity restore
- wall, floor, column, section, worktop, module restore
- door/window wall cutouts
- view switching after load
- editing a loaded project

### `test:project-roundtrip-full`

Full contract flow. It covers:

- creating a full project fixture
- saving app state
- downloading encrypted `.fqp`
- importing `.fqp` as a copy
- loading the imported project in the UI
- preserving entity parameters and relationships
- preserving door/window wall cutouts
- editing the imported project
- saving and reloading the edited import

This is the gate to run when adding modules, project persistence, database storage, import/export, layout entities, kitchen groups, pricing/BOM snapshots, or restore logic.

## Adding A New Layout Entity

When adding an entity such as a new object type, annotation, opening, view, or tool output:

1. Add it to the project app state serializer.
2. Add restore logic.
3. Add validation in project save validation if it references another entity.
4. Add it to `scripts/testProjectRoundtripFull.mjs`.
5. Assert exact count and stable parameters after import/load.
6. Assert it can still be edited after load when relevant.

If the entity references another entity, validate that the referenced ID exists.

Examples:

- opening references wall
- module references worktop
- worktop references kitchen group
- kitchen group references module instances
- material/component IDs reference catalog snapshot data where relevant

## Adding A New Module

Every new module must have a roundtrip scenario:

1. Create the module in the project fixture.
2. Change at least one important parameter.
3. Save.
4. Download/import.
5. Load.
6. Compare parameters, placement, kitchen group, and BOM-relevant values.
7. Edit the loaded module and save/load again if the module has custom rebuild behavior.

Do not rely only on module geometry tests. Module geometry can be correct while project persistence is broken.

## Bugfix Rule

Every save/load bug must leave a permanent regression check.

Examples:

- If loaded doors stop cutting walls, add an assertion for wall cutouts after load.
- If loaded walls disappear after drawing another wall, add an edit-after-load assertion.
- If recent activity is missing after load, assert it in the project flow.
- If imported projects overwrite existing projects, assert import creates a copy.

## Database Rule

Database-backed saves and file-backed saves must use the same project service contract.

The `.fqp` file must be a complete portable project package:

- app state
- project metadata
- phase data
- catalog snapshot
- module package snapshots
- bundled upload assets
- recent activity
- import metadata when imported as a copy

Importing a `.fqp` into the same client when the source project already exists must create a new copy. It must not overwrite the original project.

## Validation Rule

Save validation must fail loudly for broken relationships.

Do not allow a save to silently store invalid state. If invalid state can be detected, reject it before writing.

Minimum validations:

- unique IDs per entity collection
- openings reference existing walls
- openings fit inside their wall length
- modules/instances keep matching IDs when both are present
- kitchen groups reference existing instances
- worktops reference existing kitchen groups
- module placements reference existing worktops

## Review Checklist

Before finishing a feature, answer these:

- What new state did this feature create?
- Where is it serialized?
- Where is it restored?
- What happens when it is imported from `.fqp`?
- What validation rejects broken references?
- Which test asserts it after save/load?
- Which test asserts it after download/import/load?
- Can it still be edited after being loaded?

If any answer is unclear, the feature is not complete.
