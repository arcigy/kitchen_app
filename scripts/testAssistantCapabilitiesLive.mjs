import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await installAuthSession(page);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) {
      consoleErrors.push({ text: message.text(), locationUrl: message.location().url ?? "" });
    }
  });
  page.on("pageerror", (error) => consoleErrors.push({ text: error.message, locationUrl: "pageerror" }));

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__kitchenDebug && !!window.__arcigyAssistant, null, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".viewer-startup"), null, { timeout: 30000 });

    const result = await page.evaluate(async () => {
      const debug = window.__kitchenDebug;
      const assistant = window.__arcigyAssistant;
      if (!debug || !assistant) throw new Error("Assistant or debug bridge is missing.");

      const capabilityResponse = await fetch("/api/assistant/capabilities", { credentials: "include" });
      const capabilities = await capabilityResponse.json();
      const scenario = debug.createKitchenScenario({ addModule: true, offsetAlongMm: 700 });
      const moduleId = scenario.instances[0]?.id;
      if (!moduleId) throw new Error("Live assistant fixture has no module.");

      const baselineWall = await assistant.executeToolCall({
        id: "baseline_wall",
        toolId: "wall.create",
        input: { aMm: { x: 0, z: 5000 }, bMm: { x: 3000, z: 5000 }, thicknessMm: 150 }
      });
      const sceneBefore = await assistant.executeToolCall({ id: "scene_before", toolId: "context.getScene", input: {} });
      const currentView = await assistant.executeToolCall({ id: "current_view", toolId: "context.getCurrentView", input: {} });
      const query = await assistant.executeToolCall({ id: "query_module", toolId: "context.queryObjects", input: { kinds: ["module"], ids: [moduleId] } });
      const exactObject = await assistant.executeToolCall({ id: "exact_module", toolId: "context.getObject", input: { kind: "module", id: moduleId } });
      const projectMetadata = await assistant.executeToolCall({ id: "project_metadata", toolId: "project.getMetadata", input: {} });
      const parameterSchema = await assistant.executeToolCall({ id: "parameter_schema", toolId: "module.getParameterSchema", input: { instanceId: moduleId } });
      const catalogSearch = await assistant.executeToolCall({ id: "catalog_search", toolId: "catalog.searchModules", input: { moduleType: "drawer_low", limit: 10 } });
      const upperCatalogSearch = await assistant.executeToolCall({ id: "upper_catalog_search", toolId: "catalog.searchModules", input: { moduleType: "fwm_catalog_wall_cabinet", limit: 10 } });
      const materialSearch = await assistant.executeToolCall({ id: "material_search", toolId: "catalog.searchMaterials", input: { boardFamily: "body", limit: 10 } });
      const projectValidation = await assistant.executeToolCall({ id: "project_validation", toolId: "validation.inspectProject", input: {} });
      const selected = await assistant.executeToolCall({ id: "select", toolId: "selection.set", input: { kind: "module", id: moduleId } });
      const moveX = await assistant.executeToolCall({ id: "move_x", toolId: "editor.moveSelection", input: { dxMm: 100, dzMm: 0 } });
      const move = moveX.ok
        ? moveX
        : await assistant.executeToolCall({ id: "move_z", toolId: "editor.moveSelection", input: { dxMm: 0, dzMm: 100 } });
      const sceneMoved = await assistant.executeToolCall({ id: "scene_moved", toolId: "context.getScene", input: {} });
      const undo = await assistant.executeToolCall({ id: "undo", toolId: "history.undo", input: {} });
      const sceneUndone = await assistant.executeToolCall({ id: "scene_undone", toolId: "context.getScene", input: {} });
      const patch = await assistant.executeToolCall({ id: "patch", toolId: "module.patchSelectedParams", input: { instanceIds: [moduleId], patch: { widthMm: 800 } } });
      const pricing = await assistant.executeToolCall({ id: "pricing", toolId: "pricing.getSummary", input: {} });
      const selectedForDelete = await assistant.executeToolCall({ id: "select_delete", toolId: "selection.set", input: { kind: "module", id: moduleId } });
      const deniedDelete = await assistant.executeToolCall({ id: "delete_denied", toolId: "editor.deleteSelection", input: {} });
      const allowedDelete = await assistant.executeToolCall({ id: "delete_allowed", toolId: "editor.deleteSelection", input: {}, confirmed: true });
      const undoDelete = await assistant.executeToolCall({ id: "undo_delete", toolId: "history.undo", input: {} });
      const wall = await assistant.executeToolCall({
        id: "wall",
        toolId: "wall.create",
        input: { aMm: { x: 0, z: 6000 }, bMm: { x: 3000, z: 6000 }, thicknessMm: 150 }
      });
      const lowerPackageId = catalogSearch.output?.modules?.[0]?.modulePackageId;
      const upperPackageId = upperCatalogSearch.output?.modules?.[0]?.modulePackageId;
      const materialId = materialSearch.output?.materials?.[0]?.id;
      if (!lowerPackageId || !upperPackageId || !materialId) {
        throw new Error("Live tenant catalog lacks a lower module, upper module or body material for semantic kitchen QA.");
      }
      const kitchenInput = {
        name: "Assistant semantic L kitchen",
        source: { kind: "text" },
        layout: {
          shape: "L",
          runsMm: [3000, 2400],
          turns: ["left"],
          originMm: { x: 0, z: 9000 },
          orientationDeg: 0
        },
        modules: [
          { modulePackageId: lowerPackageId, zone: "lower", runIndex: 0, anchor: "start" },
          { modulePackageId: lowerPackageId, zone: "lower", runIndex: 1, anchor: "start" },
          { modulePackageId: upperPackageId, zone: "upper", runIndex: 0, anchor: "end" }
        ]
      };
      const photoWithoutScale = await assistant.executeToolCall({
        id: "photo_without_scale",
        toolId: "kitchen.validateCreate",
        input: { ...kitchenInput, source: { kind: "photo", scaleConfirmed: false } }
      });
      const kitchenValidation = await assistant.executeToolCall({ id: "kitchen_validate", toolId: "kitchen.validateCreate", input: kitchenInput });
      const kitchenDenied = await assistant.executeToolCall({ id: "kitchen_denied", toolId: "kitchen.create", input: kitchenInput });
      const kitchenCreate = await assistant.executeToolCall({ id: "kitchen_create", toolId: "kitchen.create", input: kitchenInput, confirmed: true });
      const kitchenSummary = kitchenCreate.ok
        ? await assistant.executeToolCall({ id: "kitchen_summary", toolId: "kitchen.getSummary", input: { groupId: kitchenCreate.output.groupId } })
        : null;
      const materialApply = kitchenCreate.ok
        ? await assistant.executeToolCall({ id: "kitchen_material", toolId: "kitchen.applyMaterial", input: { groupId: kitchenCreate.output.groupId, materialId, scopes: ["corpus"] } })
        : null;
      const kitchenSummaryAfterMaterial = kitchenCreate.ok
        ? await assistant.executeToolCall({ id: "kitchen_summary_after_material", toolId: "kitchen.getSummary", input: { groupId: kitchenCreate.output.groupId } })
        : null;
      const focus = kitchenCreate.ok
        ? await assistant.executeToolCall({ id: "focus_created", toolId: "view.focusObjects", input: { instanceIds: kitchenCreate.output.instanceIds.slice(0, 2), perspective: "isometric", padding: 1.2 } })
        : null;
      const focusedSelection = await assistant.executeToolCall({ id: "focused_selection", toolId: "context.getSelection", input: {} });

      return {
        capabilities,
        toolIds: assistant.getToolDefinitions().map((tool) => tool.id),
        moduleId,
        baselineWall,
        sceneBefore,
        currentView,
        query,
        exactObject,
        projectMetadata,
        parameterSchema,
        catalogSearch,
        upperCatalogSearch,
        materialSearch,
        projectValidation,
        selected,
        moveX,
        move,
        sceneMoved,
        undo,
        sceneUndone,
        patch,
        pricing,
        selectedForDelete,
        deniedDelete,
        allowedDelete,
        undoDelete,
        wall,
        photoWithoutScale,
        kitchenValidation,
        kitchenDenied,
        kitchenCreate,
        kitchenSummary,
        materialApply,
        kitchenSummaryAfterMaterial,
        focus,
        focusedSelection,
        materialId
      };
    });

    const moduleFrom = (toolResult) => toolResult.output?.modules?.find((item) => item.id === result.moduleId);
    const before = moduleFrom(result.sceneBefore);
    const moved = moduleFrom(result.sceneMoved);
    const undone = moduleFrom(result.sceneUndone);
    assert(result.capabilities.ok && result.capabilities.knowledgeVersion === "assistant-capabilities.v3", "Capability endpoint failed.", result.capabilities);
    assert(result.toolIds.length === 40 && result.toolIds.includes("kitchen.create") && result.toolIds.includes("project.inspectMaterialUsage"), "Expected assistant tools are missing.", result.toolIds);
    assert(result.currentView.ok && result.currentView.callId === "current_view", "Current-view GET failed.", result.currentView);
    assert(result.query.ok && result.query.output?.total === 1, "Filtered object GET failed.", result.query);
    assert(result.exactObject.ok && result.exactObject.output?.id === result.moduleId, "Exact object GET failed.", result.exactObject);
    assert(result.projectMetadata.ok, "Project metadata GET failed.", result.projectMetadata);
    assert(result.parameterSchema.ok && result.parameterSchema.output?.parameters?.length > 0, "Module schema GET failed.", result.parameterSchema);
    assert(result.catalogSearch.ok && result.catalogSearch.output?.modules?.length > 0, "Catalog search GET failed.", result.catalogSearch);
    assert(result.upperCatalogSearch.ok && result.upperCatalogSearch.output?.modules?.length > 0, "Upper-module catalog search failed.", result.upperCatalogSearch);
    assert(result.materialSearch.ok && result.materialSearch.output?.materials?.length > 0, "Material catalog search failed.", result.materialSearch);
    assert(result.projectValidation.ok && typeof result.projectValidation.output?.valid === "boolean", "Independent project validation failed.", result.projectValidation);
    assert(result.baselineWall.ok, "History baseline wall creation failed.", result.baselineWall);
    assert(result.selected.ok && result.move.ok, "Selection or move failed.", { selected: result.selected, move: result.move });
    assert(before && moved && undone, "Module snapshots are missing.", { before, moved, undone });
    assert(moved.positionMm.x !== before.positionMm.x || moved.positionMm.z !== before.positionMm.z, "Move did not change the module transform.", { before, moved });
    assert(undone.positionMm.x === before.positionMm.x && undone.positionMm.z === before.positionMm.z, "Undo did not restore the module transform.", { before, undone });
    assert(result.patch.ok, "Module patch failed.", result.patch);
    assert(result.pricing.ok && typeof result.pricing.output?.quote?.finalPrice === "number", "Pricing summary failed.", result.pricing);
    assert(!result.deniedDelete.ok && result.deniedDelete.error?.includes("requires explicit user confirmation"), "Delete confirmation gate failed closed.", result.deniedDelete);
    assert(result.selectedForDelete.ok && result.allowedDelete.ok && result.undoDelete.ok, "Confirmed delete or its undo failed.", {
      selection: result.selectedForDelete,
      delete: result.allowedDelete,
      undo: result.undoDelete
    });
    assert(result.wall.ok, "Wall creation failed.", result.wall);
    assert(!result.photoWithoutScale.ok && result.photoWithoutScale.error?.includes("confirmed real-world dimensions"), "Unscaled photo was not rejected.", result.photoWithoutScale);
    assert(result.kitchenValidation.ok && result.kitchenValidation.output?.valid === true && result.kitchenValidation.output?.path?.length === 3, "Semantic L-kitchen validation failed.", result.kitchenValidation);
    assert(!result.kitchenDenied.ok && result.kitchenDenied.error?.includes("requires explicit user confirmation"), "Kitchen confirmation gate failed closed.", result.kitchenDenied);
    assert(result.kitchenCreate.ok && result.kitchenCreate.output?.instanceIds?.length === 3, "Semantic kitchen creation failed.", result.kitchenCreate);
    assert(result.kitchenSummary?.ok && result.kitchenSummary.output?.counts?.lower === 2 && result.kitchenSummary.output?.counts?.upper === 1, "Created kitchen counts are wrong.", result.kitchenSummary);
    assert(result.kitchenSummary?.output?.validation?.valid === true && result.kitchenSummary.output.validation.overlaps.length === 0, "Created kitchen has invalid placement or overlap.", result.kitchenSummary);
    assert(result.materialApply?.ok && result.kitchenSummaryAfterMaterial?.output?.materials?.corpus === result.materialId, "Kitchen-wide corpus material was not applied.", { materialApply: result.materialApply, summary: result.kitchenSummaryAfterMaterial });
    assert(result.focus?.ok && result.focusedSelection?.output?.selectedInstanceIds?.length === 2, "Semantic 3D focus or exact multi-selection failed.", { focus: result.focus, selection: result.focusedSelection });
    const unexpectedConsoleErrors = consoleErrors.filter((item) => !(
      item.text.includes("403 (Forbidden)") && item.locationUrl.includes("/api/client-metrics")
    ));
    assert(unexpectedConsoleErrors.length === 0, "Browser console contains unexpected errors.", unexpectedConsoleErrors);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      toolCount: result.toolIds.length,
      ignoredKnownTelemetry403: consoleErrors.length - unexpectedConsoleErrors.length,
      checks: ["capability-endpoint", "tool-discovery", "scene-context", "current-view", "filtered-object-query", "exact-object", "project-metadata", "module-parameter-schema", "catalog-search", "material-search", "independent-validation", "selection", "move", "undo", "module-patch", "pricing", "confirmation-denial", "confirmed-delete", "delete-undo", "wall-create", "unscaled-photo-rejection", "semantic-L-validation", "semantic-kitchen-confirmation", "semantic-kitchen-create", "lower-upper-counts", "zero-overlap", "kitchen-material-apply", "semantic-view-focus", "unexpected-console-errors"]
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  if (error?.context) console.error(JSON.stringify(error.context, null, 2));
  process.exitCode = 1;
});
