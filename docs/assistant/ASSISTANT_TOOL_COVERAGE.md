# Assistant tool coverage

The authenticated capability endpoint currently publishes 40 tools. The registry in `src/assistant/toolRegistry.ts` is authoritative.

| Area | Read/verify | Write | Status |
| --- | --- | --- | --- |
| Live context | selection, scene, filtered objects, exact object | none | available |
| View/camera | current view | focus exact modules from semantic direction | available |
| Selection | current selection | single, multiple, clear | available; grouped multi-selection is exact within one kitchen edit layer |
| Kitchen/worktop | validate intent, summary/counts/overlaps | create straight/L/U, context update, scoped material apply | available for semantic kitchen workflow |
| Modules | schema, presets, catalog search/list | patch parameters, apply preset, replace, insert | available |
| Materials | tenant material search | apply across kitchen scopes | available |
| Cross-project material | related project list, read-only usage inspection | apply to current kitchen | available without loading old project |
| Transform/history | resulting object transform | move, rotate, duplicate, delete, undo, redo | available for supported selection |
| Project | metadata, related list, material inspection | save | available for open-project workflow |
| Walls/floors/columns/sections | scene/query/object | create | create available; complete property editing still missing |
| Pricing/BOM | current calculated summary | none | read available |
| Openings | scene/query/object | none | create/edit not exposed |
| Measures/dimensions | indirect scene state | none | semantic authoring not exposed |
| Align/trim/extend | indirect scene state | none | stable semantic references not exposed |
| Custom furniture/wardrobe | scene/query/object | shared delete only | dedicated drawing/part editing not exposed |
| Render/export | none | none | job/result contract not exposed |
| Tenant/admin/catalog mutation | tenant availability is discoverable | none | intentionally not exposed |

## Published tool groups

Read/verify:

- `context.getSelection`, `context.getScene`, `context.getCurrentView`, `context.queryObjects`, `context.getObject`
- `project.getMetadata`, `project.listRelated`, `project.inspectMaterialUsage`
- `module.getParameterSchema`, `module.listPresets`
- `catalog.searchModules`, `catalog.searchMaterials`, `catalog.listModules`
- `kitchen.validateCreate`, `kitchen.getSummary`
- `pricing.getSummary`, `validation.inspectProject`

Write:

- `view.focusObjects`
- `selection.set`, `selection.setMany`, `selection.clear`
- `kitchen.create`, `kitchen.updateParameters`, `kitchen.applyMaterial`
- `module.patchSelectedParams`, `module.applyPreset`, `module.replace`
- `editor.moveSelection`, `editor.rotateSelection`, `editor.duplicateSelection`, `editor.deleteSelection`
- `history.undo`, `history.redo`
- `wall.create`, `floor.create`, `column.create`, `section.create`
- `catalog.insertModule`, `vendorCatalog.insertResolvedModule`
- `project.save`

## Deliberate limits

- `kitchen.create` currently accepts lower and upper run/corner modules. Tall/appliance-zone placement remains on the existing individual catalog insertion workflow until it has the same transactional run contract.
- Photo-based kitchen creation requires confirmed scale and complete run dimensions.
- Cross-project inspection is read-only and never restores another save.
- Project create/import/delete/version restore are not assistant tools.
- Raw geometry, raw transforms and direct AppState writes are never assistant capabilities.

Every new write tool requires schema validation, tenant/permission rules, rollback or explicit irreversibility, verification tools, focused regression coverage and project roundtrip coverage when persisted state changes.
