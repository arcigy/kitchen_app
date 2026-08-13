import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createAssistantBridge } from "./assistantBridge";
import { makeDefaultModuleParams } from "../model/cabinetTypes";

describe("assistant bridge safety boundary", () => {
  it("creates confirmed custom furniture from a semantic boundary", async () => {
    const createCustomFurniture = vi.fn((params) => ({ id: "cf1", params }));
    const selectFurniture = vi.fn();
    const bridge = createAssistantBridge({ customFurnitureActions: { createCustomFurniture, selectFurniture } } as never);
    const result = await bridge.executeToolCall({
      id: "cf_create",
      toolId: "customFurniture.create",
      confirmed: true,
      input: { name: "Reception", boundary: [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 700 }] }
    });
    expect(result).toMatchObject({ ok: true, output: { id: "cf1" } });
    expect(createCustomFurniture).toHaveBeenCalledWith(expect.objectContaining({ name: "Reception", boards: [] }));
    expect(selectFurniture).toHaveBeenCalledWith("cf1");
  });

  it("starts only the confirmed requested export format", async () => {
    const exportLayoutJsonFile = vi.fn(async () => undefined);
    const bridge = createAssistantBridge({
      exportActions: { downloadViewportPng: vi.fn(), exportLayoutJsonFile, exportSceneJsonFile: vi.fn(), exportWebsiteShowcaseFile: vi.fn() }
    } as never);
    const result = await bridge.executeToolCall({ id: "export_1", toolId: "export.download", confirmed: true, input: { format: "layout-json" } });
    expect(result).toMatchObject({ ok: true, output: { format: "layout-json", downloadStarted: true } });
    expect(exportLayoutJsonFile).toHaveBeenCalledOnce();
  });

  it("returns the verified Blender preview result from the existing reviewed render owner", async () => {
    const exportBlenderPreview = vi.fn(async () => ({
      status: "completed" as const,
      previewUrl: "/storage/client/project/preview.png",
      previewPath: "C:/exports/preview.png",
      blendPath: "C:/exports/scene.blend"
    }));
    const bridge = createAssistantBridge({ exportActions: { exportBlenderPreview } } as never);

    const result = await bridge.executeToolCall({ id: "render_1", toolId: "render.blenderPreview", confirmed: true, input: {} });

    expect(exportBlenderPreview).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      output: { status: "completed", previewUrl: "/storage/client/project/preview.png", blendPath: "C:/exports/scene.blend" }
    });
  });

  it("refuses a confirmed pricing workbook when the live project has nothing to price", async () => {
    const bridge = createAssistantBridge({
      instances: [],
      kitchenWorktops: [],
      S: { customFurniture: [], kitchenCtx: {} },
      catalog: {},
      getProjectMarginSettings: () => ({})
    } as never);

    const result = await bridge.executeToolCall({ id: "workbook_empty", toolId: "export.pricingWorkbook", confirmed: true, input: {} });

    expect(result).toMatchObject({ ok: false, error: "Pricing workbook requires at least one priced project entity." });
  });

  it("creates a distance measure through the existing measurement owner", async () => {
    const createDistance = vi.fn(() => ({ id: "measure_9" }));
    const bridge = createAssistantBridge({ measureActions: { createDistance } } as never);

    const result = await bridge.executeToolCall({
      id: "measure_create",
      toolId: "measure.createDistance",
      input: { aMm: { x: 0, z: 0 }, bMm: { x: 2400, z: 0 } }
    });

    expect(createDistance).toHaveBeenCalledWith({ x: 0, z: 0 }, { x: 2400, z: 0 });
    expect(result).toMatchObject({ ok: true, output: { id: "measure_9", distanceMm: 2400 } });
  });

  it("aligns exact live object lines through the lock-aware alignment owner", async () => {
    const align = vi.fn(() => ({ ok: true, reason: "Align: done." }));
    const bridge = createAssistantBridge({ alignActions: { align } } as never);
    const reference = { targetKind: "wall", targetId: "wall_1", lineRole: "center" };
    const target = { targetKind: "module", targetId: "module_1", lineRole: "edge" };

    const result = await bridge.executeToolCall({ id: "align_1", toolId: "editor.alignLines", confirmed: true, input: { reference, target } });

    expect(align).toHaveBeenCalledWith(reference, target);
    expect(result).toMatchObject({ ok: true, output: { reference, target, reason: "Align: done." } });
  });

  it("creates a validated door through the wall-opening owner and records history", async () => {
    const doors: Array<{ id: string; params: Record<string, unknown>; root: THREE.Group }> = [];
    const wall = { id: "wall_1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 4000, z: 0 } } };
    const commitHistory = vi.fn();
    const bridge = createAssistantBridge({
      walls: [wall],
      doors,
      windows: [],
      layoutRoot: new THREE.Group(),
      createDoor: () => ({ id: `door_${doors.length + 1}`, params: { wall: "back", wallId: null, widthMm: 900, heightMm: 2100, centerMm: 0, frameWidthMm: 70, offsetFromInteriorMm: 20, panelThicknessMm: 42, swingDirection: "left", swingSide: "inward", swingAngleDeg: 90, handleType: "lever", handleOffsetMm: 85, handleHeightMm: 1050, materialId: "door.default" }, root: new THREE.Group() }),
      clampDoorParams: (params: Record<string, unknown>) => params,
      updateDoorTransform: vi.fn(),
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      setActiveDoor: vi.fn(),
      setSelectedDoor: vi.fn(),
      mountProps: vi.fn(),
      updateLayoutPanel: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      commitHistory
    } as never);

    const result = await bridge.executeToolCall({
      id: "door_create",
      toolId: "opening.createDoor",
      confirmed: true,
      input: { wallId: "wall_1", widthMm: 900, heightMm: 2100, centerMm: 1400 }
    });

    expect(result.ok).toBe(true);
    expect(doors).toHaveLength(1);
    expect(doors[0]?.params).toMatchObject({ wallId: "wall_1", centerMm: 1400 });
    expect(commitHistory).toHaveBeenCalledOnce();
  });

  it("rejects a conflicting opening before it changes the project", async () => {
    const doors: Array<{ id: string; params: Record<string, unknown>; root: THREE.Group }> = [{ id: "door_existing", params: { wall: "back", wallId: "wall_1", widthMm: 900, centerMm: 1400 }, root: new THREE.Group() }];
    const bridge = createAssistantBridge({
      walls: [{ id: "wall_1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 4000, z: 0 } } }],
      doors,
      windows: [],
      layoutRoot: new THREE.Group(),
      createDoor: () => ({ id: "door_new", params: { wall: "back", wallId: null, widthMm: 900, heightMm: 2100, centerMm: 0, frameWidthMm: 70, offsetFromInteriorMm: 20, panelThicknessMm: 42, swingDirection: "left", swingSide: "inward", swingAngleDeg: 90, handleType: "lever", handleOffsetMm: 85, handleHeightMm: 1050, materialId: "door.default" }, root: new THREE.Group() }),
      clampDoorParams: (params: Record<string, unknown>) => params
    } as never);

    const result = await bridge.executeToolCall({
      id: "door_overlap",
      toolId: "opening.createDoor",
      confirmed: true,
      input: { wallId: "wall_1", widthMm: 900, heightMm: 2100, centerMm: 1400 }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("overlap");
    expect(doors).toHaveLength(1);
  });

  it("rejects confirmation-gated tools before calling editor owners", async () => {
    const bridge = createAssistantBridge({} as never);
    const result = await bridge.executeToolCall({
      id: "delete_1",
      toolId: "editor.deleteSelection",
      input: {}
    });
    expect(result).toMatchObject({ ok: false, toolId: "editor.deleteSelection" });
    expect(result.error).toContain("requires explicit user confirmation");
  });

  it("rejects malformed tool inputs before touching editor state", async () => {
    const bridge = createAssistantBridge({} as never);
    const result = await bridge.executeToolCall({
      id: "move_1",
      toolId: "editor.moveSelection",
      input: { dxMm: 100 }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("input.dzMm is required");
  });

  it("server-authorizes every write tool before invoking its editor owner", async () => {
    const authorizeToolCall = vi.fn(async () => { throw new Error("role denied"); });
    const undo = vi.fn();
    const bridge = createAssistantBridge({ authorizeToolCall, undo } as never);

    const result = await bridge.executeToolCall({ id: "undo_1", toolId: "history.undo", input: {} });

    expect(result.ok).toBe(false);
    expect(authorizeToolCall).toHaveBeenCalledWith(expect.objectContaining({ toolId: "history.undo" }));
    expect(undo).not.toHaveBeenCalled();
    expect(result.error).toContain("role denied");
  });

  it("rolls back earlier module patches when a later target fails", async () => {
    const original = makeDefaultModuleParams("drawer_low");
    const first = { id: "i1", params: structuredClone(original) };
    const rebuildInstance = vi.fn(() => true);
    const bridge = createAssistantBridge({
      S: { mode: "build" },
      instances: [first],
      findInstance: (id: string) => id === first.id ? first : null,
      rebuildInstance,
      mountProps: vi.fn(),
      updateLayoutPanel: vi.fn(),
      updateSelectionHighlights: vi.fn()
    } as never);

    const result = await bridge.executeToolCall({
      id: "patch_1",
      toolId: "module.patchSelectedParams",
      input: { instanceIds: ["i1", "missing"], patch: { widthMm: 800 } }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Module missing not found");
    expect(first.params).toEqual(original);
    expect(rebuildInstance).toHaveBeenCalledTimes(2);
  });

  it("initializes the existing transform owner with the selected wall midpoint before rotating", async () => {
    const setRotatePivot = vi.fn(() => true);
    const wall = {
      id: "w1",
      params: { aMm: { x: 0, z: 1000 }, bMm: { x: 2000, z: 1000 } }
    };
    const applyRotateAngle = vi.fn(() => {
      wall.params = { aMm: { x: 1000, z: 0 }, bMm: { x: 1000, z: 2000 } };
    });
    const bridge = createAssistantBridge({
      S: {
        selectedWallIds: new Set(["w1"]),
        selectedInstanceIds: new Set(),
        selectedInstanceId: null,
        activeKitchenGroupId: null,
        kitchenGroups: [],
        customFurniture: [],
        layoutTool: "select",
        viewMode: "2d"
      },
      walls: [wall],
      instances: [],
      startTransformFromSelection: vi.fn(() => true),
      setRotatePivot,
      applyRotateAngle,
      clearTransform: vi.fn(),
      commitHistory: vi.fn(),
      mountProps: vi.fn(),
      updateLayoutPanel: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      getSelectedKind: () => "wall",
      getSelectedKitchenGroupId: () => null,
      getActiveViewerTab: () => "floorplan",
      getLayoutTool: () => "select",
      getViewMode: () => "2d",
      findInstance: () => null,
      projectActions: { getState: () => ({ currentProject: null, lastSavedAt: null, saveRevision: 0 }) },
      floors: [], columns: [], sections: [], windows: [], doors: [], kitchenWorktops: [], catalog: { materials: [], components: [], modules: [] }
    } as never);

    const result = await bridge.executeToolCall({
      id: "rotate_1",
      toolId: "editor.rotateSelection",
      input: { angleDeg: 90 }
    });

    expect(setRotatePivot).toHaveBeenCalledOnce();
    const pivot = (setRotatePivot.mock.calls as unknown as Array<[THREE.Vector3]>)[0]?.[0];
    expect(pivot?.toArray()).toEqual([1, 0, 1]);
    expect(applyRotateAngle).toHaveBeenCalledWith(Math.PI / 2);
    expect(result.ok).toBe(true);
  });

  it("serves narrow GET tools from the live project without mutating it", async () => {
    const root = new THREE.Group();
    root.position.set(1.2, 0, 2.4);
    const params = makeDefaultModuleParams("drawer_low");
    const instance = { id: "module_1", params, root, kitchenGroupId: "group_1", kitchenPlacement: null };
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(3, 4, 5);
    const bridge = createAssistantBridge({
      S: {
        selectedInstanceIds: new Set(["module_1"]),
        selectedInstanceId: "module_1",
        selectedWallIds: new Set(),
        selectedKind: "module",
        activeKitchenGroupId: "group_1",
        kitchenGroups: [{ id: "group_1", name: "Main kitchen", instanceIds: ["module_1"], ctx: {} }],
        customFurniture: [],
        layoutTool: "select",
        viewMode: "3d"
      },
      catalog: {
        materials: [{
          id: "mat.H15554",
          materialCode: "H15554",
          displayName: "Oak H15554",
          name: "Oak H15554",
          decor: "H15554",
          manufacturer: "Demo",
          supplierId: "supplier_1",
          materialType: "board",
          boardFamily: "body",
          defaultThicknessMm: 18,
          availableThicknessesMm: [18],
          recommendedUse: "Corpus",
          tags: ["oak"],
          isActive: true
        }],
        components: [],
        modules: [{
          id: "drawer_catalog",
          name: "Drawer cabinet",
          description: "Base cabinet with drawers",
          moduleType: "drawer_low",
          modulePackageId: "drawer_low_v1",
          category: "base",
          defaultWidth: 600,
          defaultHeight: 720,
          defaultDepth: 560,
          tags: ["drawer", "base"],
          enabled: true
        }]
      },
      instances: [instance],
      walls: [], floors: [], columns: [], sections: [], windows: [], doors: [], kitchenWorktops: [],
      modulePackages: [{
        module: { modulePackageId: "drawer_low_v1", moduleType: "drawer_low", displayName: "Drawer cabinet" },
        parameters: { parameters: [
          { key: "width", label: "Width", type: "number", defaultValue: 600, min: 300, max: 1200, affects: "geometry" },
          { key: "drawerSystemPreset", label: "Drawer system", type: "select", defaultValue: "standard", options: [{ label: "Standard", value: "standard" }, { label: "Premium", value: "premium" }], affects: "bom" }
        ] },
        placement: { allowedContexts: ["kitchen_wall"] },
        constraints: { dimensionRules: { width: { min: 300, max: 1200 } } }
      }],
      findInstance: (id: string) => id === "module_1" ? instance : null,
      getSelectedKind: () => "module",
      getSelectedKitchenGroupId: () => "group_1",
      getActiveViewerTab: () => "floorplan",
      getLayoutTool: () => "select",
      getViewMode: () => "3d",
      getCamera: () => camera,
      getControlsTarget: () => new THREE.Vector3(1, 0, 2),
      getProjection: () => "perspective",
      getRenderMode: () => "solid",
      getViewerToolMode: () => "orbit",
      projectActions: {
        getState: () => ({
          currentProject: { projectId: "project_1", activePhaseId: "phase_1" },
          lastSavedAt: "2026-07-22T10:00:00.000Z",
          saveRevision: 3,
          editingSessionId: "session_1"
        }),
        inspectById: vi.fn(async () => ({
          project: { projectId: "project_old", name: "Old kitchen", updatedAt: "2026-07-01T00:00:00.000Z" },
          catalogSnapshot: { materials: [{ id: "mat.H15554", materialCode: "H15554", displayName: "Oak H15554" }] },
          appState: {
            kitchen: { groups: [{ id: "kg_old", ctx: { corpusMaterialId: "mat.H15554" } }] },
            modules: [{ id: "old_m1", params: { corpusMaterialId: "mat.H15554" } }],
            materialAssignments: {}
          }
        }))
      }
    } as never);

    const selection = await bridge.executeToolCall({ id: "read_selection", toolId: "context.getSelection", input: {} });
    const view = await bridge.executeToolCall({ id: "read_view", toolId: "context.getCurrentView", input: {} });
    const query = await bridge.executeToolCall({ id: "query_modules", toolId: "context.queryObjects", input: { kinds: ["module"], kitchenGroupId: "group_1", text: "drawer" } });
    const object = await bridge.executeToolCall({ id: "read_module", toolId: "context.getObject", input: { kind: "module", id: "module_1" } });
    const project = await bridge.executeToolCall({ id: "read_project", toolId: "project.getMetadata", input: {} });
    const schema = await bridge.executeToolCall({ id: "read_schema", toolId: "module.getParameterSchema", input: { instanceId: "module_1" } });
    const presets = await bridge.executeToolCall({ id: "read_presets", toolId: "module.listPresets", input: { instanceId: "module_1" } });
    const catalog = await bridge.executeToolCall({ id: "search_catalog", toolId: "catalog.searchModules", input: { query: "drawer", widthMm: 600 } });
    const materials = await bridge.executeToolCall({ id: "search_materials", toolId: "catalog.searchMaterials", input: { query: "H15554" } });
    const oldMaterial = await bridge.executeToolCall({ id: "old_material", toolId: "project.inspectMaterialUsage", input: { projectId: "project_old", query: "H15554" } });
    const validation = await bridge.executeToolCall({ id: "validate", toolId: "validation.inspectProject", input: {} });

    expect(selection).toMatchObject({ ok: true, callId: "read_selection", output: { selectedInstanceIds: ["module_1"] } });
    expect(view).toMatchObject({ ok: true, callId: "read_view", output: { projection: "perspective", camera: { positionM: { x: 3, y: 4, z: 5 } } } });
    expect(query).toMatchObject({ ok: true, output: { total: 1, objects: [{ id: "module_1", kind: "module" }] } });
    expect(object).toMatchObject({ ok: true, output: { id: "module_1", kind: "module", positionMm: { x: 1200, y: 0, z: 2400 } } });
    expect(project).toMatchObject({ ok: true, output: { projectId: "project_1", saveRevision: 3, editingSessionId: "session_1" } });
    expect(schema).toMatchObject({
      ok: true,
      output: {
        modulePackageId: "drawer_low_v1",
        parameters: expect.arrayContaining([expect.objectContaining({ key: "width", min: 300, max: 1200 })])
      }
    });
    expect(presets).toMatchObject({ ok: true, output: { presets: [{ parameterKey: "drawerSystemPreset", options: [{ value: "standard" }, { value: "premium" }] }] } });
    expect(catalog).toMatchObject({ ok: true, output: { total: 1, modules: [{ modulePackageId: "drawer_low_v1" }] } });
    expect(materials).toMatchObject({ ok: true, output: { total: 1, materials: [{ id: "mat.H15554", materialCode: "H15554" }] } });
    expect(oldMaterial).toMatchObject({ ok: true, output: { materialIds: ["mat.H15554"], occurrenceCount: 2 } });
    expect(validation.ok).toBe(true);
  });
});
