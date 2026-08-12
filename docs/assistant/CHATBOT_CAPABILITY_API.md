# Arcigy chatbot capability API

Authoritative discovery endpoint:

```http
GET /api/assistant/capabilities
Cookie: <authenticated session>
```

It returns the exact role-authorized tool definitions, orchestrator metadata, capability boundaries, capability packs, tenant package availability and model routing. The machine registry is authoritative; documentation examples never override JSON schemas.

The planner receives only the smallest matching capability packs plus live-context verification tools. An unmatched request may use the full registered set, but every workflow remains bounded to 12 steps and five server iterations.

## Runtime flow

1. `POST /api/assistant/turn` classifies the message and creates a workflow.
2. The browser executes only registered calls through `window.__arcigyAssistant.executeToolCall`.
3. Schema and server role authorization run before editor state is touched for every write tool.
4. High-risk tools require explicit UI confirmation and `confirmed: true`.
5. `POST /api/assistant/continue` returns tool results plus a fresh live context to the analyzer.
6. The assistant reports completion only after independent verification.

Tenant identity never appears in tool input. It is derived from the authenticated session. Enabled modules and materials are checked against the tenant catalog.

The agent never elevates permissions: a viewer receives read/verify capabilities only, while write tools require the authenticated role and a successful server authorization immediately before browser execution.

## Semantic kitchen call

The AI supplies layout intent, not geometry:

```ts
await window.__arcigyAssistant.executeToolCall({
  id: "create_kitchen_1",
  toolId: "kitchen.create",
  confirmed: true,
  input: {
    name: "Kitchen A",
    source: { kind: "text" },
    layout: {
      shape: "L",
      originMm: { x: 0, z: 0 },
      orientationDeg: 0,
      runsMm: [3000, 2400],
      turns: ["left"]
    },
    modules: [
      {
        modulePackageId: "drawer_low_v1",
        zone: "lower",
        runIndex: 0,
        anchor: "auto"
      }
    ]
  }
});
```

The app derives the path, module geometry, placement, rotation, height, corner reservations and collisions. A failure rolls back the complete kitchen command.

Always run the identical payload through `kitchen.validateCreate` before asking the user to confirm `kitchen.create`.

## Wall-hosted openings

Doors and windows use semantic millimetre values and a real `wallId`; the browser validates host-wall extent and collisions against every existing opening before it changes project state.

```text
opening.createDoor / opening.createWindow
  -> opening.updateDoor / opening.updateWindow
  -> opening.delete
```

Every write is confirmation-gated, rebuilds the affected wall and records one editor-history snapshot. The API intentionally does not expose associative dimensions, align, or trim/extend until those editor contracts have stable non-pointer command owners.

## Read-only cross-project material flow

```text
project.listRelated
  -> project.inspectMaterialUsage
  -> catalog.searchMaterials in the current tenant catalog
  -> kitchen.applyMaterial in the current kitchen
  -> kitchen.getSummary + pricing.getSummary
```

`project.inspectMaterialUsage` calls `ProjectActions.inspectById`; it loads the save payload for inspection but never calls restore, changes the current project, rotates the editing session or changes save revision.

## Confirmation examples

Safe automatic call:

```ts
await window.__arcigyAssistant.executeToolCall({
  id: "summary_1",
  toolId: "kitchen.getSummary",
  input: { groupId: "kg1" }
});
```

Confirmation-gated call:

```ts
await window.__arcigyAssistant.executeToolCall({
  id: "create_1",
  toolId: "kitchen.create",
  input: validatedKitchenJson,
  confirmed: true
});
```

## Sources of truth

- Registry and exact schemas: `src/assistant/toolRegistry.ts`
- Input validation: `src/assistant/toolValidation.ts`
- OpenAI orchestration: `src/assistant/orchestration.ts`
- Browser executors: `src/app/assistantBridge.ts`
- Semantic kitchen owner: `src/app/assistantKitchenController.ts`
- Semantic path/interval math: `src/assistant/kitchenSemanticLayout.ts`
- Project inspection contract: `src/app/project/projectActions.ts`
- Full orchestrator rules: `docs/assistant/ORCHESTRATOR_KNOWLEDGE.md`
- Coverage and limits: `docs/assistant/ASSISTANT_TOOL_COVERAGE.md`

After registry changes run focused assistant tests, typecheck, full tests, build, save/load roundtrip and UI regression. UI-affecting view changes also require a browser console check.
