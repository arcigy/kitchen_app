# Arcigy AI orchestrator knowledge

Machine source of truth: authenticated `GET /api/assistant/capabilities`, knowledge version `assistant-capabilities.v3`.

## Primary design rule

The model works with semantic JSON. It never writes Three.js geometry, raw mesh data, object matrices, worktop polygons or exact cabinet transforms.

The model may say:

```json
{
  "name": "Kitchen A",
  "layout": {
    "shape": "U",
    "originMm": { "x": 0, "z": 0 },
    "orientationDeg": 0,
    "runsMm": [2400, 3200, 2400],
    "turns": ["right", "right"]
  },
  "modules": [
    {
      "modulePackageId": "drawer_low_v1",
      "zone": "lower",
      "runIndex": 0,
      "anchor": "auto"
    }
  ]
}
```

The application deterministically derives:

- worktop path points;
- corner rotations and reserved corner arms;
- lower and upper installation heights;
- package defaults and real module geometry;
- module width from built geometry;
- the first valid free interval on a run;
- placement bindings, back anchors and run orientation;
- overlap validation, rollback, history and persistence.

If one requested module cannot fit, `kitchen.create` rolls back the complete command. Partial kitchens are not a valid result.

## Five-stage turn

1. Communicator/classifier returns `answer`, `workflow` or `clarify`. Anything requiring at least one tool is `workflow`.
2. Orchestrator receives the goal, success criteria and tool metadata only. It composes atomic calls but cannot execute them.
3. Executor is deterministic application code. It validates JSON schema, tenant access, confirmation and owner-system constraints.
4. Analyzer receives the original goal, results keyed by `callId`, fresh live context and read/verify tools. It can complete, request evidence, repair or replan.
5. Communicator describes only executed and independently verified results.

The executor is not a model. Models never mutate AppState or Three.js directly.

## OpenAI model routing

| Role | Default | Reasoning | Purpose |
| --- | --- | --- | --- |
| Communicator/classifier | `gpt-5.4-nano` | low | cheap intent classification and final Slovak response |
| Orchestrator | `gpt-5.4-mini` | medium | balanced workflow composition from atomic JSON tools |
| Executor | no model | none | deterministic tool validation and execution |
| Analyzer | `gpt-5.4-nano` | medium | cheap independent evidence review and narrow repair |
| Escalation replan | `gpt-5.4-mini` | high | only after repeated failed plans or complex ambiguity |

Routine reads for module count, current view, current selection and project validity are routed deterministically before any model call. This prevents invented status text and makes the cheapest common questions model-free.

## User-facing response contract

- Intermediate model text is never added to the conversation.
- The UI may show one local activity indicator while a verified tool call is running.
- Final answers use safe CommonMark Markdown: short outcome heading, exact evidence and unresolved items when present.
- Raw HTML, internal tool IDs, prompts, model roles and chain-of-thought are not rendered.
- A sentence such as “počítam”, “kontrolujem” or “vykonávam” is invalid unless the same response contains the real tool call that performs that work.

Use the OpenAI Responses API, strict structured outputs and `store: false`. Environment overrides remain:

- `OPENAI_ASSISTANT_COMMUNICATOR_MODEL`
- `OPENAI_ASSISTANT_ORCHESTRATOR_MODEL`
- `OPENAI_ASSISTANT_ANALYZER_MODEL`
- `OPENAI_ASSISTANT_ESCALATION_MODEL`

## Tool metadata contract

Every item in `orchestratorToolMetadata` contains:

- `id`, `title`, `description`;
- `ownerSystem`, `operation`, `domain`;
- exact `effect`, `preconditions`, `postconditions`;
- `inputSchema`, `outputSchema`;
- `riskLevel`, `requiresConfirmation`, `reversible`;
- `verificationTools`, `tags`.

The orchestrator never receives executor source code, server secrets or arbitrary application access.

## General planning rules

1. Use narrow GET tools before broad scene reads.
2. Never invent an ID, material, package, preset, parameter key or dimension.
3. A write result is not proof. Follow every write with at least one listed verification tool.
4. Never repeat a successful write. Repair only `failedStepIds`.
5. Values returned by an earlier call must be used in a later iteration; do not emit placeholders.
6. `high` risk tools require UI confirmation and `confirmed: true`.
7. Never place `clientId` in tool input. Tenant comes from the authenticated session.
8. If an operation has no registered tool, report the missing capability. Never bypass the registry.
9. Dimensions are millimetres. AI does not convert them into raw 3D transforms.
10. When a photo has no trustworthy real scale, ask for dimensions. Shape can be inferred; millimetres cannot.

## Semantic kitchen tools

### `kitchen.validateCreate`

Read/verify. Accepts the same input as `kitchen.create` and mutates nothing.

Required layout rules:

- `straight`: one `runsMm`, zero `turns`;
- `L`: two `runsMm`, one turn;
- `U`: three `runsMm`, two turns;
- every run is 300–30000 mm;
- `orientationDeg` is 0, 90, 180 or 270;
- photo source requires `source.scaleConfirmed: true`;
- each module has `modulePackageId`, `zone` and exactly one valid `runIndex` or `cornerIndex`.

Returns the deterministic path, normalized context, module count and active placement rules.

### `kitchen.create`

High-risk transactional write. Use only after `kitchen.validateCreate` succeeds and the user confirms.

Important module fields:

- `zone`: `lower` or `upper`;
- straight placement: `runIndex` plus `anchor` (`auto`, `start`, `center`, `end`) or `offsetAlongMm`;
- corner placement: `cornerIndex` and a package that declares itself as a corner module;
- `gapMm`: minimum requested free gap;
- `parameterOverrides`: minimal package-specific override only.

The app creates the group and worktop, places corner modules first, reads their reserved arms, then fills straight modules into collision-free intervals. The whole command is undoable.

Mandatory verification:

1. `kitchen.getSummary({groupId})`;
2. `validation.inspectProject({})`;
3. `pricing.getSummary({})` when BOM or price matters;
4. `project.save({})` only after validation is valid.

### `kitchen.getSummary`

Returns:

- total/lower/upper/tall/worktop counts;
- material IDs per kitchen scope;
- lower and upper run lengths, reservations and placed module intervals;
- exact overlap pairs and overlap millimetres;
- unbound module IDs;
- deterministic `validation.valid`.

This is the analyzer's primary kitchen evidence.

### `kitchen.updateParameters`

Changes editable kitchen context only. Derived `moduleDepthMm` and `moduleHeightMm` are forbidden inputs and are recalculated by the app.

The app rebuilds affected modules/worktops, reapplies bindings and commits one history snapshot.

### `catalog.searchMaterials` and `kitchen.applyMaterial`

Always search first. Pass the returned exact `materialId` to:

```json
{
  "groupId": "kg1",
  "materialId": "mat.exact.id",
  "scopes": ["corpus", "fronts", "backs", "drawerBottoms", "worktop"]
}
```

Only requested scopes change. Material sync rebuilds module visual, BOM and pricing inputs.

## Common workflows

### Create a kitchen from text

1. `catalog.searchModules` for every requested module class.
2. `catalog.searchMaterials` if exact materials were named.
3. `kitchen.validateCreate` with compact semantic JSON.
4. Ask for confirmation.
5. `kitchen.create` with identical validated JSON and `confirmed: true`.
6. `kitchen.getSummary` and `validation.inspectProject`.
7. Repair only invalid runs/modules.
8. `pricing.getSummary`, then `project.save` if requested.

### Create a kitchen from a photo

1. Communicator vision extracts only visible facts: likely shape, appliance/module classes and relative order.
2. If exact scale or any run length is missing, return `clarify` and ask for measurements.
3. Convert confirmed measurements into the same semantic kitchen JSON used for text.
4. Continue with the normal validation/create workflow.

Never estimate construction millimetres from perspective alone.

### Apply H15554 to all corpuses

1. `catalog.searchMaterials({query:"H15554"})`.
2. If one exact active result exists, call `kitchen.applyMaterial` with `scopes:["corpus"]`.
3. Verify with `kitchen.getSummary` and `pricing.getSummary`.

### Copy H7788 from a previous customer project

1. `project.listRelated({sameContactOnly:true})`.
2. Choose the intended non-current project by metadata; clarify if ambiguous.
3. `project.inspectMaterialUsage({projectId,query:"H7788"})`.
4. Match the returned ID against current `catalog.searchMaterials({ids:[...]})`.
5. Call `kitchen.applyMaterial` for the requested current-kitchen scopes.
6. Verify the current kitchen. Inspection must never load or restore the old project.

### Replace a module

1. `context.getObject` and `module.getParameterSchema` for the current module.
2. `catalog.searchModules` for the replacement.
3. `module.replace` with the exact package ID, optional `preserveDimensions` and minimal overrides.
4. The replacement must have the same lower/upper/tall role.
5. Verify `context.getObject`, `kitchen.getSummary` and pricing.

### Change a preset

1. `module.listPresets({instanceId})`.
2. Use only a returned `parameterKey` and option `value`.
3. `module.applyPreset`.
4. Verify the module and pricing.

### Select modules and show an exact 3D view

Use `view.focusObjects` directly:

```json
{
  "instanceIds": ["m1", "m2"],
  "perspective": "front",
  "padding": 1.2
}
```

The selection controller creates the exact multi-selection and view navigation derives camera position from real bounds. Grouped modules in one multi-selection must be from the same kitchen edit layer (`lower`, `upper`, or `tall`); split cross-layer requests into separate focus steps. The model never supplies camera coordinates.

### Count modules

If a kitchen is known, prefer `kitchen.getSummary`. For arbitrary filters, use `context.queryObjects` and its `total` field.

### Move or swap modules

- For exact relative movement, select then call `editor.moveSelection`; the transform owner applies collision and kitchen binding rules.
- For run gap edits, use kitchen/module semantic tools when published; do not manufacture an absolute transform.
- A swap is complete only when both resulting module IDs and placements are independently verified.

## Analyzer contract

Analyzer modes:

- `complete`: every success criterion has independent evidence;
- `verify`: one or more read-only checks are missing;
- `repair`: a specific failed step has a narrow repair;
- `replan`: plan assumptions are wrong;
- `failed`: the goal cannot be completed with registered tools.

For kitchen creation, `complete` requires at minimum:

- `kitchen.getSummary.validation.valid === true`;
- expected counts match;
- no unexpected unbound module;
- no overlap above tolerance;
- requested materials match exact IDs;
- project validation is valid;
- save revision advanced when saving was requested.

Maximum default server iterations: 5. Maximum client round trips: 8. Escalate the model only after a concrete repeated planning failure, not for routine geometry that belongs to deterministic code.

## Final communicator output

State separately:

1. what was actually changed;
2. what evidence proved it;
3. what was saved;
4. any unresolved ambiguity or rejected item.

Never say “done” from a plan or write response alone.
