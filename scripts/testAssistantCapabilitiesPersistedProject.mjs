import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";
const projectName = process.env.ASSISTANT_QA_PROJECT_NAME;

function assert(condition, message, context) {
  if (condition) return;
  const error = new Error(message);
  error.context = context;
  throw error;
}

function moduleFrom(toolResult, moduleId) {
  return toolResult.output?.modules?.find((item) => item.id === moduleId) ?? null;
}

function sceneFingerprint(scene) {
  const output = scene.output ?? scene;
  return {
    projectId: output.project?.projectId ?? null,
    walls: output.walls.map((item) => ({ id: item.id, params: item.params })),
    floors: output.floors.map((item) => ({ id: item.id, params: item.params })),
    columns: output.columns.map((item) => ({ id: item.id, params: item.params })),
    sections: output.sections.map((item) => ({ id: item.id, params: item.params })),
    kitchenGroups: output.kitchenGroups.map((item) => ({ id: item.id, instanceIds: item.instanceIds })),
    worktops: output.worktops.map((item) => ({ id: item.id, kitchenGroupId: item.kitchenGroupId, params: item.params })),
    modules: output.modules.map((item) => ({
      id: item.id,
      kitchenGroupId: item.kitchenGroupId,
      kitchenPlacement: item.kitchenPlacement,
      params: item.params,
      positionMm: item.positionMm,
      rotationYDeg: item.rotationYDeg
    }))
  };
}

async function openNamedProject(page, name) {
  await page.waitForSelector("[data-project-manager-list]", { timeout: 30000 });
  const projectButton = page.locator("[data-project-manager-list] button").filter({ hasText: name });
  await projectButton.waitFor({ state: "visible", timeout: 30000 });
  const count = await projectButton.count();
  assert(count === 1, `Expected one project named ${name}, found ${count}.`);
  await projectButton.click();
  await page.waitForFunction(() => !!window.__kitchenDebug && !!window.__arcigyAssistant, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".viewer-startup"), null, { timeout: 30000 });
}

async function reopenNamedProject(page, name) {
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const saveExit = page.locator("[data-project-exit='save']");
  if (await saveExit.isVisible({ timeout: 1000 }).catch(() => false)) await saveExit.click();
  await openNamedProject(page, name);
}

async function main() {
  assert(projectName, "ASSISTANT_QA_PROJECT_NAME is required so this test never mutates an arbitrary project.");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    const locationUrl = message.location().url ?? "";
    const isExpectedScopeDenial =
      message.type() === "error" &&
      message.text().includes("403 (Forbidden)") &&
      locationUrl.includes("/api/assistant/tool-authorization");
    if (message.type() === "error" && !message.text().includes("favicon") && !isExpectedScopeDenial) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await installAuthSession(page, { autoStartWorkspace: false });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await openNamedProject(page, projectName);

    const result = await page.evaluate(async () => {
      const debug = window.__kitchenDebug;
      const assistant = window.__arcigyAssistant;
      if (!debug || !assistant) throw new Error("Assistant or debug bridge is missing.");
      const capabilitiesResponse = await fetch("/api/assistant/capabilities", { credentials: "include" });
      const capabilities = await capabilitiesResponse.json();
      const catalogResponse = await fetch("/api/catalog", { credentials: "include" });
      const catalogPayload = await catalogResponse.json();
      const catalog = catalogPayload.catalog;
      const materialId = catalog?.materials?.[0]?.id;
      if (!materialId) throw new Error("Authenticated catalog has no material for entity tests.");

      const scenario = debug.createKitchenScenario({
        path: [{ x: -1800, z: 0 }, { x: 1800, z: 0 }],
        addModule: true,
        moduleType: "drawer_low",
        offsetAlongMm: 700
      });
      const moduleId = scenario.instances[0]?.id;
      const groupId = scenario.group?.id;
      if (!moduleId || !groupId) throw new Error("Persisted assistant fixture has no module or kitchen group.");

      const call = (id, toolId, input = {}, confirmed = false) => assistant.executeToolCall({ id, toolId, input, confirmed });
      const tools = assistant.getToolDefinitions();
      const toolIds = tools.map((tool) => tool.id);
      const selectionRead = await call("selection_read", "context.getSelection");
      const sceneInitial = await call("scene_initial", "context.getScene");
      const currentView = await call("current_view", "context.getCurrentView");
      const objectQuery = await call("object_query", "context.queryObjects", { kinds: ["module"], ids: [moduleId], kitchenGroupId: groupId });
      const exactObject = await call("exact_object", "context.getObject", { kind: "module", id: moduleId });
      const projectMetadata = await call("project_metadata", "project.getMetadata");
      const parameterSchema = await call("parameter_schema", "module.getParameterSchema", { instanceId: moduleId });
      const catalogList = await call("catalog_list", "catalog.listModules");
      const catalogSearch = await call("catalog_search", "catalog.searchModules", { moduleType: "drawer_low", limit: 20 });
      const pricingInitial = await call("pricing_initial", "pricing.getSummary");
      const projectValidation = await call("project_validation", "validation.inspectProject");
      const invalidMove = await assistant.executeToolCall({ id: "invalid_move", toolId: "editor.moveSelection", input: { dxMm: 10 } });
      const unknownTool = await assistant.executeToolCall({ id: "unknown", toolId: "editor.teleport", input: {} });

      const selected = await call("select_module", "selection.set", { kind: "module", id: moduleId });
      const originalModule = sceneInitial.output.modules.find((item) => item.id === moduleId);
      const originalWidth = Number(originalModule?.params?.widthMm ?? originalModule?.params?.width ?? 600);
      const patch = await call("patch_module", "module.patchSelectedParams", {
        instanceIds: [moduleId],
        patch: { widthMm: originalWidth + 37 }
      });
      const scenePatched = await call("scene_patched", "context.getScene");

      const move = await call("move_module", "editor.moveSelection", { dxMm: 120, dzMm: 0 });
      const sceneMoved = await call("scene_moved", "context.getScene");
      const undoMove = await call("undo_move", "history.undo");
      const sceneUndoMove = await call("scene_undo_move", "context.getScene");
      const redoMove = await call("redo_move", "history.redo");
      const sceneRedoMove = await call("scene_redo_move", "context.getScene");

      const wall = await call("create_wall", "wall.create", {
        aMm: { x: -1500, z: 5000 },
        bMm: { x: 1500, z: 5000 },
        thicknessMm: 150
      });
      const floor = await call("create_floor", "floor.create", {
        name: "Assistant QA floor",
        heightMm: 0,
        thicknessMm: 80,
        materialId,
        boundary: [
          { x: -1800, z: 4200 },
          { x: 1800, z: 4200 },
          { x: 1800, z: 6200 },
          { x: -1800, z: 6200 }
        ]
      });
      const column = await call("create_column", "column.create", {
        name: "Assistant QA column",
        shape: "rectangular",
        xMm: -1200,
        zMm: 5600,
        justifyX: "center",
        justifyY: "center",
        widthMm: 240,
        depthMm: 320,
        diameterMm: 240,
        heightMm: 2600,
        materialId
      });
      const section = await call("create_section", "section.create", {
        name: "Assistant QA section",
        aMm: { x: -1400, z: 6500 },
        bMm: { x: 1400, z: 6500 },
        mirrored: false
      });

      const selectedWall = wall.ok
        ? await call("select_wall", "selection.set", { kind: "wall", id: wall.output.id })
        : { ok: false, error: "Wall was not created." };
      const rotate = selectedWall.ok
        ? await call("rotate_wall", "editor.rotateSelection", { angleDeg: 15 })
        : { ok: false, error: "Wall was not selected." };

      await call("select_for_duplicate", "selection.set", { kind: "module", id: moduleId });
      const beforeDuplicate = await call("before_duplicate", "context.getScene");
      const duplicate = await call("duplicate_module", "editor.duplicateSelection");
      const afterDuplicate = await call("after_duplicate", "context.getScene");
      const beforeIds = new Set(beforeDuplicate.output.modules.map((item) => item.id));
      const duplicateId = afterDuplicate.output.modules.find((item) => !beforeIds.has(item.id))?.id ?? null;

      const deleteTargetId = duplicateId ?? moduleId;
      const selectedForDelete = await call("select_delete", "selection.set", { kind: "module", id: deleteTargetId });
      const deniedDelete = await call("delete_denied", "editor.deleteSelection");
      const allowedDelete = await call("delete_allowed", "editor.deleteSelection", {}, true);
      const sceneDeleted = await call("scene_deleted", "context.getScene");
      const undoDelete = await call("undo_delete", "history.undo");
      const sceneDeleteUndone = await call("scene_delete_undone", "context.getScene");

      const enabledPackage = catalogList.output.find((item) => item.modulePackageId)?.modulePackageId ?? null;
      const deniedCatalogInsert = enabledPackage
        ? await call("catalog_insert_denied", "catalog.insertModule", { modulePackageId: enabledPackage, groupId })
        : { ok: false, error: "No enabled runtime package." };
      const catalogInsert = enabledPackage
        ? await call("catalog_insert", "catalog.insertModule", { modulePackageId: enabledPackage, groupId }, true)
        : { ok: false, error: "No enabled runtime package." };

      const vendorInput = {
        catalogKey: "assistant-scope-negative",
        productTemplateId: "assistant-scope-negative",
        moduleType: "drawer_low",
        modulePackageId: enabledPackage ?? "missing",
        initialParams: originalModule?.params ?? {}
      };
      const deniedVendorInsert = await call("vendor_insert_denied", "vendorCatalog.insertResolvedModule", vendorInput);
      const scopedVendorInsert = await call("vendor_insert_scoped", "vendorCatalog.insertResolvedModule", vendorInput, true);
      const vendorVariant = catalog?.vendorCatalog?.productVariants?.find((item) => !item.needsReview) ?? catalog?.vendorCatalog?.productVariants?.[0] ?? null;
      let vendorResolution = null;
      let vendorInsert = null;
      if (vendorVariant) {
        const vendorResolutionResponse = await fetch("/api/assistant/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message: `vloz PINO ${vendorVariant.catalogKey} ${vendorVariant.productTemplateName} ${vendorVariant.widthMm ?? ""} mm`,
            clientContext: assistant.getContextSnapshot(),
            conversation: []
          })
        });
        vendorResolution = { status: vendorResolutionResponse.status, body: await vendorResolutionResponse.json() };
        const resolvedCall = vendorResolution.body?.toolCalls?.find((item) => item.toolId === "vendorCatalog.insertResolvedModule") ?? null;
        if (resolvedCall) vendorInsert = await assistant.executeToolCall({ ...resolvedCall, confirmed: true });
      }

      const selectionClear = await call("selection_clear", "selection.clear");
      const pricingBeforeSave = await call("pricing_before_save", "pricing.getSummary");
      const sceneBeforeSave = await call("scene_before_save", "context.getScene");
      const save = await call("project_save", "project.save");
      const sceneAfterSave = await call("scene_after_save", "context.getScene");

      return {
        capabilitiesStatus: capabilitiesResponse.status,
        capabilities,
        toolIds,
        moduleId,
        groupId,
        materialId,
        selectionRead,
        sceneInitial,
        currentView,
        objectQuery,
        exactObject,
        projectMetadata,
        parameterSchema,
        catalogList,
        catalogSearch,
        pricingInitial,
        projectValidation,
        invalidMove,
        unknownTool,
        selected,
        originalWidth,
        patch,
        scenePatched,
        move,
        sceneMoved,
        undoMove,
        sceneUndoMove,
        redoMove,
        sceneRedoMove,
        wall,
        floor,
        column,
        section,
        selectedWall,
        rotate,
        duplicate,
        duplicateId,
        selectedForDelete,
        deniedDelete,
        allowedDelete,
        sceneDeleted,
        undoDelete,
        sceneDeleteUndone,
        enabledPackage,
        deniedCatalogInsert,
        catalogInsert,
        deniedVendorInsert,
        scopedVendorInsert,
        vendorResolution,
        vendorInsert,
        selectionClear,
        pricingBeforeSave,
        sceneBeforeSave,
        save,
        sceneAfterSave
      };
    });

    assert(result.capabilitiesStatus === 200 && result.capabilities.ok, "Authenticated capability discovery failed.", result.capabilities);
    assert(result.capabilities.knowledgeVersion === "assistant-capabilities.v3", "Unexpected capability knowledge version.", result.capabilities);
    assert(result.toolIds.length === 40 && new Set(result.toolIds).size === 40, "Tool registry is not the expected 40 unique tools.", result.toolIds);
    assert(result.selectionRead.ok && result.sceneInitial.ok && result.catalogList.ok && result.pricingInitial.ok, "Baseline read-only tools failed.");
    assert(result.currentView.ok && result.currentView.callId === "current_view", "Current-view GET failed.", result.currentView);
    assert(result.objectQuery.ok && result.objectQuery.output?.total === 1, "Filtered object GET failed.", result.objectQuery);
    assert(result.exactObject.ok && result.exactObject.output?.id === result.moduleId, "Exact object GET failed.", result.exactObject);
    assert(result.projectMetadata.ok && result.projectMetadata.output?.projectId, "Project metadata GET failed.", result.projectMetadata);
    assert(result.parameterSchema.ok && result.parameterSchema.output?.parameters?.length > 0, "Parameter-schema GET failed.", result.parameterSchema);
    assert(result.catalogSearch.ok && result.catalogSearch.output?.modules?.length > 0, "Catalog search GET failed.", result.catalogSearch);
    assert(result.projectValidation.ok && typeof result.projectValidation.output?.valid === "boolean", "Independent validation GET failed.", result.projectValidation);
    assert(!result.invalidMove.ok && result.invalidMove.error?.includes("input.dzMm is required"), "Malformed input did not fail closed.", result.invalidMove);
    assert(!result.unknownTool.ok && result.unknownTool.error?.includes("not registered"), "Unknown tool did not fail closed.", result.unknownTool);
    assert(result.selected.ok && result.patch.ok, "Module selection or parameter patch failed.", { selected: result.selected, patch: result.patch });
    const patchedModule = moduleFrom(result.scenePatched, result.moduleId);
    assert(Number(patchedModule?.params?.widthMm ?? patchedModule?.params?.width) === result.originalWidth + 37, "Patched module width is incorrect.", patchedModule);

    const movedModule = moduleFrom(result.sceneMoved, result.moduleId);
    const undoModule = moduleFrom(result.sceneUndoMove, result.moduleId);
    const redoModule = moduleFrom(result.sceneRedoMove, result.moduleId);
    const patchedPosition = patchedModule?.positionMm;
    assert(result.move.ok && movedModule && patchedPosition && movedModule.positionMm.x !== patchedPosition.x, "Move did not change module position.", { patchedModule, movedModule, move: result.move });
    assert(result.undoMove.ok && undoModule?.positionMm.x === patchedPosition.x && undoModule?.positionMm.z === patchedPosition.z, "Undo did not restore module position.", { patchedModule, undoModule });
    assert(result.redoMove.ok && redoModule?.positionMm.x === movedModule.positionMm.x && redoModule?.positionMm.z === movedModule.positionMm.z, "Redo did not restore moved position.", { movedModule, redoModule });

    for (const [name, toolResult] of Object.entries({ wall: result.wall, floor: result.floor, column: result.column, section: result.section })) {
      assert(toolResult.ok && toolResult.output?.id, `${name} creation failed.`, toolResult);
    }
    assert(result.selectedWall.ok && result.rotate.ok, "Wall selection or rotation failed.", { selection: result.selectedWall, rotate: result.rotate });
    assert(result.duplicate.ok && result.duplicateId, "Duplicate did not create one identifiable module.", { duplicate: result.duplicate, duplicateId: result.duplicateId });
    assert(result.selectedForDelete.ok, "Delete target selection failed.", result.selectedForDelete);
    assert(!result.deniedDelete.ok && result.deniedDelete.error?.includes("requires explicit user confirmation"), "Delete ran without confirmation.", result.deniedDelete);
    assert(result.allowedDelete.ok && !result.sceneDeleted.output.modules.some((item) => item.id === result.duplicateId), "Confirmed deletion did not remove its target.", result.allowedDelete);
    assert(result.undoDelete.ok && result.sceneDeleteUndone.output.modules.some((item) => item.id === result.duplicateId), "Undo did not restore deleted module.", result.undoDelete);
    assert(!result.deniedCatalogInsert.ok && result.deniedCatalogInsert.error?.includes("requires explicit user confirmation"), "Catalog insert ran without confirmation.", result.deniedCatalogInsert);
    assert(result.catalogInsert.ok && result.catalogInsert.output?.instanceId, "Confirmed tenant catalog insert failed.", result.catalogInsert);
    assert(!result.deniedVendorInsert.ok && result.deniedVendorInsert.error?.includes("requires explicit user confirmation"), "Vendor insert ran without confirmation.", result.deniedVendorInsert);
    assert(!result.scopedVendorInsert.ok && result.scopedVendorInsert.error?.includes("not available in the authenticated tenant catalog"), "Vendor tenant-scope denial failed.", result.scopedVendorInsert);
    if (result.capabilities.tenantAvailability?.vendorId) {
      assert(result.vendorResolution?.status === 200, "Vendor assistant resolution request failed.", result.vendorResolution);
      assert(result.vendorResolution.body?.requiresConfirmation === true, "Resolved vendor insertion did not require confirmation.", result.vendorResolution);
      assert(result.vendorInsert?.ok && result.vendorInsert.output?.instanceId, "Confirmed resolved vendor insertion failed.", { resolution: result.vendorResolution, insertion: result.vendorInsert });
    }
    assert(result.selectionClear.ok && result.selectionClear.output?.selectedKind === null, "Selection clear failed.", result.selectionClear);
    assert(result.pricingBeforeSave.ok && typeof result.pricingBeforeSave.output?.quote?.finalPrice === "number", "Pricing before save failed.", result.pricingBeforeSave);
    assert(result.save.ok && result.sceneAfterSave.output?.project?.saveRevision > result.sceneBeforeSave.output?.project?.saveRevision, "Project save did not advance revision.", { save: result.save, before: result.sceneBeforeSave.output?.project, after: result.sceneAfterSave.output?.project });

    const beforeReloadFingerprint = sceneFingerprint(result.sceneAfterSave);
    await reopenNamedProject(page, projectName);
    const afterReload = await page.evaluate(async () => {
      const assistant = window.__arcigyAssistant;
      if (!assistant) throw new Error("Assistant bridge missing after project reload.");
      const scene = await assistant.executeToolCall({ id: "scene_reloaded", toolId: "context.getScene", input: {} });
      const pricing = await assistant.executeToolCall({ id: "pricing_reloaded", toolId: "pricing.getSummary", input: {} });
      return { scene, pricing };
    });
    assert(afterReload.scene.ok && afterReload.pricing.ok, "Assistant read failed after project reload.", afterReload);
    assert(JSON.stringify(sceneFingerprint(afterReload.scene)) === JSON.stringify(beforeReloadFingerprint), "Saved assistant-created state changed after reload.", { beforeReloadFingerprint, after: sceneFingerprint(afterReload.scene) });
    assert(afterReload.pricing.output?.quote?.finalPrice === result.pricingBeforeSave.output?.quote?.finalPrice, "Pricing changed after save and reload.", { before: result.pricingBeforeSave.output?.quote, after: afterReload.pricing.output?.quote });
    assert(consoleErrors.length === 0, "Browser console contains errors.", consoleErrors);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      projectName,
      projectId: beforeReloadFingerprint.projectId,
      toolCount: result.toolIds.length,
      vendorPositivePath: result.capabilities.tenantAvailability?.vendorId ? "resolved-confirmed-and-inserted" : "not-available-for-current-tenant",
      checks: [
        "authenticated-discovery",
        "all-40-tools-registered",
        "read-context-scene-view-filter-object-project-schema-catalog-pricing-validation",
        "invalid-input-and-unknown-tool-denial",
        "select-clear",
        "module-patch",
        "move-undo-redo",
        "rotate",
        "duplicate",
        "delete-confirmation-and-undo",
        "wall-floor-column-section-create",
        "tenant-catalog-confirmation-and-insert",
        "vendor-confirmation-and-tenant-scope-denial",
        "vendor-resolve-confirm-and-insert-when-tenant-available",
        "project-save-revision",
        "saved-project-reload-equivalence",
        "pricing-reload-equivalence",
        "console-errors"
      ]
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
