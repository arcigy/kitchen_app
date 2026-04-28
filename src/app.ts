import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import {
  axisLockXZ,
  clamp,
  computeGrainArrow,
  computeOverlaps,
  copyM16,
  findSelectableMeshByName,
  formatMm,
  getSelectableMeshes,
  matrixChanged,
  pickSurfacePoint,
  planarDistanceMm,
  pointInPolygonXZ,
  readDimensionsMm,
  readGrainAlong,
  renderErrors,
  snapPointXZ,
  toggleSelectedPbr,
  worldToScreen
} from "./app/sharedUtils";
import { applyMeasureAxisAssist, createMeasureTools } from "./app/measureTools";
import { applyMeasureAxisAssist3D, axisLockPoint3D, distance3dMm, snapPoint3D } from "./app/measure3d";
import {
  createPlanSnapper,
  getModulePlanLocalPolygon,
  getModulePlanLocalRect,
  getModulePlanPolygon,
  type PlanSnapBinding,
  type PlanSnapResult
} from "./app/planSnap";
import {
  buildMeasureGuides,
  resolveAssociativeMeasureWorld,
  resolvePlanBinding,
  toFreePlanBinding,
  type AssociativeMeasureContext
} from "./app/measureAssociative";
import {
  createMeasureInlineEditor,
  getSelectionMeasureBindings,
  type MeasureSelectionTarget
} from "./app/measureEditing";
import { createSnapOverlay } from "./app/snapOverlay";
import { DimensionOverlay } from "./app/dimensionOverlay";
import { createTechnicalDimensionManager } from "./app/technicalDimensions";
import {
  areAlignLinesParallel,
  buildModuleAlignCandidates,
  buildWallAlignCandidates,
  buildWorktopAlignCandidates,
  getAlignShiftVector,
  pickBestAlignLine,
  shiftPolylinePoint,
  shiftPolylineSegment
} from "./app/alignTool";
import {
  buildModuleSnapCandidates,
  detectModuleAdjacency,
  detectModuleAdjacencyInfo,
  type ModuleAdjacencyLink
} from "./app/moduleAdjacency";
import {
  buildSectionMarkerGeometry,
  buildPlaneSliceStripGeometry,
  computeElevationViewConfig,
  computeSectionViewConfig,
  createSectionPickGeometry,
  getSectionBasis
} from "./app/sectionViews";
import {
  createSelectionHighlights,
  createToolHud,
  createUnderlayController,
  createWallSnapMarkers
} from "./app/layoutVisuals";
import { createViewerTabs, resolveAppArgs, type AppArgs } from "./app/bootstrap";
import type {
  AlignPickedLine,
  FloorBoundaryPoint,
  FloorBoundarySegment,
  FloorBoundaryTool,
  FloorEditDrag,
  FloorEditVertexRef,
  FloorInstance,
  FloorParams,
  KitchenWorktopInstance,
  KitchenWorktopJustification,
  KitchenPlacementBinding,
  KitchenWorktopParams,
  LayoutInstance,
  LayoutSnapshot,
  PickedLine2D,
  SectionElevationKey,
  SectionInstance,
  SectionParams,
  SelectedKind,
  WallId,
  WallInstance,
  WallParams,
  WindowInstance,
  WindowParams
} from "./app/localTypes";
import type { ModuleParams } from "./model/cabinetTypes";
import { normalizeModuleParams, normalizeModuleParamsForSource, validateModule } from "./model/cabinetTypes";
import { buildModule } from "./geometry/buildModule";
import { createScene } from "./core/scene";
import { createPartPanel } from "./ui/createPartPanel";
import { createLayoutPanel } from "./ui/createLayoutPanel";
import { disposeObject3D } from "./core/dispose";
import { getModuleDescriptorOrThrow, getModuleDescriptors } from "./modules/registry";
import { createSsgiPipeline, type SsgiPipeline } from "./rendering/ssgiPipeline";
import { createPhotoPathTracer, type PhotoPathTracer } from "./rendering/photoPathTracer";
import { createTopbar } from "./ui/createTopbar";
import { mountBomDevPanel } from "./ui/bomDevPanel";
import { mountPricingCatalogPanel } from "./ui/pricingCatalogPanel";
import { loadUnderlayToCanvas } from "./ui/loadUnderlay";
import { bindLabelToControl } from "./ui/formFieldA11y";
import { getAllMaterials } from "./data/materials";
import { getMaterialDefinitionById } from "./data/pricing/materialDefinitions";
import { solveWallNetwork } from "./walls2d/solver";
import { makeAppState, type AppState } from "./layout/appState";
import {
  getKitchenWorktopPolygon,
  kitchenWorktopPointToWorld,
  offsetKitchenWorktopPath,
  sanitizeKitchenWorktopPath
} from "./layout/worktopGeometry";
import { makeDefaultKitchenContext, resolveContext } from "./layout/kitchenContext";
import { createKitchenEditMode } from "./layout/kitchenEditMode";
import {
  updateUndoRedoUi,
  commitHistory,
  undo,
  redo,
  captureLayoutSnapshot,
  type HistoryHelpers
} from "./layout/historyManager";
import {
  addInstance,
  cancelPlacement,
  commitPlacement,
  mountPlacementControls,
  rebuildGhost,
  type PlacementHelpers
} from "./layout/placementManager";
import { applyKitchenContextToModuleParams } from "./layout/kitchenMaterialSync";
import {
  getKitchenModuleRole,
  staysOutsideKitchenWorktopFootprint
} from "./layout/kitchenModuleRules";
import { createViewNavigation } from "./app/viewNavigation";
import { createExportActions } from "./app/exportActions";
import { getInstallState, promptAppInstall, subscribeInstallState } from "./pwa/installController";

export function startApp(initialArgs: AppArgs) {
  const args = resolveAppArgs(initialArgs);

  type ParamHighlightControls = {
    highlightParamKeys?: (keys: string[]) => void;
    clearHighlights?: () => void;
  };

  const availableModuleDescriptors = getModuleDescriptors();
  const hasImportedModules = availableModuleDescriptors.length > 0;
  const noModulesMessage =
    'No imported modules installed. Run `npm run import:modpkg -- "<path-to.modpkg>"` and reload the app.';
  let exportActions: ReturnType<typeof createExportActions> | null = null;
  const downloadViewportPng = () => exportActions?.downloadViewportPng();
  let params: ModuleParams = hasImportedModules
    ? getModuleDescriptorOrThrow(availableModuleDescriptors[0].type).defaultParams()
    : ({ type: "__empty__" } as unknown as ModuleParams);
  const ENABLE_SSGI = import.meta.env.VITE_ENABLE_SSGI === "true";
  const ENABLE_PHOTO = import.meta.env.VITE_ENABLE_PHOTO === "true";

  const {
    scene,
    renderer,
    setSize,
    setViewMode,
    setPlanPresentation,
    getCamera,
    getControls,
    setHdri,
    getHdriSettings,
    setDaylightIntensity,
    getDaylightIntensity,
    setShadowAlgorithm,
    getShadowAlgorithm,
    setWindowOpening,
    getWindowOpening,
    setWindowCutout,
    updateLighting,
    getLightingRevision,
    getSceneDebugState
  } = createScene(args.viewerEl);
  const cam = () => getCamera();
  const ctl = () => getControls();
  renderer.localClippingEnabled = true;
  const dimensionOverlay = new DimensionOverlay(renderer, cam());
  dimensionOverlay.unitScale = 1000;

  setDaylightIntensity(9);

  type AppMode = "build" | "layout";
  let mode: AppMode = "layout";
  let viewMode: "3d" | "2d" = "3d";
  const { floorplanTab, view3dTab, setExtraTabs, syncViewerTabs } = createViewerTabs(args.viewerEl);
  let activeViewerTab = "3d";
  let activeDetailClipPlanes: THREE.Plane[] = [];

  type LayoutTool = "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";
  let layoutTool: LayoutTool = "select";
  let viewNavigation: ReturnType<typeof createViewNavigation>;
  let detailViewPanOffset!: THREE.Vector3;

  type RenderMode = "realtime" | "realtime_ssgi" | "photo_pathtrace";
  let renderMode: RenderMode = "realtime";
  let ssgi: SsgiPipeline | null = null;
  let ssgiCameraUuid: string | null = null;
  let photo: PhotoPathTracer | null = null;
  let photoCameraUuid: string | null = null;
  let photoLastLightingRevision = -1;
  let lastCameraWorld = new Float32Array(16);
  let lastCameraProj = new Float32Array(16);

  let cabinetGroup: THREE.Group | null = null;
  const hiddenParts = new Set<string>();

  const layoutRoot = new THREE.Group();
  layoutRoot.name = "layoutRoot";
  layoutRoot.visible = false;
  scene.add(layoutRoot);
  const moduleAdjacencyGroup = new THREE.Group();
  moduleAdjacencyGroup.name = "moduleAdjacencyGroup";
  layoutRoot.add(moduleAdjacencyGroup);
  const placementAdjacencyPreview = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0x7ee787, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
  );
  placementAdjacencyPreview.visible = false;
  placementAdjacencyPreview.renderOrder = 62;
  moduleAdjacencyGroup.add(placementAdjacencyPreview);
  let lastRebuildDebug: Record<string, unknown> | null = null;

  const wallPlanGroup = new THREE.Group();
  wallPlanGroup.name = "wallPlanGroup";
  wallPlanGroup.visible = false;
  layoutRoot.add(wallPlanGroup);

  const detailSliceGroup = new THREE.Group();
  detailSliceGroup.name = "detailSliceGroup";
  detailSliceGroup.visible = false;
  layoutRoot.add(detailSliceGroup);

  const wallPlanMeshes = new Map<string, THREE.Line>();
  const wallJoinMeshes: THREE.Mesh[] = [];
  const wallDebugGroup = new THREE.Group();
  wallDebugGroup.name = "wallDebugGroup";
  wallDebugGroup.visible = false;
  wallPlanGroup.add(wallDebugGroup);
  let wallDebugEnabled = false;
  const wallSolvedOutlines = new Map<string, Array<{ x: number; z: number }>>();
  let wallSolvedJoinPolys: Array<Array<{ x: number; z: number }>> = [];
  let wallUnionPolys: any | null = null;

  const { wallSnapMarkers, showWallSnapMarkersFor } = createWallSnapMarkers({
    layoutRoot,
    getMode: () => mode,
    getWalls: () => walls,
    getWallSolvedOutlines: () => wallSolvedOutlines
  });

  const floorBoundaryGroup = new THREE.Group();
  floorBoundaryGroup.name = "floorBoundaryEdit";
  floorBoundaryGroup.visible = false;
  layoutRoot.add(floorBoundaryGroup);

  const { toolHud, clearToolHud, hudHoverLine, hudLineThicknessM, hudPickLine1, hudPickLine2, updateHudLine } = createToolHud({
    layoutRoot,
    getCamera: cam
  });

  const { updateSelectionHighlights } = createSelectionHighlights({
    layoutRoot,
    getMode: () => mode,
    getSelectedWallIds: () => selectedWallIds,
    getSelectedInstanceIds: () => selectedInstanceIds,
    getWallSolvedOutlines: () => wallSolvedOutlines,
    getSelectedKind: () => selectedKind,
    getSelectedFloorId: () => selectedFloorId,
    getFloors: () => floors,
    getInstances: () => instances,
    getModuleLocalBackCenter: (inst) => getModuleLocalBackCenter(inst)
  });

  const {
    underlayMat,
    underlayMesh,
    underlayState,
    underlayCal,
    roomBounds,
    updateUnderlayTransform,
    setUnderlayBaseSize,
    setUnderlayFromCanvas,
    clearUnderlay
  } = createUnderlayController({
    layoutRoot,
    renderer
  });

  const instances: LayoutInstance[] = [];
  let instanceCounter = 1;
  let selectedInstanceId: string | null = null;
  let selectedWallId: string | null = null;
  const selectedInstanceIds = new Set<string>();
  const selectedWallIds = new Set<string>();
  const pinnedInstanceIds = new Set<string>();
  const pinnedWallIds = new Set<string>();
  let selectedInstanceBox: THREE.BoxHelper | null = null;
  let selectedWallBox: THREE.BoxHelper | null = null;
  let selectedUnderlayBox: THREE.BoxHelper | null = null;

  let windowInst: WindowInstance | null = null;
  let selectedKind: SelectedKind = null;
  let selectedKitchenGroupId: string | null = null;
  let selectedFloorId: string | null = null;
  let selectedSectionId: string | null = null;

  const walls: WallInstance[] = [];
  let wallCounter = 1;
  const wallJoinTolMm = 25;
  const wallDefault = {
    thicknessMm: 150,
    heightMm: 2600,
    materialId: "default",
    justification: "center" as "center" | "interior" | "exterior",
    exteriorSign: 1 as 1 | -1
  };

  const floors: FloorInstance[] = [];
  let floorCounter = 1;
  const sections: SectionInstance[] = [];
  let sectionCounter = 1;
  const floorDefault = {
    heightMm: 0,
    thicknessMm: 150,
    materialId: "mat_grey_corpus"
  };

  const kitchenWorktops: KitchenWorktopInstance[] = [];
  let worktopCounter = 1;

  const technicalDimensions = createTechnicalDimensionManager({
    overlay: dimensionOverlay,
    renderer,
    getCamera: cam,
    getControls: ctl,
    getMode: () => mode,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    clearToolHud
  });
  const dimensionState = technicalDimensions.state;

  const history = {
    past: [] as LayoutSnapshot[],
    future: [] as LayoutSnapshot[],
    current: null as LayoutSnapshot | null,
    max: 80
  };

  const kitchenCtx = resolveContext(makeDefaultKitchenContext());


  let undoBtnEl: HTMLButtonElement | null = null;
  let redoBtnEl: HTMLButtonElement | null = null;
  let helpers!: HistoryHelpers;
  let placementHelpers!: PlacementHelpers;

  const placement = {
    active: false,
    params: null as ModuleParams | null,
    ghost: null as any,
    ghostValid: false,
    lastCursor: new THREE.Vector3(0, 0, 0)
  };

  const S: AppState = makeAppState(params);
  S.mode = mode;
  S.viewMode = viewMode;
  S.renderMode = renderMode;
  S.ssgi = ssgi;
  S.ssgiCameraUuid = ssgiCameraUuid;
  S.photo = photo;
  S.photoCameraUuid = photoCameraUuid;
  S.photoLastLightingRevision = -1;
  S.walls = walls;
  S.wallCounter = wallCounter;
  S.floors = floors;
  S.floorCounter = floorCounter;
  S.sections = sections;
  S.sectionCounter = sectionCounter;
  S.kitchenWorktops = kitchenWorktops;
  S.worktopCounter = worktopCounter;
  S.instances = instances;
  S.instanceCounter = instanceCounter;
  S.params = params;
  S.kitchenCtx = kitchenCtx;
  S.layoutTool = layoutTool;
  S.selectedKind = selectedKind;
  S.selectedInstanceId = selectedInstanceId;
  S.selectedWallId = selectedWallId;
  S.selectedFloorId = selectedFloorId;
  S.selectedSectionId = selectedSectionId;
  S.selectedWallIds = selectedWallIds;
  S.selectedInstanceIds = selectedInstanceIds;
  S.pinnedWallIds = pinnedWallIds;
  S.pinnedInstanceIds = pinnedInstanceIds;
  S.underlayState = underlayState;
  S.placement = placement;
  S.undoBtnEl = undoBtnEl;
  S.redoBtnEl = redoBtnEl;
  S.history = history;

  function syncSelectionState() {
    S.selectedKind = selectedKind;
    S.selectedInstanceId = selectedInstanceId;
    S.selectedWallId = selectedWallId;
    S.selectedFloorId = selectedFloorId;
    S.selectedSectionId = selectedSectionId;
  }



  const wallDraw = {
    active: false,
    a: null as THREE.Vector3 | null,
    chainStart: null as THREE.Vector3 | null,
    segments: 0,
    preview: null as THREE.Mesh | null,
    hoverB: null as THREE.Vector3 | null,
    typedMm: "", // numeric buffer while drawing (e.g. "2500")
    lastPointerPx: { x: 0, y: 0 }
  };

  const kitchenWorktopDraw = {
    active: false,
    justification: "back" as KitchenWorktopJustification,
    mirrored: false,
    points: [] as FloorBoundaryPoint[],
    hoverPoint: null as FloorBoundaryPoint | null,
    typedMm: "",
    lastPointerPx: { x: 0, y: 0 },
    previewUpdatePending: false,
    previewSignature: "",
    previewMaterialId: "",
    previewRoot: null as THREE.Group | null,
    previewMesh: null as THREE.Mesh | null,
    previewOutline: null as THREE.Line | null,
    previewBackLine: null as THREE.Line | null
  };

  const sectionDraw = {
    active: false,
    mirrored: false,
    axisLocked: false,
    a: null as FloorBoundaryPoint | null,
    hoverPoint: null as FloorBoundaryPoint | null,
    previewRoot: null as THREE.Group | null,
    previewLine: null as THREE.LineSegments | null,
    previewArrows: null as THREE.LineSegments | null
  };

  const transformState = {
    kind: null as null | "move" | "rotate",
    step: null as null | "pickBase" | "pickTarget" | "pickPivot" | "rotating",
    base: null as THREE.Vector3 | null,
    pivot: null as THREE.Vector3 | null,
    typed: "",
    lastAngleSign: 1,
    lastPointerPx: { x: 0, y: 0 },
    selectedWallIds: [] as string[],
    selectedInstanceIds: [] as string[],
    selectedSectionIds: [] as string[],
    startWalls: new Map<string, WallParams>(),
    startInstances: new Map<string, { pos: THREE.Vector3; rotY: number }>(),
    startInstanceAdjacency: new Map<string, string | null>(),
    startSections: new Map<string, SectionParams>(),
    startPointerAngle: 0,
    lastValidDelta: new THREE.Vector3(0, 0, 0),
    lastValidAngle: 0
  };

  const clearTransform = (opts?: { restore?: boolean; status?: string | null }) => {
    if (opts?.restore) {
      for (const w of walls) {
        const p = transformState.startWalls.get(w.id);
        if (p) w.params = JSON.parse(JSON.stringify(p)) as WallParams;
        rebuildWall(w);
      }
      rebuildWallPlanMesh();
      for (const inst of instances) {
        const s = transformState.startInstances.get(inst.id);
        if (s) {
          inst.root.position.copy(s.pos);
          inst.root.rotation.y = s.rotY;
        }
      }
      for (const section of sections) {
        const s = transformState.startSections.get(section.id);
        if (!s) continue;
        section.params = cloneSectionParams(s);
        updateSectionVisual(section);
      }
      updateLayoutPanel();
      updateSelectionHighlights();
      mountProps();
    }

    transformState.kind = null;
    transformState.step = null;
    transformState.base = null;
    transformState.pivot = null;
    transformState.typed = "";
    transformState.lastAngleSign = 1;
    transformState.selectedWallIds = [];
    transformState.selectedInstanceIds = [];
    transformState.selectedSectionIds = [];
    transformState.startWalls.clear();
    transformState.startInstances.clear();
    transformState.startInstanceAdjacency.clear();
    transformState.startSections.clear();
    transformState.startPointerAngle = 0;
    transformState.lastValidDelta.set(0, 0, 0);
    transformState.lastValidAngle = 0;
    if (opts?.status) setUnderlayStatus(opts.status);
  };

  const startTransformFromSelection = (kind: "move" | "rotate") => {
    if (mode !== "layout" || viewMode !== "2d" || layoutTool !== "select") return false;
    if (measureState.enabled) return false;
    if (dragState.active || windowDragState.active || wallEditHud.drag || marquee.active) return false;
    if (underlayCal.active) return false;

    const wallIds = selectedWallIds.size > 0 ? Array.from(selectedWallIds) : selectedKind === "wall" && selectedWallId ? [selectedWallId] : [];
    const instIds =
      selectedInstanceIds.size > 0
        ? Array.from(selectedInstanceIds)
        : selectedKind === "module" && selectedInstanceId
          ? [selectedInstanceId]
          : [];
    const sectionIds = selectedKind === "section" && selectedSectionId ? [selectedSectionId] : [];
    if (kind === "rotate" && sectionIds.length > 0 && wallIds.length + instIds.length === 0) return false;
    if (wallIds.length + instIds.length + sectionIds.length === 0) return false;

    clearTransform();
    transformState.kind = kind;
    transformState.step = kind === "move" ? "pickBase" : "pickPivot";
    transformState.selectedWallIds = wallIds;
    transformState.selectedInstanceIds = instIds;
    transformState.selectedSectionIds = sectionIds;

    // Capture start state (includes non-selected walls/modules so we can restore cleanly during preview).
    for (const w of walls) transformState.startWalls.set(w.id, JSON.parse(JSON.stringify(w.params)) as WallParams);
    for (const inst of instances) transformState.startInstances.set(inst.id, { pos: inst.root.position.clone(), rotY: inst.root.rotation.y });
    for (const inst of instances) {
      if (!instIds.includes(inst.id)) continue;
      const box = instanceWorldBox(inst);
      let neighborId: string | null = null;
      for (const other of instances) {
        if (other.id === inst.id) continue;
        if (inst.kitchenGroupId && other.kitchenGroupId !== inst.kitchenGroupId) continue;
        const link = detectModuleAdjacency(box, instanceWorldBox(other), other.id);
        if (link) {
          neighborId = other.id;
          break;
        }
      }
      transformState.startInstanceAdjacency.set(inst.id, neighborId);
    }
    for (const section of sections) transformState.startSections.set(section.id, cloneSectionParams(section.params));

    setUnderlayStatus(kind === "move" ? "Move (M): click base point..." : "Rotate (R): click pivot point...");
    mountProps();
    return true;
  };

  const restoreTransformStartState = () => {
    for (const w of walls) {
      const p = transformState.startWalls.get(w.id);
      if (p) w.params = JSON.parse(JSON.stringify(p)) as WallParams;
      rebuildWall(w);
    }
    rebuildWallPlanMesh();
    for (const inst of instances) {
      const s = transformState.startInstances.get(inst.id);
      if (s) {
        inst.root.position.copy(s.pos);
        inst.root.rotation.y = s.rotY;
      }
    }
    for (const section of sections) {
      const s = transformState.startSections.get(section.id);
      if (!s) continue;
      section.params = cloneSectionParams(s);
      updateSectionVisual(section);
    }
  };

  const translateWallsByAnchors = (dxMm: number, dzMm: number) => {
    const anchors: Array<{ x: number; z: number }> = [];
    for (const id of transformState.selectedWallIds) {
      const p = transformState.startWalls.get(id);
      if (!p) continue;
      anchors.push({ x: p.aMm.x, z: p.aMm.z }, { x: p.bMm.x, z: p.bMm.z });
    }
    if (anchors.length === 0) return;

    const matchAnchor = (p: { x: number; z: number }) => anchors.some((a) => mmDist(a, p) <= wallJoinTolMm);
    const touched = new Set<string>();
    for (const w of walls) {
      if (pinnedWallIds.has(w.id)) continue;
      let changed = false;
      if (matchAnchor(w.params.aMm)) {
        w.params.aMm = { x: w.params.aMm.x + dxMm, z: w.params.aMm.z + dzMm };
        changed = true;
      }
      if (matchAnchor(w.params.bMm)) {
        w.params.bMm = { x: w.params.bMm.x + dxMm, z: w.params.bMm.z + dzMm };
        changed = true;
      }
      if (changed) touched.add(w.id);
    }
    for (const id of touched) {
      const w = walls.find((x) => x.id === id) ?? null;
      if (w) rebuildWall(w);
    }
    if (touched.size > 0) rebuildWallPlanMesh();
  };

  const applyMoveDelta = (delta: THREE.Vector3) => {
    restoreTransformStartState();

    const dxMm = Math.round(delta.x * 1000);
    const dzMm = Math.round(delta.z * 1000);

    if (dxMm !== 0 || dzMm !== 0) {
      translateWallsByAnchors(dxMm, dzMm);
    }

    for (const id of transformState.selectedSectionIds) {
      const section = sections.find((item) => item.id === id) ?? null;
      const start = transformState.startSections.get(id);
      if (!section || !start) continue;
      section.params.aMm = { x: start.aMm.x + dxMm, z: start.aMm.z + dzMm };
      section.params.bMm = { x: start.bMm.x + dxMm, z: start.bMm.z + dzMm };
      updateSectionVisual(section);
    }

    const ignore = new Set<string>(transformState.selectedInstanceIds);

    // Move modules as a group (no module-to-module snapping here; target snapping comes from cursor snap).
    let ok = true;
    for (const id of transformState.selectedInstanceIds) {
      const inst = findInstance(id);
      const st = transformState.startInstances.get(id);
      if (!inst || !st) continue;
      const desired = st.pos.clone().add(delta);
      const desiredInRoom = applyWallConstraints(inst, desired);
      const snapped =
        transformState.selectedInstanceIds.length === 1
          ? snapPositionDetailed(inst, desiredInRoom, {
              ignoreIds: ignore,
              stickyNeighborId: transformState.startInstanceAdjacency.get(id) ?? null
            }).position
          : desiredInRoom;
      inst.root.position.copy(snapped);
      autoOrientModuleToRoomWallIfSnapped(inst, ignore);
      if (transformState.selectedInstanceIds.length === 1) {
        const actualDelta = inst.root.position.clone().sub(st.pos);
        nudgePinnedModuleChain(inst, actualDelta);
      }
    }
    for (const id of transformState.selectedInstanceIds) {
      const inst = findInstance(id);
      if (!inst) continue;
      const inRoom = instanceFitsRoom(inst);
      const overlaps = anyOverlapIgnoring(inst, ignore);
      if (!inRoom || overlaps || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst)) {
        ok = false;
        break;
      }
    }

    if (ok) {
      for (const inst of instances) {
        if (
          !instanceFitsRoom(inst) ||
          anyOverlap(inst, null) ||
          moduleOverlapsWalls(inst) ||
          moduleOverlapsKitchenWorktops(inst)
        ) {
          ok = false;
          break;
        }
      }
    }

    if (ok) {
      for (const id of transformState.selectedInstanceIds) {
        const inst = findInstance(id);
        if (!inst?.kitchenGroupId) continue;
        const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
        const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
        inst.kitchenPlacement = inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
      }
      transformState.lastValidDelta.copy(delta);
      updateLayoutPanel();
    } else {
      restoreTransformStartState();
      const d = transformState.lastValidDelta;
      const dxMm2 = Math.round(d.x * 1000);
      const dzMm2 = Math.round(d.z * 1000);
      if (dxMm2 !== 0 || dzMm2 !== 0) translateWallsByAnchors(dxMm2, dzMm2);
      for (const id of transformState.selectedInstanceIds) {
        const inst = findInstance(id);
        const st = transformState.startInstances.get(id);
        if (!inst || !st) continue;
        const desired = st.pos.clone().add(d);
        const desiredInRoom = applyWallConstraints(inst, desired);
        const snapped =
          transformState.selectedInstanceIds.length === 1
            ? snapPositionDetailed(inst, desiredInRoom, {
                ignoreIds: ignore,
                stickyNeighborId: transformState.startInstanceAdjacency.get(id) ?? null
              }).position
            : desiredInRoom;
        inst.root.position.copy(snapped);
        autoOrientModuleToRoomWallIfSnapped(inst, ignore);
        if (transformState.selectedInstanceIds.length === 1) {
          const actualDelta = inst.root.position.clone().sub(st.pos);
          nudgePinnedModuleChain(inst, actualDelta);
        }
      }
      updateLayoutPanel();
    }
  };

  const rotatePointAround = (p: THREE.Vector3, pivot: THREE.Vector3, ang: number) => {
    const dx = p.x - pivot.x;
    const dz = p.z - pivot.z;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return new THREE.Vector3(pivot.x + dx * c - dz * s, 0, pivot.z + dx * s + dz * c);
  };

  const rotateWallsByAnchors = (pivot: THREE.Vector3, ang: number) => {
    const anchors: Array<{ old: { x: number; z: number }; next: { x: number; z: number } }> = [];
    for (const id of transformState.selectedWallIds) {
      const p = transformState.startWalls.get(id);
      if (!p) continue;
      const a = fromMmPoint(p.aMm);
      const b = fromMmPoint(p.bMm);
      const na = rotatePointAround(a, pivot, ang);
      const nb = rotatePointAround(b, pivot, ang);
      anchors.push(
        { old: { x: p.aMm.x, z: p.aMm.z }, next: toMmPoint(na) },
        { old: { x: p.bMm.x, z: p.bMm.z }, next: toMmPoint(nb) }
      );
    }
    if (anchors.length === 0) return;

    const mapEnd = (p: { x: number; z: number }) => {
      for (const a of anchors) if (mmDist(a.old, p) <= wallJoinTolMm) return a.next;
      return null;
    };

    const touched = new Set<string>();
    for (const w of walls) {
      if (pinnedWallIds.has(w.id)) continue;
      const na = mapEnd(w.params.aMm);
      const nb = mapEnd(w.params.bMm);
      if (na) {
        w.params.aMm = { x: na.x, z: na.z };
        touched.add(w.id);
      }
      if (nb) {
        w.params.bMm = { x: nb.x, z: nb.z };
        touched.add(w.id);
      }
    }
    for (const id of touched) {
      const w = walls.find((x) => x.id === id) ?? null;
      if (w) rebuildWall(w);
    }
    if (touched.size > 0) rebuildWallPlanMesh();
  };

  const applyRotateAngle = (ang: number) => {
    const pivot = transformState.pivot;
    if (!pivot) return;
    restoreTransformStartState();

    rotateWallsByAnchors(pivot, ang);

    const ignore = new Set<string>(transformState.selectedInstanceIds);
    let ok = true;

    for (const id of transformState.selectedInstanceIds) {
      const inst = findInstance(id);
      const st = transformState.startInstances.get(id);
      if (!inst || !st) continue;
      const nextPos = rotatePointAround(st.pos, pivot, ang);
      inst.root.rotation.y = st.rotY + ang;
      inst.root.position.copy(applyWallConstraints(inst, nextPos));
    }

    for (const id of transformState.selectedInstanceIds) {
      const inst = findInstance(id);
      if (!inst) continue;
      const inRoom = instanceFitsRoom(inst);
      const overlaps = anyOverlapIgnoring(inst, ignore);
      if (!inRoom || overlaps || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst)) {
        ok = false;
        break;
      }
    }

    // Also block rotating walls into any existing module.
    if (ok) {
      for (const inst of instances) {
        if (moduleOverlapsWalls(inst)) {
          ok = false;
          break;
        }
      }
    }

    if (ok) {
      transformState.lastValidAngle = ang;
      updateLayoutPanel();
    } else {
      // Keep last valid
      restoreTransformStartState();
      rotateWallsByAnchors(pivot, transformState.lastValidAngle);
      for (const id of transformState.selectedInstanceIds) {
        const inst = findInstance(id);
        const st = transformState.startInstances.get(id);
        if (!inst || !st) continue;
        const nextPos = rotatePointAround(st.pos, pivot, transformState.lastValidAngle);
        inst.root.rotation.y = st.rotY + transformState.lastValidAngle;
        inst.root.position.copy(applyWallConstraints(inst, nextPos));
      }
      updateLayoutPanel();
    }
  };

  const alignState = {
    ref: null as AlignPickedLine | null,
    hover: null as AlignPickedLine | null,
    lastA: null as AlignPickedLine | null,
    lastB: null as AlignPickedLine | null,
    lastUntilMs: 0
  };

  const trimState = {
    step: "pickTarget" as "pickTarget" | "pickCutter",
    targetWallId: null as string | null,
    targetPick: null as AlignPickedLine | null,
    targetClick: null as THREE.Vector3 | null,
    hover: null as AlignPickedLine | null,
    lastTarget: null as AlignPickedLine | null,
    lastCutter: null as AlignPickedLine | null,
    lastUntilMs: 0
  };

  const distPxPointToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const denom = abx * abx + aby * aby;
    if (denom < 1e-9) return Math.hypot(apx, apy);
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
  };

  const pickAlignLineAt = (hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => {
    const candidates: AlignPickedLine[] = [];

    for (const w of walls) {
      const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
      const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
      const just = w.params.justification ?? "center";
      const s = (w.params.exteriorSign ?? 1) as 1 | -1;
      const center = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
      const d = center.b.clone().sub(center.a);
      if (d.lengthSq() < 1e-10) continue;
      d.normalize();
      const n = new THREE.Vector3(-d.z, 0, d.x);
      const half = Math.max(10, w.params.thicknessMm) / 2000;
      const exteriorA = center.a.clone().addScaledVector(n, s * half);
      const exteriorB = center.b.clone().addScaledVector(n, s * half);
      const interiorA = center.a.clone().addScaledVector(n, -s * half);
      const interiorB = center.b.clone().addScaledVector(n, -s * half);
      candidates.push(
        ...buildWallAlignCandidates({
          wall: w,
          centerA: center.a,
          centerB: center.b,
          exteriorA,
          exteriorB,
          interiorA,
          interiorB
        })
      );
    }

    for (const inst of instances) {
      const polygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
      candidates.push(...buildModuleAlignCandidates(inst, polygon));
    }

    for (const worktop of kitchenWorktops) {
      const path = sanitizeKitchenWorktopPath(worktop.params.path);
      if (path.length < 2) continue;
      const rawPath = path.map(kitchenWorktopPointToWorld);
      const centerPath = getKitchenWorktopGuidePathForAlign(worktop.params, "center");
      const backPath = getKitchenWorktopGuidePathForAlign(worktop.params, "back");
      const frontPath = getKitchenWorktopGuidePathForAlign(worktop.params, "front");
      candidates.push(
        ...buildWorktopAlignCandidates({
          worktop,
          rawPath,
          centerPath,
          backPath,
          frontPath
        })
      );
    }

    return pickBestAlignLine(mousePx, rect, cam(), candidates, 12);
  };

  const lineLineIntersectionXZ = (p1: THREE.Vector3, d1: THREE.Vector3, p2: THREE.Vector3, d2: THREE.Vector3) => {
    const a1x = d1.x;
    const a1z = d1.z;
    const a2x = d2.x;
    const a2z = d2.z;
    const denom = a1x * a2z - a1z * a2x;
    if (Math.abs(denom) < 1e-9) return null as THREE.Vector3 | null;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const t = (dx * a2z - dz * a2x) / denom;
    return new THREE.Vector3(p1.x + a1x * t, 0, p1.z + a1z * t);
  };

  const translateWallAndConnected = (w: WallInstance, dxMm: number, dzMm: number) => {
    const prev = new Map<string, WallParams>();
    for (const ww of walls) prev.set(ww.id, JSON.parse(JSON.stringify(ww.params)) as WallParams);

    const oldA = { x: w.params.aMm.x, z: w.params.aMm.z };
    const oldB = { x: w.params.bMm.x, z: w.params.bMm.z };

    w.params.aMm = { x: w.params.aMm.x + dxMm, z: w.params.aMm.z + dzMm };
    w.params.bMm = { x: w.params.bMm.x + dxMm, z: w.params.bMm.z + dzMm };

    const touched = new Set<string>();
    touched.add(w.id);

    for (const other of walls) {
      if (other.id === w.id) continue;
      if (pinnedWallIds.has(other.id)) continue;
      const wa = wallEndpointWhich(other, oldA, wallJoinTolMm);
      if (wa) {
        if (wa === "a") other.params.aMm = { x: oldA.x + dxMm, z: oldA.z + dzMm };
        else other.params.bMm = { x: oldA.x + dxMm, z: oldA.z + dzMm };
        touched.add(other.id);
      }
      const wb = wallEndpointWhich(other, oldB, wallJoinTolMm);
      if (wb) {
        if (wb === "a") other.params.aMm = { x: oldB.x + dxMm, z: oldB.z + dzMm };
        else other.params.bMm = { x: oldB.x + dxMm, z: oldB.z + dzMm };
        touched.add(other.id);
      }
    }

    for (const id of touched) {
      const ww = walls.find((x) => x.id === id) ?? null;
      if (ww) rebuildWall(ww);
    }
    rebuildWallPlanMesh();

    if (instances.some((i) => moduleOverlapsWalls(i))) {
      for (const ww of walls) {
        const p = prev.get(ww.id);
        if (p) ww.params = JSON.parse(JSON.stringify(p)) as WallParams;
        rebuildWall(ww);
      }
      rebuildWallPlanMesh();
      setUnderlayStatus("Move blocked: wall would overlap a module.");
    }
  };

  const moveWallEndpointAndConnected = (w: WallInstance, which: "a" | "b", dxMm: number, dzMm: number) => {
    const prev = new Map<string, WallParams>();
    for (const ww of walls) prev.set(ww.id, JSON.parse(JSON.stringify(ww.params)) as WallParams);

    const oldP = which === "a" ? { x: w.params.aMm.x, z: w.params.aMm.z } : { x: w.params.bMm.x, z: w.params.bMm.z };
    const nextP = { x: oldP.x + dxMm, z: oldP.z + dzMm };

    const touched = new Set<string>();
    touched.add(w.id);
    if (which === "a") w.params.aMm = nextP;
    else w.params.bMm = nextP;

    for (const other of walls) {
      if (other.id === w.id) continue;
      if (pinnedWallIds.has(other.id)) continue;
      const ww = wallEndpointWhich(other, oldP, wallJoinTolMm);
      if (ww) {
        if (ww === "a") other.params.aMm = nextP;
        else other.params.bMm = nextP;
        touched.add(other.id);
      }
    }

    for (const id of touched) {
      const ww = walls.find((x) => x.id === id) ?? null;
      if (ww) rebuildWall(ww);
    }
    rebuildWallPlanMesh();

    if (instances.some((i) => moduleOverlapsWalls(i))) {
      for (const ww of walls) {
        const p = prev.get(ww.id);
        if (p) ww.params = JSON.parse(JSON.stringify(p)) as WallParams;
        rebuildWall(ww);
      }
      rebuildWallPlanMesh();
      setUnderlayStatus("Move blocked: wall would overlap a module.");
    }
  };

  function snapAxisXZ(a: THREE.Vector3, b: THREE.Vector3, enabled: boolean) {
    if (!enabled) return b;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.abs(dx) >= Math.abs(dz)) return new THREE.Vector3(b.x, b.y, a.z);
    return new THREE.Vector3(a.x, b.y, b.z);
  }

  function toMmPoint(v: THREE.Vector3) {
    return { x: Math.round(v.x * 1000), z: Math.round(v.z * 1000) };
  }

  function fromMmPoint(p: { x: number; z: number }) {
    return new THREE.Vector3(p.x / 1000, 0, p.z / 1000);
  }

  function mmDist(a: { x: number; z: number }, b: { x: number; z: number }) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function wallEndpointWhich(w: WallInstance, p: { x: number; z: number }, tolMm: number): "a" | "b" | null {
    if (mmDist(w.params.aMm, p) <= tolMm) return "a";
    if (mmDist(w.params.bMm, p) <= tolMm) return "b";
    return null;
  }

  function setWallEndpointMm(w: WallInstance, which: "a" | "b", p: { x: number; z: number }) {
    if (which === "a") w.params.aMm = { x: p.x, z: p.z };
    else w.params.bMm = { x: p.x, z: p.z };
    rebuildWall(w);
  }

  function pointOnWallAxisMm(w: WallInstance, p: { x: number; z: number }) {
    const ax = w.params.aMm.x;
    const az = w.params.aMm.z;
    const bx = w.params.bMm.x;
    const bz = w.params.bMm.z;
    const abx = bx - ax;
    const abz = bz - az;
    const apx = p.x - ax;
    const apz = p.z - az;
    const denom = abx * abx + abz * abz;
    if (denom < 1e-6) return { t: 0, closest: { x: ax, z: az }, distMm: Infinity };
    const t = (apx * abx + apz * abz) / denom;
    const tt = Math.max(0, Math.min(1, t));
    const cx = ax + abx * tt;
    const cz = az + abz * tt;
    const distMm = Math.hypot(p.x - cx, p.z - cz);
    return { t: tt, closest: { x: Math.round(cx), z: Math.round(cz) }, distMm };
  }

  function wallDirOutFromNode(w: WallInstance, node: { x: number; z: number }) {
    const a = w.params.aMm;
    const b = w.params.bMm;
    const isA = mmDist(a, node) <= wallJoinTolMm;
    const isB = mmDist(b, node) <= wallJoinTolMm;
    if (isA && !isB) return new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (isB && !isA) return new THREE.Vector3(a.x - b.x, 0, a.z - b.z);
    // fallback: assume node is closer to A
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  }

  function wallExteriorSign(w: WallInstance) {
    return (w.params.exteriorSign ?? 1) as 1 | -1;
  }

  function joinExtensionM(w: WallInstance, node: { x: number; z: number }) {
    // Find best neighbor at node and compute a miter-like extension so faces overlap cleanly.
    const neighbors = walls.filter((x) => x.id !== w.id && (mmDist(x.params.aMm, node) <= wallJoinTolMm || mmDist(x.params.bMm, node) <= wallJoinTolMm));
    if (neighbors.length === 0) return 0;

    const v0 = wallDirOutFromNode(w, node);
    if (v0.lengthSq() < 1e-6) return 0;
    v0.normalize();

    let bestTheta = Infinity;
    for (const n of neighbors) {
      const v1 = wallDirOutFromNode(n, node);
      if (v1.lengthSq() < 1e-6) continue;
      v1.normalize();
      const dot = Math.max(-1, Math.min(1, v0.dot(v1)));
      const theta = Math.acos(dot); // 0..pi
      // ignore nearly straight continuation
      if (theta < 0.2 || Math.abs(Math.PI - theta) < 0.2) continue;
      if (theta < bestTheta) bestTheta = theta;
    }

    if (!isFinite(bestTheta) || bestTheta === Infinity) return 0;

    const thickM = Math.max(0.01, w.params.thicknessMm / 1000);
    const tanHalf = Math.tan(bestTheta / 2);
    if (tanHalf < 1e-4) return 0;
    const ext = (thickM / 2) / tanHalf;
    return Math.min(1.2, Math.max(0, ext));
  }

  function removeWall(w: WallInstance) {
    layoutRoot.remove(w.root);
    w.outline.geometry.dispose();
    (w.outline.material as THREE.Material).dispose();
    w.mesh.geometry.dispose();
    (w.mesh.material as THREE.Material).dispose();
    const idx = walls.indexOf(w);
    if (idx >= 0) walls.splice(idx, 1);
    if (selectedWallId === w.id) selectedWallId = null;
    rebuildWallPlanMesh();
  }

  function splitWallAtMm(w: WallInstance, p: { x: number; z: number }) {
    const which = wallEndpointWhich(w, p, wallJoinTolMm);
    if (which) {
      setWallEndpointMm(w, which, p);
      return;
    }

    const { t, distMm } = pointOnWallAxisMm(w, p);
    if (distMm > wallJoinTolMm) return;
    if (t <= 0.001 || t >= 0.999) return;

    const a = fromMmPoint(w.params.aMm);
    const b = fromMmPoint(w.params.bMm);
    const mid = fromMmPoint(p);
    const thickness = w.params.thicknessMm;
    const materialId = w.params.materialId;

    removeWall(w);
    const w1 = addWall(a, mid, thickness);
    const w2 = addWall(mid, b, thickness);
    if (!w1 || !w2) {
      // rollback best-effort to keep the original wall
      if (w1) removeWall(w1);
      if (w2) removeWall(w2);
      const w0 = addWall(a, b, thickness);
      if (w0) w0.params.materialId = materialId;
      rebuildWallPlanMesh();
      return;
    }
    if (w1) w1.params.materialId = materialId;
    if (w2) w2.params.materialId = materialId;
    rebuildWallPlanMesh();
  }

  function autoJoinAtMmPoint(p: { x: number; z: number }) {
    // Snap endpoints and split any wall that crosses the point (T-joins).
    for (const w of [...walls]) {
      const which = wallEndpointWhich(w, p, wallJoinTolMm);
      if (which) setWallEndpointMm(w, which, p);
      else splitWallAtMm(w, p);
    }
    // Rebuild after edits so joins update.
    for (const w of walls) rebuildWall(w);
    rebuildWallPlanMesh();
  }

  function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function distPointToSegment2(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const denom = abx * abx + aby * aby;
    const t = denom > 1e-9 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom)) : 0;
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { d2: dx * dx + dy * dy, t };
  }

  function pickWallLine2D(raw: THREE.Vector3, rect: DOMRect, camera: THREE.Camera, maxPx = 14): PickedLine2D | null {
    const rawS = worldToScreen(raw, camera, rect);
    let best: { pick: PickedLine2D; d2: number } | null = null;

    const consider = (p: PickedLine2D) => {
      const aS = worldToScreen(p.a, camera, rect);
      const bS = worldToScreen(p.b, camera, rect);
      const { d2, t } = distPointToSegment2(rawS, aS, bS);
      if (d2 > maxPx * maxPx) return;
      if (!best || d2 < best.d2) {
        const dir = p.b.clone().sub(p.a);
        if (dir.lengthSq() < 1e-10) return;
        dir.normalize();
        // closest point on the actual world segment (linear in XZ)
        const closest = p.a.clone().lerp(p.b, t);
        best = { pick: { ...p, p: closest, dir }, d2 };
      }
    };

    for (const w of walls) {
      // centerline (derived)
      const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
      const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
      const just = w.params.justification ?? "center";
      const s = (w.params.exteriorSign ?? 1) as 1 | -1;
      const c = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
      consider({
        wallId: w.id,
        kind: "center",
        a: c.a,
        b: c.b,
        p: c.a,
        dir: new THREE.Vector3(1, 0, 0),
        label: "Centerline"
      });

      // solved outline edges (faces + ends)
      const poly = wallSolvedOutlines.get(w.id) ?? null;
      if (!poly || poly.length < 4) continue;
      const pts = poly.map((p) => new THREE.Vector3(p.x, 0, p.z));
      const edges: Array<{ a: THREE.Vector3; b: THREE.Vector3; kind: "face" | "end"; label: string }> = [
        { a: pts[0], b: pts[1], kind: "end", label: "End" },
        { a: pts[1], b: pts[2], kind: "face", label: "Face" },
        { a: pts[2], b: pts[3], kind: "end", label: "End" },
        { a: pts[3], b: pts[0], kind: "face", label: "Face" }
      ];
      for (const e of edges) {
        consider({
          wallId: w.id,
          kind: e.kind,
          a: e.a,
          b: e.b,
          p: e.a,
          dir: new THREE.Vector3(1, 0, 0),
          label: e.label
        });
      }
    }

    return (best as { pick: PickedLine2D; d2: number } | null)?.pick ?? null;
  }

  function cross2XZ(a: THREE.Vector3, b: THREE.Vector3) {
    return a.x * b.z - a.z * b.x;
  }

  function intersectLinesXZ(
    p: THREE.Vector3,
    r: THREE.Vector3,
    q: THREE.Vector3,
    s: THREE.Vector3
  ): THREE.Vector3 | null {
    const rxs = cross2XZ(r, s);
    if (Math.abs(rxs) < 1e-8) return null;
    const qp = q.clone().sub(p);
    const t = cross2XZ(qp, s) / rxs;
    return new THREE.Vector3(p.x + r.x * t, 0, p.z + r.z * t);
  }

  function bestNeighborAtNode(w: WallInstance, node: { x: number; z: number }) {
    let best: { n: WallInstance; u: THREE.Vector3; theta: number } | null = null;
    const v0 = wallDirOutFromNode(w, node);
    if (v0.lengthSq() < 1e-8) return null;
    v0.normalize();

    for (const other of walls) {
      if (other.id === w.id) continue;
      const isAt =
        mmDist(other.params.aMm, node) <= wallJoinTolMm || mmDist(other.params.bMm, node) <= wallJoinTolMm;
      if (!isAt) continue;
      const u = wallDirOutFromNode(other, node);
      if (u.lengthSq() < 1e-8) continue;
      u.normalize();
      const dot = Math.max(-1, Math.min(1, v0.dot(u)));
      const theta = Math.acos(dot);
      if (theta < 0.2 || Math.abs(Math.PI - theta) < 0.2) continue;
      if (!best || theta < best.theta) best = { n: other, u, theta };
    }

    return best;
  }

  function miterEndCorners(
    w: WallInstance,
    which: "a" | "b"
  ): { outer: THREE.Vector3; inner: THREE.Vector3 } {
    const nodeMm = which === "a" ? w.params.aMm : w.params.bMm;
    const otherMm = which === "a" ? w.params.bMm : w.params.aMm;
    const p = fromMmPoint(nodeMm);
    const q = fromMmPoint(otherMm);

    const v = q.clone().sub(p);
    if (v.lengthSq() < 1e-8) {
      const n0 = new THREE.Vector3(0, 0, 1);
      const h0 = Math.max(1, w.params.thicknessMm / 2) / 1000;
      const s0 = wallExteriorSign(w);
      return {
        outer: p.clone().addScaledVector(n0, s0 * h0),
        inner: p.clone().addScaledVector(n0, -s0 * h0)
      };
    }
    v.normalize();
    const n0 = new THREE.Vector3(-v.z, 0, v.x).normalize();
    const h0 = Math.max(1, w.params.thicknessMm / 2) / 1000;
    const s0 = wallExteriorSign(w);

    const nb = bestNeighborAtNode(w, nodeMm);
    if (!nb) {
      return {
        outer: p.clone().addScaledVector(n0, s0 * h0),
        inner: p.clone().addScaledVector(n0, -s0 * h0)
      };
    }

    const u = nb.u.clone().normalize();
    const n1 = new THREE.Vector3(-u.z, 0, u.x).normalize();
    const h1 = Math.max(1, nb.n.params.thicknessMm / 2) / 1000;
    const s1 = wallExteriorSign(nb.n);

    // Miter corners are intersections of corresponding faces (outer-outer, inner-inner).
    const outer0 = p.clone().addScaledVector(n0, s0 * h0);
    const inner0 = p.clone().addScaledVector(n0, -s0 * h0);
    const outer1 = p.clone().addScaledVector(n1, s1 * h1);
    const inner1 = p.clone().addScaledVector(n1, -s1 * h1);

    const out = intersectLinesXZ(outer0, v, outer1, u) ?? outer0;
    const inn = intersectLinesXZ(inner0, v, inner1, u) ?? inner0;
    return { outer: out, inner: inn };
  }

  function updateWallMesh(
    mesh: THREE.Mesh,
    a: THREE.Vector3 | null,
    b: THREE.Vector3 | null,
    thicknessMm: number,
    heightMm = wallDefault.heightMm
  ) {
    const aa = a ?? new THREE.Vector3(0, 0, 0);
    const bb = b ?? aa.clone();
    const dx = bb.x - aa.x;
    const dz = bb.z - aa.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const midX = (aa.x + bb.x) / 2;
    const midZ = (aa.z + bb.z) / 2;
    const rotY = -Math.atan2(dz, dx);

    const thickM = Math.max(0.01, thicknessMm / 1000);
    const h = Math.max(1, heightMm) / 1000;

    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(len, h, thickM);
    mesh.position.set(midX, h / 2, midZ);
    mesh.rotation.set(0, rotY, 0);
  }

  function rebuildWallPlanMesh() {
    for (const [, line] of wallPlanMeshes) {
      wallPlanGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    wallPlanMeshes.clear();
    for (const m of wallJoinMeshes.splice(0, wallJoinMeshes.length)) {
      wallPlanGroup.remove(m);
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        for (const material of m.material) material.dispose();
      } else {
        m.material.dispose();
      }
    }

    if (walls.length === 0) return;

    const modelWalls = walls.map((w) => ({
      id: w.id,
      a: { x: w.params.aMm.x / 1000, z: w.params.aMm.z / 1000 },
      b: { x: w.params.bMm.x / 1000, z: w.params.bMm.z / 1000 },
      thicknessM: Math.max(0.001, w.params.thicknessMm / 1000),
      justification: ((w.params as any).justification ?? "center") as any,
      exteriorSign: ((w.params.exteriorSign ?? 1) as 1 | -1) ?? 1
    }));

    const solved = solveWallNetwork(modelWalls, { nodeTolM: wallJoinTolMm / 1000, miterLimit: 8 });
    wallSolvedOutlines.clear();
    wallSolvedJoinPolys = solved.joinPolys.map((p) => p.map((q) => ({ x: q.x, z: q.z })));
    wallUnionPolys = null;

    // Always keep per-wall solved outlines for hit-testing/export/debug.
    for (const w of solved.walls) wallSolvedOutlines.set(w.id, w.outline);
    if (selectedKind === "wall" && selectedWallId) showWallSnapMarkersFor(selectedWallId);

    // Render as a single union polygon to automatically trim overlaps/spikes at joins (CAD-like).
    const toRing = (poly: Array<{ x: number; z: number }>) => {
      const ring: Array<[number, number]> = poly.map((p) => [p.x, p.z]);
      if (ring.length > 0) ring.push(ring[0]);
      // Ensure CCW winding
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1];
        area += x0 * y1 - x1 * y0;
      }
      if (area < 0) ring.reverse();
      return ring;
    };

    const polys: any[] = [];
    for (const w of solved.walls) {
      if (w.outline.length < 3) continue;
      polys.push([[[toRing(w.outline)]]]);
    }
    for (const p of solved.joinPolys) {
      if (p.length < 3) continue;
      polys.push([[[toRing(p)]]]);
    }

    let merged: any = null;
    try {
      merged = (polygonClipping as any).union(...polys);
    } catch {
      merged = null;
    }

    if (merged && merged.length > 0) wallUnionPolys = merged;

    const makePlanPolyline = (pts: Array<{ x: number; z: number }>, color: number, y = 0.02) => {
      if (pts.length < 2) return null;
      const linePts = pts.map((p) => new THREE.Vector3(p.x, y, p.z));
      if (pts.length >= 3) linePts.push(new THREE.Vector3(pts[0].x, y, pts[0].z));
      const geom = new THREE.BufferGeometry().setFromPoints(linePts);
      return new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
      );
    };

    const makePlanFillMesh = (rings: Array<Array<[number, number]>>, y = 0.01) => {
      if (!rings || rings.length === 0) return null;

      const toVec2Ring = (ring: Array<[number, number]>) => {
        const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
        return pts.map(([x, z]) => new THREE.Vector2(x, z));
      };

      const outer = toVec2Ring(rings[0]);
      if (outer.length < 3) return null;

      const shape = new THREE.Shape(outer);
      for (const holeRing of rings.slice(1)) {
        const hole = toVec2Ring(holeRing);
        if (hole.length < 3) continue;
        shape.holes.push(new THREE.Path(hole));
      }

      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshBasicMaterial({
          color: 0xb8c0cb,
          transparent: false,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = 6;
      return mesh;
    };

    const fallbackFillSource = [
      ...solved.walls.filter((w) => w.outline.length >= 3).map((w) => [toRing(w.outline)]),
      ...solved.joinPolys.filter((p) => p.length >= 3).map((p) => [toRing(p)])
    ];
    const fillSource = merged && merged.length > 0 ? (merged as Array<Array<Array<[number, number]>>>) : fallbackFillSource;
    for (const rings of fillSource) {
      const mesh = makePlanFillMesh(rings);
      if (!mesh) continue;
      mesh.name = "wallPlanFill";
      wallJoinMeshes.push(mesh);
      wallPlanGroup.add(mesh);
    }

    for (const solvedWall of solved.walls) {
      const line = makePlanPolyline(solvedWall.outline, 0x4f4f4f);
      if (!line) continue;
      line.name = `wallPlan_${solvedWall.id}`;
      line.userData.kind = "wallPlan";
      line.userData.wallId = solvedWall.id;
      line.renderOrder = 20;
      wallPlanMeshes.set(solvedWall.id, line);
      wallPlanGroup.add(line);
    }

    // Debug overlays
    wallDebugGroup.visible = wallDebugEnabled;
    if (wallDebugEnabled) {
      while (wallDebugGroup.children.length > 0) {
        const c = wallDebugGroup.children.pop()!;
        wallDebugGroup.remove(c);
        const any = c as any;
        if (any.geometry?.dispose) any.geometry.dispose();
        if (any.material?.dispose) any.material.dispose();
      }

      const mkLine = (pts: Array<{ x: number; z: number }>, color: number, y = 0.031) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, y, p.z)));
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
        const l = new THREE.Line(g, m);
        wallDebugGroup.add(l);
      };

      // centerlines + outlines
      for (const w of modelWalls) {
        mkLine([w.a, w.b], 0xffd166, 0.031);
        const poly = wallSolvedOutlines.get(w.id);
        if (poly && poly.length >= 3) {
          mkLine([...poly, poly[0]], 0x5c8cff, 0.032);
        }
      }

      // node markers
      for (const n of solved.debug.nodes) {
        const g = new THREE.PlaneGeometry(0.04, 0.04);
        const m = new THREE.MeshBasicMaterial({ color: 0xff4dff, depthWrite: false });
        const p = new THREE.Mesh(g, m);
        p.rotation.x = -Math.PI / 2;
        p.position.set(n.p.x, 0.033, n.p.z);
        wallDebugGroup.add(p);
      }
    }
  }

  function createWallMesh(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number, heightMm = wallDefault.heightMm) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb8c0cb,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, Math.max(1, heightMm) / 1000, thicknessMm / 1000), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    updateWallMeshWithJustification(
      mesh,
      a,
      b,
      thicknessMm,
      wallDefault.justification,
      wallDefault.exteriorSign,
      heightMm
    );
    return mesh;
  }

  function createWallOutline(geometry: THREE.BufferGeometry, wallId?: string) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({
        color: 0x4f5663,
        transparent: true,
        opacity: 0.78,
        depthTest: true,
        depthWrite: false
      })
    );
    outline.renderOrder = 12;
    if (wallId) {
      outline.name = `wallOutline_${wallId}`;
      outline.userData.kind = "wallOutline";
      outline.userData.wallId = wallId;
    }
    return outline;
  }

  function syncWallOutline(w: WallInstance) {
    if (!w.outline || !w.outline.parent) {
      w.outline = createWallOutline(w.mesh.geometry as THREE.BufferGeometry, w.id);
      w.mesh.add(w.outline);
    }
    const nextGeometry = new THREE.EdgesGeometry(w.mesh.geometry as THREE.BufferGeometry, 1);
    w.outline.geometry.dispose();
    w.outline.geometry = nextGeometry;
    w.outline.visible = viewMode === "3d";

    const outlineMaterial = w.outline.material as THREE.LineBasicMaterial;
    outlineMaterial.opacity = viewMode === "3d" ? 0.78 : 0;
  }

  function wallRefLineToCenterLine(
    refA: THREE.Vector3,
    refB: THREE.Vector3,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) {
    if (justification === "center") return { a: refA.clone(), b: refB.clone() };
    const d = refB.clone().sub(refA);
    const len = d.length();
    if (len < 1e-8) return { a: refA.clone(), b: refB.clone() };
    d.multiplyScalar(1 / len);
    const n = new THREE.Vector3(-d.z, 0, d.x);
    const half = Math.max(10, thicknessMm) / 2000; // meters
    const s = exteriorSign;
    const offset =
      justification === "exterior"
        ? n.clone().multiplyScalar(-s * half)
        : n.clone().multiplyScalar(s * half); // interior
    return { a: refA.clone().add(offset), b: refB.clone().add(offset) };
  }

  function updateWallMeshWithJustification(
    mesh: THREE.Mesh,
    refA: THREE.Vector3 | null,
    refB: THREE.Vector3 | null,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1,
    heightMm = wallDefault.heightMm
  ) {
    const a = refA ?? new THREE.Vector3(0, 0, 0);
    const b = refB ?? a.clone();
    const center = wallRefLineToCenterLine(a, b, thicknessMm, justification, exteriorSign);
    updateWallMesh(mesh, center.a, center.b, thicknessMm, heightMm);
  }

  function makeWallPreviewMesh(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) {
    const mesh = createWallMesh(a, b, thicknessMm);
    const m = mesh.material as THREE.MeshBasicMaterial;
    m.transparent = true;
    m.opacity = 0.5;
    return mesh;
  }

  function rebuildWall(w: WallInstance) {
    w.params.heightMm = Math.max(1, Math.round(w.params.heightMm ?? w.heightMm ?? wallDefault.heightMm));
    w.heightMm = w.params.heightMm;
    const meshMaterial = w.mesh.material as THREE.MeshBasicMaterial;
    meshMaterial.color.setHex(0xb8c0cb);
    meshMaterial.transparent = false;
    meshMaterial.opacity = 1;
    meshMaterial.depthWrite = true;
    meshMaterial.side = THREE.DoubleSide;

    const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
    const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
    const just = w.params.justification ?? "center";
    const s = (w.params.exteriorSign ?? 1) as 1 | -1;
    const { a, b } = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
    // Revit-like join rendering in 3D: extend ends to form miter-like corner joins.
    // This does not change stored axis endpoints (aMm/bMm); only the rendered mesh.
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) {
      updateWallMesh(w.mesh, a, b, w.params.thicknessMm, w.params.heightMm);
      return;
    }
    d.normalize();

    const aMmC = toMmPoint(a);
    const bMmC = toMmPoint(b);

    const dirOutCenter = (at: "a" | "b", aa: { x: number; z: number }, bb: { x: number; z: number }) =>
      at === "a" ? new THREE.Vector3(bb.x - aa.x, 0, bb.z - aa.z) : new THREE.Vector3(aa.x - bb.x, 0, aa.z - bb.z);

    const joinExtAt = (node: { x: number; z: number }, at: "a" | "b") => {
      const neighbors: Array<{ v: THREE.Vector3 }> = [];
      for (const other of walls) {
        if (other.id === w.id) continue;
        const oRefA = new THREE.Vector3(other.params.aMm.x / 1000, 0, other.params.aMm.z / 1000);
        const oRefB = new THREE.Vector3(other.params.bMm.x / 1000, 0, other.params.bMm.z / 1000);
        const oJust = other.params.justification ?? "center";
        const oS = (other.params.exteriorSign ?? 1) as 1 | -1;
        const oC = wallRefLineToCenterLine(oRefA, oRefB, other.params.thicknessMm, oJust, oS);
        const oa = toMmPoint(oC.a);
        const ob = toMmPoint(oC.b);
        const isA = mmDist(oa, node) <= wallJoinTolMm;
        const isB = mmDist(ob, node) <= wallJoinTolMm;
        if (!isA && !isB) continue;
        const v = dirOutCenter(isA && !isB ? "a" : "b", oa, ob);
        if (v.lengthSq() > 1e-6) neighbors.push({ v });
      }

      if (neighbors.length === 0) return 0;

      const v0 = dirOutCenter(at, aMmC, bMmC);
      if (v0.lengthSq() < 1e-6) return 0;
      v0.normalize();

      let bestTheta = Infinity;
      for (const n of neighbors) {
        const v1 = n.v.clone().normalize();
        const dot = Math.max(-1, Math.min(1, v0.dot(v1)));
        const theta = Math.acos(dot);
        if (theta < 0.2 || Math.abs(Math.PI - theta) < 0.2) continue;
        if (theta < bestTheta) bestTheta = theta;
      }
      if (!isFinite(bestTheta) || bestTheta === Infinity) return 0;

      const thickM = Math.max(0.01, w.params.thicknessMm / 1000);
      const tanHalf = Math.tan(bestTheta / 2);
      if (tanHalf < 1e-4) return 0;
      const ext = (thickM / 2) / tanHalf;
      return Math.min(1.2, Math.max(0, ext));
    };

    const extA = joinExtAt(aMmC, "a");
    const extB = joinExtAt(bMmC, "b");

    const aExt = a.clone().addScaledVector(d, -extA);
    const bExt = b.clone().addScaledVector(d, extB);
    updateWallMesh(w.mesh, aExt, bExt, w.params.thicknessMm, w.params.heightMm);
    syncWallOutline(w);
  }

  function addWall(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number): WallInstance | null {
    const id = `w${wallCounter++}`;
    const root = new THREE.Group();
    root.name = `wall_${id}`;

    const mesh = createWallMesh(a, b, thicknessMm);
    mesh.name = `wallMesh_${id}`;
    mesh.userData.kind = "wall";
    mesh.userData.wallId = id;
    root.add(mesh);

    const outline = createWallOutline(mesh.geometry as THREE.BufferGeometry, id);
    mesh.add(outline);

    const aMm = toMmPoint(a);
    const bMm = toMmPoint(b);
    const params: WallParams = {
      thicknessMm: Math.max(10, Math.round(thicknessMm)),
      heightMm: wallDefault.heightMm,
      materialId: wallDefault.materialId,
      justification: wallDefault.justification,
      exteriorSign: wallDefault.exteriorSign,
      aMm,
      bMm
    };

    const inst: WallInstance = { id, params, heightMm: params.heightMm, root, mesh, outline };
    layoutRoot.add(root);
    walls.push(inst);
    rebuildWall(inst);
    rebuildWallPlanMesh();

    // Disallow walls intersecting any module (prevents moduleâ†”wall overlap states).
    if (instances.some((i) => moduleOverlapsWalls(i))) {
      // rollback
      layoutRoot.remove(root);
      disposeObject3D(root);
      const idx = walls.findIndex((w) => w.id === id);
      if (idx >= 0) walls.splice(idx, 1);
      rebuildWallPlanMesh();
      setUnderlayStatus("Wall blocked: would overlap a module.");
      return null;
    }

    commitHistory(S);
    return inst;
  }

  const cloneFloorParams = (params: FloorParams): FloorParams => ({
    name: params.name,
    heightMm: params.heightMm,
    thicknessMm: params.thicknessMm,
    materialId: params.materialId ?? floorDefault.materialId,
    boundary: params.boundary.map((p) => ({ x: p.x, z: p.z }))
  });

  const floorMaterialColor = (materialId: string) => {
    if (materialId === "mat_oak_natural" || materialId === "mat_worktop_oak") return 0xb98755;
    if (materialId === "mat_white_melamine") return 0xf1f3f5;
    return 0x9aa3af;
  };

  const makeFloorGeometry = (params: FloorParams) => {
    const points = params.boundary;
    if (points.length < 3) return new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x / 1000, p.z / 1000)));
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1, params.thicknessMm) / 1000,
      bevelEnabled: false
    });
    geom.rotateX(Math.PI / 2);
    return geom;
  };

  const makeFloorOutlineGeometry = (params: FloorParams) => {
    if (params.boundary.length === 0) return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const y = params.heightMm / 1000 + 0.012;
    const pts = params.boundary.map((p) => new THREE.Vector3(p.x / 1000, y, p.z / 1000));
    pts.push(new THREE.Vector3(params.boundary[0].x / 1000, y, params.boundary[0].z / 1000));
    return new THREE.BufferGeometry().setFromPoints(pts);
  };

  function rebuildFloor(floor: FloorInstance) {
    floor.params.heightMm = Math.round(floor.params.heightMm);
    floor.params.thicknessMm = Math.max(1, Math.round(floor.params.thicknessMm));
    floor.params.materialId = floor.params.materialId ?? floorDefault.materialId;
    floor.mesh.geometry.dispose();
    floor.mesh.geometry = makeFloorGeometry(floor.params);
    const mat = floor.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(floorMaterialColor(floor.params.materialId));
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;
    floor.mesh.position.y = floor.params.heightMm / 1000;
    floor.outline.geometry.dispose();
    floor.outline.geometry = makeFloorOutlineGeometry(floor.params);
    floor.outline.position.set(0, 0, 0);
  }

  function createFloor(params: FloorParams, opts?: { id?: string; skipHistory?: boolean }) {
    const id = opts?.id ?? `f${floorCounter++}`;
    if (opts?.id) {
      const m = /^f(\d+)$/.exec(id);
      const n = m ? Number(m[1]) : NaN;
      if (Number.isFinite(n) && n >= floorCounter) floorCounter = n + 1;
    }
    S.floorCounter = floorCounter;

    const root = new THREE.Group();
    root.name = `floor_${id}`;
    const mesh = new THREE.Mesh(
      makeFloorGeometry(params),
      new THREE.MeshBasicMaterial({ color: floorMaterialColor(params.materialId ?? floorDefault.materialId) })
    );
    mesh.name = `floorMesh_${id}`;
    mesh.userData.kind = "floor";
    mesh.userData.floorId = id;
    mesh.renderOrder = 4;
    mesh.position.y = params.heightMm / 1000;
    root.add(mesh);

    const outline = new THREE.Line(
      makeFloorOutlineGeometry(params),
      new THREE.LineBasicMaterial({ color: 0x5c8cff, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false })
    );
    outline.name = `floorOutline_${id}`;
    outline.userData.kind = "floor";
    outline.userData.floorId = id;
    outline.renderOrder = 55;
    outline.visible = true;
    root.add(outline);

    const floor: FloorInstance = { id, params: cloneFloorParams(params), root, mesh, outline };
    layoutRoot.add(root);
    floors.push(floor);
    rebuildFloor(floor);
    if (!opts?.skipHistory) commitHistory(S);
    return floor;
  }

  function deleteFloor(id: string, opts?: { skipHistory?: boolean }) {
    const idx = floors.findIndex((floor) => floor.id === id);
    if (idx < 0) return;
    const floor = floors[idx];
    layoutRoot.remove(floor.root);
    disposeObject3D(floor.root);
    floors.splice(idx, 1);
    if (selectedFloorId === id) selectedFloorId = null;
    if (!opts?.skipHistory) commitHistory(S);
  }

  function restoreFloorsFromSnapshot(nextFloors: Array<{ id: string; params: FloorParams }>, nextCounter?: number) {
    for (const floor of floors.splice(0, floors.length)) {
      layoutRoot.remove(floor.root);
      disposeObject3D(floor.root);
    }
    floorCounter = nextCounter ?? 1;
    S.floorCounter = floorCounter;
    for (const floor of nextFloors) {
      createFloor(cloneFloorParams(floor.params), { id: floor.id, skipHistory: true });
    }
  }

  const cloneSectionParams = (params: SectionParams): SectionParams => ({
    name: params.name,
    aMm: { x: params.aMm.x, z: params.aMm.z },
    bMm: { x: params.bMm.x, z: params.bMm.z },
    mirrored: !!params.mirrored
  });

  const updateSectionVisual = (section: SectionInstance) => {
    const nextParams = cloneSectionParams(section.params);
    section.params = nextParams;

    section.line.geometry.dispose();
    section.arrows.geometry.dispose();
    section.pick.geometry.dispose();

    const geom = buildSectionMarkerGeometry(nextParams);
    section.line.geometry = geom.line;
    section.arrows.geometry = geom.arrows;
    section.pick.geometry = createSectionPickGeometry(nextParams);

    const selected = selectedKind === "section" && selectedSectionId === section.id;
    (section.line.material as THREE.LineBasicMaterial).color.setHex(selected ? 0x2ac46d : 0x253245);
    (section.arrows.material as THREE.LineBasicMaterial).color.setHex(selected ? 0x2ac46d : 0x253245);
    const visible = mode === "layout" && viewMode === "2d" && activeViewerTab === "floorplan";
    section.root.visible = visible;
  };

  const getNextSectionName = () => `Section ${Math.max(1, sections.length + 1)}`;

  const createSectionInstance = (params: SectionParams, opts?: { id?: string; skipHistory?: boolean }) => {
    const id = opts?.id ?? `s${sectionCounter++}`;
    if (opts?.id) {
      const match = /^s(\d+)$/.exec(id);
      if (match) sectionCounter = Math.max(sectionCounter, Number(match[1]) + 1);
    }
    S.sectionCounter = sectionCounter;

    const root = new THREE.Group();
    root.name = `section_${id}`;

    const line = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x253245, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
    );
    line.name = `sectionLine_${id}`;
    line.renderOrder = 62;
    line.userData.kind = "section";
    line.userData.sectionId = id;
    line.frustumCulled = false;
    root.add(line);

    const arrows = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x253245, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
    );
    arrows.name = `sectionArrows_${id}`;
    arrows.renderOrder = 63;
    arrows.userData.kind = "section";
    arrows.userData.sectionId = id;
    arrows.frustumCulled = false;
    root.add(arrows);

    const pick = new THREE.Mesh(
      new THREE.PlaneGeometry(0.001, 0.001),
      new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
    );
    pick.name = `sectionPick_${id}`;
    pick.userData.kind = "section";
    pick.userData.sectionId = id;
    root.add(pick);

    const section: SectionInstance = { id, params: cloneSectionParams(params), root, line, arrows, pick };
    layoutRoot.add(root);
    sections.push(section);
    updateSectionVisual(section);
    refreshViewerTabs();
    if (!opts?.skipHistory) commitHistory(S);
    return section;
  };

  const deleteSectionInstance = (id: string, opts?: { skipHistory?: boolean }) => {
    const index = sections.findIndex((section) => section.id === id);
    if (index < 0) return;
    const section = sections[index]!;
    layoutRoot.remove(section.root);
    disposeObject3D(section.root);
    sections.splice(index, 1);
    if (selectedSectionId === id) selectedSectionId = null;
    if (activeViewerTab === `section:${id}`) activeViewerTab = "floorplan";
    updateAllSectionVisuals();
    if (!opts?.skipHistory) commitHistory(S);
  };

  const restoreSectionsFromSnapshot = (nextSections: Array<{ id: string; params: SectionParams }>, nextCounter?: number) => {
    for (const section of sections.splice(0, sections.length)) {
      layoutRoot.remove(section.root);
      disposeObject3D(section.root);
    }
    sectionCounter = nextCounter ?? 1;
    S.sectionCounter = sectionCounter;
    for (const section of nextSections) {
      createSectionInstance(cloneSectionParams(section.params), { id: section.id, skipHistory: true });
    }
  };

  const applyAlignBetweenPickedLines = (ref: AlignPickedLine, picked: AlignPickedLine) => {
    if (!areAlignLinesParallel(ref, picked)) {
      return { ok: false, reason: "Align: lines must be parallel." };
    }

    const shift = getAlignShiftVector(ref, picked);
    const dxMm = Math.round(shift.x * 1000);
    const dzMm = Math.round(shift.z * 1000);
    if (dxMm === 0 && dzMm === 0) {
      return { ok: false, reason: "Align: already aligned." };
    }

    if (picked.targetKind === "wall") {
      const w = picked.wallId ? walls.find((x) => x.id === picked.wallId) ?? null : null;
      if (!w) return { ok: false, reason: "Align: wall not found." };
      if (pinnedWallIds.has(w.id)) return { ok: false, reason: "Align: target wall is pinned." };
      if (picked.lineRole === "endA" || picked.lineRole === "endB") {
        moveWallEndpointAndConnected(w, picked.lineRole === "endA" ? "a" : "b", dxMm, dzMm);
      } else {
        translateWallAndConnected(w, dxMm, dzMm);
      }
      return { ok: true, reason: "Align: done. Click reference line..." };
    }

    if (picked.targetKind === "module") {
      const aligned = !!(picked.instanceId && translateModuleByMeasure(picked.instanceId, dxMm, dzMm));
      return { ok: aligned, reason: aligned ? "Align: done. Click reference line..." : "Align: module move blocked." };
    }

    const aligned = alignKitchenWorktopLine(picked, dxMm, dzMm);
    return { ok: aligned, reason: aligned ? "Align: done. Click reference line..." : "Align: worktop move blocked." };
  };

  const cloneKitchenWorktopParams = (params: KitchenWorktopParams): KitchenWorktopParams => ({
    path: params.path.map((point) => ({ x: point.x, z: point.z })),
    justification: params.justification,
    mirrored: !!params.mirrored,
    depthMm: params.depthMm,
    thicknessMm: params.thicknessMm,
    heightMm: params.heightMm,
    overhangSideMm: params.overhangSideMm,
    materialId: params.materialId
  });

  const makeKitchenWorktopMaterial = (materialId: string, opts?: { preview?: boolean }) => {
    const preview = getMaterialDefinitionById(materialId)?.preview;
    return new THREE.MeshStandardMaterial({
      color: preview?.colorHex ?? "#b08e6d",
      roughness: preview?.roughness ?? 0.78,
      metalness: preview?.metalness ?? 0.02,
      side: THREE.DoubleSide,
      transparent: !!opts?.preview,
      opacity: opts?.preview ? 0.52 : 1
    });
  };

  const kitchenWorktopOutlineColor = (materialId: string) => {
    const color = new THREE.Color(getMaterialDefinitionById(materialId)?.preview.colorHex ?? "#b08e6d");
    return color.offsetHSL(0, 0, -0.24).getHex();
  };

  const getKitchenWorktopBackGuidePath = (
    params: KitchenWorktopParams,
    backOffsetMm = S.kitchenCtx.worktopBackOffsetMm
  ) => {
    const path = sanitizeKitchenWorktopPath(params.path);
    if (path.length < 2) return [] as THREE.Vector3[];

    const pathWorld = path.map(kitchenWorktopPointToWorld);
    if (pathWorld.length < 2) return [] as THREE.Vector3[];

    let pathOffsetM = Math.max(0, backOffsetMm) / 1000;
    if (params.justification === "center") pathOffsetM -= Math.max(1, params.depthMm) / 2000;
    else if (params.justification === "front") pathOffsetM -= Math.max(1, params.depthMm) / 1000;
    if (params.mirrored) pathOffsetM *= -1;

    return offsetKitchenWorktopPath(pathWorld, pathOffsetM);
  };

  const getKitchenWorktopGuidePathForAlign = (
    params: KitchenWorktopParams,
    role: "center" | "back" | "front"
  ) => {
    const path = sanitizeKitchenWorktopPath(params.path);
    if (path.length < 2) return [] as THREE.Vector3[];
    const pathWorld = path.map(kitchenWorktopPointToWorld);
    if (pathWorld.length < 2) return [] as THREE.Vector3[];
    const depthM = Math.max(1, params.depthMm) / 1000;
    let offsetM = 0;
    if (params.justification === "center") {
      if (role === "back") offsetM = depthM / 2;
      else if (role === "front") offsetM = -depthM / 2;
    } else if (params.justification === "back") {
      if (role === "center") offsetM = -depthM / 2;
      else if (role === "front") offsetM = -depthM;
    } else {
      if (role === "center") offsetM = depthM / 2;
      else if (role === "back") offsetM = depthM;
    }
    if (params.mirrored) offsetM *= -1;
    return Math.abs(offsetM) < 1e-9 ? pathWorld : offsetKitchenWorktopPath(pathWorld, offsetM);
  };

  const makeKitchenWorktopGeometry = (params: KitchenWorktopParams) => {
    const polygon = getKitchenWorktopPolygon(params);
    if (polygon.length < 3) return new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const shape = new THREE.Shape(polygon.map((point) => new THREE.Vector2(point.x, point.z)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1, params.thicknessMm) / 1000,
      bevelEnabled: false
    });
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };

  const makeKitchenWorktopPreviewGeometry = (params: KitchenWorktopParams) => {
    const polygon = getKitchenWorktopPolygon(params);
    if (polygon.length < 3) return new THREE.PlaneGeometry(0.001, 0.001);
    const shape = new THREE.Shape(polygon.map((point) => new THREE.Vector2(point.x, point.z)));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };

  const makeKitchenWorktopOutlineGeometry = (params: KitchenWorktopParams, flattenToPlan = true) => {
    if (flattenToPlan) {
      const polygon = getKitchenWorktopPolygon(params);
      if (polygon.length === 0) {
        return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      }
      const points = polygon.map((point) => new THREE.Vector3(point.x, 0.012, point.z));
      points.push(points[0]!.clone());
      return new THREE.BufferGeometry().setFromPoints(points);
    }
    const geometry = makeKitchenWorktopGeometry(params);
    const edges = new THREE.EdgesGeometry(geometry, 1);
    geometry.dispose();
    return edges;
  };

  const makeKitchenWorktopBackGuideGeometry = (params: KitchenWorktopParams) => {
    const guide = getKitchenWorktopBackGuidePath(params);
    if (guide.length < 2) {
      return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    }
    return new THREE.BufferGeometry().setFromPoints(guide.map((point) => new THREE.Vector3(point.x, 0.018, point.z)));
  };

  function rebuildKitchenWorktop(inst: KitchenWorktopInstance) {
    inst.params = cloneKitchenWorktopParams(inst.params);
    inst.params.path = sanitizeKitchenWorktopPath(inst.params.path);
    inst.params.depthMm = Math.max(1, Math.round(inst.params.depthMm));
    inst.params.thicknessMm = Math.max(1, Math.round(inst.params.thicknessMm));
    inst.params.heightMm = Math.round(inst.params.heightMm);
    inst.params.overhangSideMm = Math.max(0, Math.round(inst.params.overhangSideMm));

    inst.mesh.geometry.dispose();
    inst.mesh.geometry = makeKitchenWorktopGeometry(inst.params);
    const prevMaterial = inst.mesh.material as THREE.Material;
    inst.mesh.material = makeKitchenWorktopMaterial(inst.params.materialId);
    prevMaterial.dispose();
    inst.mesh.position.y = inst.params.heightMm / 1000;
    inst.mesh.castShadow = true;
    inst.mesh.receiveShadow = true;
    inst.mesh.visible = true;
    inst.root.visible = true;

    const flattenWorktopOutline = !(viewMode === "2d" && activeViewerTab !== "floorplan");
    inst.outline.geometry.dispose();
    inst.outline.geometry = makeKitchenWorktopOutlineGeometry(inst.params, flattenWorktopOutline);
    const outlineMaterial = inst.outline.material as THREE.LineBasicMaterial;
    outlineMaterial.color.setHex(kitchenWorktopOutlineColor(inst.params.materialId));
    inst.outline.position.set(0, inst.params.heightMm / 1000 + (flattenWorktopOutline ? 0.0015 : 0), 0);
    inst.outline.visible = viewMode === "2d";
    const meshMaterial = inst.mesh.material as THREE.MeshStandardMaterial;
    meshMaterial.transparent = viewMode === "2d";
    meshMaterial.opacity = viewMode === "2d" ? 0.35 : 1;
    meshMaterial.depthWrite = viewMode !== "2d";
    inst.root.updateMatrixWorld(true);
  }

  function createKitchenWorktop(
    params: KitchenWorktopParams,
    kitchenGroupId: string,
    opts?: { id?: string; skipHistory?: boolean }
  ) {
    const id = opts?.id ?? `wt${worktopCounter++}`;
    if (opts?.id) {
      const match = /^wt(\d+)$/.exec(id);
      if (match) worktopCounter = Math.max(worktopCounter, Number(match[1]) + 1);
    }

    const root = new THREE.Group();
    root.name = `kitchenWorktopRoot_${id}`;
    root.userData.kind = "kitchenWorktop";
    root.userData.worktopId = id;
    root.userData.kitchenGroupId = kitchenGroupId;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), makeKitchenWorktopMaterial(params.materialId));
    mesh.name = `kitchenWorktopMesh_${id}`;
    mesh.renderOrder = 16;
    mesh.frustumCulled = false;
    mesh.userData.kind = "kitchenWorktop";
    mesh.userData.worktopId = id;
    mesh.userData.kitchenGroupId = kitchenGroupId;
    root.add(mesh);

    const outline = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: kitchenWorktopOutlineColor(params.materialId),
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false
      })
    );
    outline.name = `kitchenWorktopOutline_${id}`;
    outline.renderOrder = 60;
    outline.frustumCulled = false;
    outline.userData.kind = "kitchenWorktopOutline";
    outline.userData.worktopId = id;
    outline.userData.kitchenGroupId = kitchenGroupId;
    root.add(outline);

    const inst: KitchenWorktopInstance = {
      id,
      kitchenGroupId,
      params: cloneKitchenWorktopParams(params),
      root,
      mesh,
      outline
    };

    layoutRoot.add(root);
    kitchenWorktops.push(inst);
    S.worktopCounter = worktopCounter;
    rebuildKitchenWorktop(inst);
    if (!opts?.skipHistory) commitHistory(S);
    return inst;
  }

  function removeKitchenWorktop(id: string, opts?: { skipHistory?: boolean }) {
    const index = kitchenWorktops.findIndex((worktop) => worktop.id === id);
    if (index < 0) return;
    const worktop = kitchenWorktops[index]!;
    layoutRoot.remove(worktop.root);
    disposeObject3D(worktop.root);
    kitchenWorktops.splice(index, 1);
    if (!opts?.skipHistory) commitHistory(S);
  }

  function restoreKitchenWorktopsFromSnapshot(
    nextWorktops: Array<{ id: string; kitchenGroupId: string; params: KitchenWorktopParams }>,
    nextCounter?: number
  ) {
    for (const worktop of kitchenWorktops.splice(0, kitchenWorktops.length)) {
      layoutRoot.remove(worktop.root);
      disposeObject3D(worktop.root);
    }
    worktopCounter = nextCounter ?? 1;
    S.worktopCounter = worktopCounter;
    for (const worktop of nextWorktops) {
      createKitchenWorktop(cloneKitchenWorktopParams(worktop.params), worktop.kitchenGroupId, {
        id: worktop.id,
        skipHistory: true
      });
    }
  }

  const makeKitchenWorktopParamsFromPath = (path: FloorBoundaryPoint[]): KitchenWorktopParams => ({
    path: sanitizeKitchenWorktopPath(path),
    justification: kitchenWorktopDraw.justification,
    mirrored: kitchenWorktopDraw.mirrored,
    depthMm: S.kitchenCtx.worktopDepthMm,
    thicknessMm: S.kitchenCtx.worktopThicknessMm,
    heightMm: S.kitchenCtx.heightMm,
    overhangSideMm: S.kitchenCtx.worktopOverhangSideMm,
    materialId: S.kitchenCtx.worktopMaterialId
  });

  const updateKitchenWorktopPreview = () => {
    if (!kitchenWorktopDraw.active || kitchenWorktopDraw.points.length === 0) return;

    const hoverPoint =
      kitchenWorktopDraw.hoverPoint &&
      Math.hypot(
        kitchenWorktopDraw.hoverPoint.x - (kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1]?.x ?? 0),
        kitchenWorktopDraw.hoverPoint.z - (kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1]?.z ?? 0)
      ) >= 1
        ? kitchenWorktopDraw.hoverPoint
        : null;
    const previewPath =
      hoverPoint
        ? [...kitchenWorktopDraw.points, hoverPoint]
        : [...kitchenWorktopDraw.points];
    const params = makeKitchenWorktopParamsFromPath(previewPath);
    if (params.path.length < 2) return;
    const signature = JSON.stringify({
      path: params.path,
      justification: params.justification,
      mirrored: params.mirrored,
      depthMm: params.depthMm,
      heightMm: params.heightMm,
      materialId: params.materialId
    });

    if (!kitchenWorktopDraw.previewRoot || !kitchenWorktopDraw.previewMesh || !kitchenWorktopDraw.previewOutline || !kitchenWorktopDraw.previewBackLine) {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(makeKitchenWorktopPreviewGeometry(params), makeKitchenWorktopMaterial(params.materialId, { preview: true }));
      (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      mesh.frustumCulled = false;
      const outline = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: kitchenWorktopOutlineColor(params.materialId),
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false
        })
      );
      outline.frustumCulled = false;
      const backLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0x00c2ff,
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false
        })
      );
      backLine.frustumCulled = false;
      backLine.renderOrder = 61;
      root.name = "kitchenWorktopPreview";
      root.add(mesh);
      root.add(outline);
      root.add(backLine);
      kitchenWorktopDraw.previewRoot = root;
      kitchenWorktopDraw.previewMesh = mesh;
      kitchenWorktopDraw.previewOutline = outline;
      kitchenWorktopDraw.previewBackLine = backLine;
      layoutRoot.add(root);
    }

    if (kitchenWorktopDraw.previewSignature !== signature) {
      kitchenWorktopDraw.previewMesh.geometry.dispose();
      kitchenWorktopDraw.previewMesh.geometry = makeKitchenWorktopPreviewGeometry(params);

      kitchenWorktopDraw.previewOutline.geometry.dispose();
      kitchenWorktopDraw.previewOutline.geometry = makeKitchenWorktopOutlineGeometry(params);

      kitchenWorktopDraw.previewBackLine.geometry.dispose();
      kitchenWorktopDraw.previewBackLine.geometry = makeKitchenWorktopBackGuideGeometry(params);
      kitchenWorktopDraw.previewSignature = signature;
    }
    if (kitchenWorktopDraw.previewMaterialId !== params.materialId) {
      const previewMaterial = kitchenWorktopDraw.previewMesh.material as THREE.Material;
      kitchenWorktopDraw.previewMesh.material = makeKitchenWorktopMaterial(params.materialId, { preview: true });
      (kitchenWorktopDraw.previewMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      previewMaterial.dispose();
      kitchenWorktopDraw.previewMaterialId = params.materialId;
    }
    kitchenWorktopDraw.previewMesh.position.y = params.heightMm / 1000;
    kitchenWorktopDraw.previewMesh.visible = true;

    kitchenWorktopDraw.previewOutline.position.set(0, params.heightMm / 1000 + 0.0015, 0);
    (kitchenWorktopDraw.previewOutline.material as THREE.LineBasicMaterial).color.setHex(kitchenWorktopOutlineColor(params.materialId));
    kitchenWorktopDraw.previewOutline.visible = true;

    kitchenWorktopDraw.previewBackLine.position.set(0, params.heightMm / 1000 + 0.0015, 0);
    kitchenWorktopDraw.previewBackLine.visible = true;

    kitchenWorktopDraw.previewRoot.visible = true;
    kitchenWorktopDraw.previewRoot.updateMatrixWorld(true);
  };

  const scheduleKitchenWorktopPreviewUpdate = () => {
    if (kitchenWorktopDraw.previewUpdatePending) return;
    kitchenWorktopDraw.previewUpdatePending = true;
    requestAnimationFrame(() => {
      kitchenWorktopDraw.previewUpdatePending = false;
      updateKitchenWorktopPreview();
    });
  };

  const cancelKitchenWorktopDraw = (opts?: { silent?: boolean }) => {
    kitchenWorktopDraw.active = false;
    kitchenWorktopDraw.mirrored = false;
    worktopDrawSnap = null;
    kitchenWorktopDraw.points = [];
    kitchenWorktopDraw.hoverPoint = null;
    kitchenWorktopDraw.typedMm = "";
    kitchenWorktopDraw.previewUpdatePending = false;
    kitchenWorktopDraw.previewSignature = "";
    kitchenWorktopDraw.previewMaterialId = "";
    if (kitchenWorktopDraw.previewRoot) {
      layoutRoot.remove(kitchenWorktopDraw.previewRoot);
      disposeObject3D(kitchenWorktopDraw.previewRoot);
      kitchenWorktopDraw.previewRoot = null;
      kitchenWorktopDraw.previewMesh = null;
      kitchenWorktopDraw.previewOutline = null;
      kitchenWorktopDraw.previewBackLine = null;
    }
    hideHoverCursor();
    showWallSnapMarkersFor(selectedKind === "wall" ? selectedWallId : null);
    wallTypedHud.textContent = "";
    wallTypedHud.style.display = "none";
    if (!opts?.silent) {
      setUnderlayStatus("");
      mountProps();
    }
  };

  const getKitchenGroupWorktops = (groupId: string) =>
    kitchenWorktops
      .filter((worktop) => worktop.kitchenGroupId === groupId)
      .map((worktop) => ({ id: worktop.id, params: cloneKitchenWorktopParams(worktop.params) }));

  const replaceKitchenGroupWorktops = (
    groupId: string,
    nextWorktops: Array<{ id: string; params: KitchenWorktopParams }>,
    opts?: { skipHistory?: boolean }
  ) => {
    for (let index = kitchenWorktops.length - 1; index >= 0; index -= 1) {
      const worktop = kitchenWorktops[index]!;
      if (worktop.kitchenGroupId !== groupId) continue;
      removeKitchenWorktop(worktop.id, { skipHistory: true });
    }
    for (const worktop of nextWorktops) {
      createKitchenWorktop(cloneKitchenWorktopParams(worktop.params), groupId, {
        id: worktop.id,
        skipHistory: true
      });
    }
    if (!opts?.skipHistory) commitHistory(S);
  };

  const rebuildKitchenGroupWorktops = (groupId: string, ctx = S.kitchenCtx) => {
    for (const worktop of kitchenWorktops) {
      if (worktop.kitchenGroupId !== groupId) continue;
      worktop.params.depthMm = ctx.worktopDepthMm;
      worktop.params.thicknessMm = ctx.worktopThicknessMm;
      worktop.params.heightMm = ctx.heightMm;
      worktop.params.overhangSideMm = ctx.worktopOverhangSideMm;
      worktop.params.materialId = ctx.worktopMaterialId;
      rebuildKitchenWorktop(worktop);
    }
  };

  const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const kitchenBackAnchorName = "__kitchen_back_anchor";
  const kitchenCornerAnchorName = "__kitchen_corner_anchor";
  const kitchenCornerXAnchorName = "__kitchen_corner_x_anchor";
  const kitchenCornerZAnchorName = "__kitchen_corner_z_anchor";
  const kitchenAnchorMaxDistanceM = 0.18;
  const kitchenAnchorMaxAngleDeltaRad = Math.PI / 3;

  const normalizeAngleRad = (angle: number) => {
    let next = angle;
    while (next <= -Math.PI) next += Math.PI * 2;
    while (next > Math.PI) next -= Math.PI * 2;
    return next;
  };

  const getModuleLocalBackCenter = (inst: LayoutInstance) => {
    inst.root.updateMatrixWorld(true);
    const anchor = inst.module.getObjectByName(kitchenBackAnchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return new THREE.Vector3((inst.localBox.min.x + inst.localBox.max.x) * 0.5, 0, inst.localBox.min.z);
  };

  const isCornerKitchenModule = (instOrParams: LayoutInstance | ModuleParams) => {
    const maybeParams = "params" in instOrParams ? instOrParams.params : instOrParams;
    return (
      maybeParams !== null &&
      typeof maybeParams === "object" &&
      "type" in maybeParams &&
      maybeParams.type === "corner_shelf_lower"
    );
  };

  const moduleStaysOutsideKitchenWorktop = (instOrParams: LayoutInstance | ModuleParams) =>
    staysOutsideKitchenWorktopFootprint(
      ("params" in instOrParams ? instOrParams.params : instOrParams) as Record<string, unknown>
    );

  const getKitchenModulePlacementY = (instOrParams: LayoutInstance | ModuleParams, groupId?: string | null) => {
    const params = ("params" in instOrParams ? instOrParams.params : instOrParams) as Record<string, unknown>;
    if (getKitchenModuleRole(params) !== "upper") return 0;
    const effectiveGroupId = groupId ?? ("kitchenGroupId" in instOrParams ? instOrParams.kitchenGroupId : null);
    const group = effectiveGroupId ? S.kitchenGroups.find((item) => item.id === effectiveGroupId) ?? null : null;
    const ctx = group?.ctx ?? S.kitchenCtx;
    return ctx.upperStartHeightMm / 1000;
  };

  const getModuleLocalKitchenCornerAnchor = (inst: LayoutInstance) => {
    inst.root.updateMatrixWorld(true);
    const anchor = inst.module.getObjectByName(kitchenCornerAnchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.min.z);
  };

  const getModuleLocalKitchenCornerAxisAnchor = (inst: LayoutInstance, axis: "x" | "z") => {
    inst.root.updateMatrixWorld(true);
    const anchorName = axis === "x" ? kitchenCornerXAnchorName : kitchenCornerZAnchorName;
    const anchor = inst.module.getObjectByName(anchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return axis === "x"
      ? new THREE.Vector3(inst.localBox.max.x, 0, inst.localBox.min.z)
      : new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.max.z);
  };

  const getModuleKitchenCornerExtents = (inst: LayoutInstance) => {
    const corner = getModuleLocalKitchenCornerAnchor(inst);
    const xAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "x");
    const zAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "z");
    return {
      corner,
      xLength: Math.max(0.001, xAnchor.clone().sub(corner).length()),
      zLength: Math.max(0.001, zAnchor.clone().sub(corner).length())
    };
  };

  const getModuleLocalKitchenAnchor = (inst: LayoutInstance) =>
    isCornerKitchenModule(inst) ? getModuleLocalKitchenCornerAnchor(inst) : getModuleLocalBackCenter(inst);

  const getModuleWorldKitchenAnchor = (inst: LayoutInstance) => getModuleLocalKitchenAnchor(inst).applyMatrix4(inst.root.matrixWorld);

  const preserveWorldKitchenAnchor = (inst: LayoutInstance, previousWorldAnchor: THREE.Vector3) => {
    const nextWorldAnchor = getModuleWorldKitchenAnchor(inst);
    if (isCornerKitchenModule(inst)) {
      const delta = previousWorldAnchor.clone().sub(nextWorldAnchor);
      delta.y = 0;
      if (delta.lengthSq() <= 1e-12) return;
      inst.root.position.add(delta);
      inst.root.position.y = getKitchenModulePlacementY(inst);
      inst.root.updateMatrixWorld(true);
      return;
    }

    const frontDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, inst.root.rotation.y, 0)).normalize();
    const deltaDepth = previousWorldAnchor.clone().sub(nextWorldAnchor).dot(frontDir);
    if (Math.abs(deltaDepth) <= 1e-9) return;
    inst.root.position.addScaledVector(frontDir, deltaDepth);
    inst.root.position.y = getKitchenModulePlacementY(inst);
    inst.root.updateMatrixWorld(true);
  };

  let measureStateRef:
    | ReturnType<typeof createMeasureTools>["measureState"]
    | null = null;

  const getAssociativeMeasureContext = (): AssociativeMeasureContext => ({
    walls,
    instances,
    floors,
    worktops: kitchenWorktops,
    measures: (measureStateRef?.measures ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      aBinding: item.aBinding,
      bBinding: item.bBinding
    })),
    getModuleLocalBackCenter,
    getKitchenWorktopPolygon
  });

  const bindingFromPlanSnap = (snapped: PlanSnapResult | null, fallbackPoint: THREE.Vector3): PlanSnapBinding =>
    snapped?.binding ?? toFreePlanBinding(fallbackPoint);

  const snapPoint2D = createPlanSnapper({
    getWalls: () => walls,
    getInstances: () => instances,
    getFloors: () => floors,
    getKitchenWorktops: () => kitchenWorktops,
    getMeasureGuides: () => buildMeasureGuides(getAssociativeMeasureContext()),
    getWallSolvedOutlines: () => wallSolvedOutlines,
    getWallSolvedJoinPolys: () => wallSolvedJoinPolys,
    getWallUnionPolys: () => wallUnionPolys,
    getLayoutTool: () => layoutTool,
    getWallChainStart: () => wallDraw.chainStart,
    getModuleLocalBackCenter,
    getKitchenWorktopPolygon
  });

  const getKitchenGuideSegmentInfo = (
    worktop: KitchenWorktopInstance,
    segmentIndex: number,
    backOffsetMm: number
  ) => {
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    if (guidePath.length < 2) return null;
    const safeIndex = clampNumber(segmentIndex, 0, guidePath.length - 2);
    const start = guidePath[safeIndex]!;
    const end = guidePath[safeIndex + 1]!;
    const segment = end.clone().sub(start);
    segment.y = 0;
    const length = segment.length();
    if (length < 1e-6) return null;
    const dir = segment.clone().multiplyScalar(1 / length);
    const frontNormal = new THREE.Vector3(-dir.z, 0, dir.x);
    if (worktop.params.mirrored) frontNormal.multiplyScalar(-1);
    const rotationY = Math.atan2(frontNormal.x, frontNormal.z);
    return { start, end, dir, length, frontNormal, rotationY };
  };

  const getKitchenCornerPlacementInfo = (
    worktop: KitchenWorktopInstance,
    cornerIndex: number,
    backOffsetMm: number,
    inst: LayoutInstance
  ) => {
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    if (guidePath.length < 3) return null;
    const safeCornerIndex = clampNumber(cornerIndex, 1, guidePath.length - 2);
    const prev = guidePath[safeCornerIndex - 1]!;
    const corner = guidePath[safeCornerIndex]!;
    const next = guidePath[safeCornerIndex + 1]!;
    const prevVec = prev.clone().sub(corner);
    const nextVec = next.clone().sub(corner);
    prevVec.y = 0;
    nextVec.y = 0;
    const prevLength = prevVec.length();
    const nextLength = nextVec.length();
    if (prevLength < 1e-6 || nextLength < 1e-6) return null;

    const prevDir = prevVec.clone().multiplyScalar(1 / prevLength);
    const nextDir = nextVec.clone().multiplyScalar(1 / nextLength);
    if (Math.abs(prevDir.dot(nextDir)) > 0.999) return null;

    const cornerExtents = getModuleKitchenCornerExtents(inst);
    const localCorner = cornerExtents.corner;
    const tryAssignment = (xDir: THREE.Vector3, zDir: THREE.Vector3, xLength: number, zLength: number) => {
      const rotationY = Math.atan2(zDir.x, zDir.z);
      const rotatedX = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, rotationY, 0)).normalize();
      const rotatedZ = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotationY, 0)).normalize();
      if (rotatedX.dot(xDir) < 0.999 || rotatedZ.dot(zDir) < 0.999) return null;
      const rotatedCorner = localCorner.clone().applyEuler(new THREE.Euler(0, rotationY, 0));
      const position = corner.clone().sub(rotatedCorner);
      position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
      return {
        binding: {
          kind: "corner" as const,
          worktopId: worktop.id,
          segmentIndex: safeCornerIndex - 1,
          offsetAlongM: 0,
          cornerIndex: safeCornerIndex
        },
        corner,
        position,
        rotationY,
        valid: xLength + 1e-6 >= cornerExtents.xLength && zLength + 1e-6 >= cornerExtents.zLength
      };
    };

    return (
      tryAssignment(prevDir, nextDir, prevLength, nextLength) ??
      tryAssignment(nextDir, prevDir, nextLength, prevLength)
    );
  };

  const getKitchenCornerArmBindingInfo = (inst: LayoutInstance, backOffsetMm: number) => {
    if (!isCornerKitchenModule(inst)) return null;
    const binding = inst.kitchenPlacement;
    if (!binding || (binding.kind ?? "segment") !== "corner") return null;

    const worktop = kitchenWorktops.find((item) => item.id === binding.worktopId) ?? null;
    if (!worktop) return null;

    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    const cornerIndex = Math.max(1, Math.min(binding.cornerIndex ?? 1, guidePath.length - 2));
    const cornerPoint = guidePath[cornerIndex];
    const prevPoint = guidePath[cornerIndex - 1];
    const nextPoint = guidePath[cornerIndex + 1];
    if (!cornerPoint || !prevPoint || !nextPoint) return null;

    const prevDir = prevPoint.clone().sub(cornerPoint).setY(0);
    const nextDir = nextPoint.clone().sub(cornerPoint).setY(0);
    if (prevDir.lengthSq() < 1e-8 || nextDir.lengthSq() < 1e-8) return null;
    prevDir.normalize();
    nextDir.normalize();

    const localCorner = getModuleLocalKitchenCornerAnchor(inst);
    const localXAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "x");
    const localZAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "z");
    const worldCorner = localCorner.clone().applyMatrix4(inst.root.matrixWorld);
    const xDir = localXAnchor.clone().applyMatrix4(inst.root.matrixWorld).sub(worldCorner).setY(0);
    const zDir = localZAnchor.clone().applyMatrix4(inst.root.matrixWorld).sub(worldCorner).setY(0);
    if (xDir.lengthSq() < 1e-8 || zDir.lengthSq() < 1e-8) return null;
    xDir.normalize();
    zDir.normalize();

    const resolveSegmentIndex = (axisDir: THREE.Vector3) => {
      const prevDot = axisDir.dot(prevDir);
      const nextDot = axisDir.dot(nextDir);
      if (prevDot >= nextDot && prevDot > 0.9) return cornerIndex - 1;
      if (nextDot > 0.9) return cornerIndex;
      return null;
    };

    const extents = getModuleKitchenCornerExtents(inst);
    return {
      worktopId: binding.worktopId,
      cornerIndex,
      xSegmentIndex: resolveSegmentIndex(xDir),
      zSegmentIndex: resolveSegmentIndex(zDir),
      xLengthM: extents.xLength,
      zLengthM: extents.zLength
    };
  };

  const getKitchenSegmentReservedMargins = (
    groupId: string | null,
    worktopId: string,
    segmentIndex: number,
    backOffsetMm: number,
    ignoreInstanceId?: string | null
  ) => {
    if (!groupId) return { startM: 0, endM: 0 };
    let startM = 0;
    let endM = 0;

    for (const other of instances) {
      if (other.id === ignoreInstanceId || other.kitchenGroupId !== groupId || !isCornerKitchenModule(other)) continue;
      const armInfo = getKitchenCornerArmBindingInfo(other, backOffsetMm);
      if (!armInfo || armInfo.worktopId !== worktopId) continue;

      if (armInfo.xSegmentIndex === segmentIndex) {
        if (segmentIndex < armInfo.cornerIndex) endM = Math.max(endM, armInfo.xLengthM);
        else startM = Math.max(startM, armInfo.xLengthM);
      }
      if (armInfo.zSegmentIndex === segmentIndex) {
        if (segmentIndex < armInfo.cornerIndex) endM = Math.max(endM, armInfo.zLengthM);
        else startM = Math.max(startM, armInfo.zLengthM);
      }
    }

    return { startM, endM };
  };

  const inferKitchenPlacementBinding = (
    inst: LayoutInstance,
    groupId: string,
    backOffsetMm: number
  ): KitchenPlacementBinding | null => {
    if (moduleStaysOutsideKitchenWorktop(inst)) return null;
    const groupWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === groupId);
    if (groupWorktops.length === 0) return null;

    if (isCornerKitchenModule(inst)) {
      const localCorner = getModuleLocalKitchenCornerAnchor(inst);
      const worldCorner = localCorner.clone().applyMatrix4(inst.root.matrixWorld).setY(0);
      let best:
        | {
            binding: KitchenPlacementBinding;
            distanceSq: number;
            angleDelta: number;
          }
        | null = null;

      for (const worktop of groupWorktops) {
        const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
        for (let cornerIndex = 1; cornerIndex < guidePath.length - 1; cornerIndex += 1) {
          const info = getKitchenCornerPlacementInfo(worktop, cornerIndex, backOffsetMm, inst);
          if (!info) continue;
          const distanceSq = info.corner.distanceToSquared(worldCorner);
          const angleDelta = Math.abs(normalizeAngleRad(info.rotationY - inst.root.rotation.y));
          if (
            !best ||
            distanceSq < best.distanceSq - 1e-9 ||
            (Math.abs(distanceSq - best.distanceSq) < 1e-9 && angleDelta < best.angleDelta)
          ) {
            best = {
              binding: info.binding,
              distanceSq,
              angleDelta
            };
          }
        }
      }

      if (!best) return null;
      if (Math.sqrt(best.distanceSq) > kitchenAnchorMaxDistanceM) return null;
      if (best.angleDelta > kitchenAnchorMaxAngleDeltaRad) return null;
      return best.binding;
    }

    const localBackCenter = getModuleLocalBackCenter(inst);
    const worldBackCenter = localBackCenter.clone().applyMatrix4(inst.root.matrixWorld).setY(0);
    let best:
      | {
          binding: KitchenPlacementBinding;
          distanceSq: number;
          angleDelta: number;
        }
      | null = null;

    for (const worktop of groupWorktops) {
      for (let segmentIndex = 0; segmentIndex < getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm).length - 1; segmentIndex += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, segmentIndex, backOffsetMm);
        if (!info) continue;
        const reserved = getKitchenSegmentReservedMargins(groupId, worktop.id, segmentIndex, backOffsetMm, inst.id);
        const halfModuleWidthM = Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
        const minAlong = reserved.startM + halfModuleWidthM;
        const maxAlong = info.length - reserved.endM - halfModuleWidthM;
        if (maxAlong + 1e-6 < minAlong) continue;
        const cursorOffset = worldBackCenter.clone().sub(info.start);
        const projected = clampNumber(cursorOffset.dot(info.dir), minAlong, maxAlong);
        const closestOnGuide = info.start.clone().addScaledVector(info.dir, projected);
        const distanceSq = closestOnGuide.distanceToSquared(worldBackCenter);
        const angleDelta = Math.abs(normalizeAngleRad(info.rotationY - inst.root.rotation.y));

        if (
          !best ||
          distanceSq < best.distanceSq - 1e-9 ||
          (Math.abs(distanceSq - best.distanceSq) < 1e-9 && angleDelta < best.angleDelta)
        ) {
          best = {
            binding: {
              worktopId: worktop.id,
              segmentIndex,
              offsetAlongM: projected
            },
            distanceSq,
            angleDelta
          };
        }
      }
    }

    if (!best) return null;
    if (Math.sqrt(best.distanceSq) > kitchenAnchorMaxDistanceM) return null;
    if (best.angleDelta > kitchenAnchorMaxAngleDeltaRad) return null;
    return best.binding;
  };

  const applyKitchenPlacementBinding = (
    inst: LayoutInstance,
    binding: KitchenPlacementBinding,
    backOffsetMm: number
  ) => {
    const worktop = kitchenWorktops.find((item) => item.id === binding.worktopId);
    if (!worktop) return false;

    if ((binding.kind ?? "segment") === "corner" || (isCornerKitchenModule(inst) && binding.cornerIndex != null)) {
      const info = getKitchenCornerPlacementInfo(
        worktop,
        binding.cornerIndex ?? binding.segmentIndex + 1,
        backOffsetMm,
        inst
      );
      if (!info) return false;
      inst.root.rotation.y = info.rotationY;
      inst.root.position.copy(info.position);
      inst.root.position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
      inst.root.updateMatrixWorld(true);
      inst.kitchenPlacement = { ...info.binding };
      return true;
    }

    const info = getKitchenGuideSegmentInfo(worktop, binding.segmentIndex, backOffsetMm);
    if (!info) return false;

    const localBackCenter = getModuleLocalBackCenter(inst);
    const halfModuleWidthM = Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
    const reserved = getKitchenSegmentReservedMargins(inst.kitchenGroupId ?? worktop.kitchenGroupId, worktop.id, binding.segmentIndex, backOffsetMm, inst.id);
    const minAlong = reserved.startM + halfModuleWidthM;
    const maxAlong = info.length - reserved.endM - halfModuleWidthM;
    if (maxAlong + 1e-6 < minAlong) return false;
    const clampedAlong =
      clampNumber(binding.offsetAlongM, minAlong, maxAlong);
    const backCenter = info.start.clone().addScaledVector(info.dir, clampedAlong);
    const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, info.rotationY, 0));

    inst.root.rotation.y = info.rotationY;
    inst.root.position.copy(backCenter.clone().sub(rotatedBackCenter));
    inst.root.position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
    inst.root.updateMatrixWorld(true);
    inst.kitchenPlacement = {
      worktopId: binding.worktopId,
      segmentIndex: binding.segmentIndex,
      offsetAlongM: clampedAlong
    };
    return true;
  };

  const rebuildKitchenGroupLayout = (
    groupId: string,
    nextCtx: ReturnType<typeof resolveContext>,
    prevCtx: ReturnType<typeof resolveContext> = nextCtx
  ) => {
    const bindings = new Map<string, KitchenPlacementBinding>();

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = inst.kitchenPlacement ?? inferKitchenPlacementBinding(inst, groupId, prevCtx.worktopBackOffsetMm);
      if (!binding) continue;
      bindings.set(inst.id, { ...binding });
      inst.kitchenPlacement = { ...binding };
    }

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      applyKitchenContextToModuleParams(inst.params, nextCtx);
      rebuildInstance(inst, { skipLayoutValidation: true, preserveBackAnchor: true });
    }

    rebuildKitchenGroupWorktops(groupId, nextCtx);

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = bindings.get(inst.id) ?? inst.kitchenPlacement;
      if (binding && applyKitchenPlacementBinding(inst, binding, nextCtx.worktopBackOffsetMm)) continue;
      inst.kitchenPlacement = inferKitchenPlacementBinding(inst, groupId, nextCtx.worktopBackOffsetMm);
    }

    updateLayoutPanel();
  };

  const getTallKitchenPlacementConstraint = (
    ghost: LayoutInstance,
    cursorWorld: THREE.Vector3,
    activeWorktops: KitchenWorktopInstance[],
    backOffsetMm: number
  ) => {
    if (!moduleStaysOutsideKitchenWorktop(ghost)) return null;

    const localBackCenter = getModuleLocalBackCenter(ghost);
    const halfModuleWidthM = Math.max(0.001, (ghost.localBox.max.x - ghost.localBox.min.x) * 0.5);
    let cursorOnWorktop = false;
    let closestGuideDistanceSq = Number.POSITIVE_INFINITY;
    let best:
      | {
          position: THREE.Vector3;
          rotationY: number;
          distanceSq: number;
        }
      | null = null;

    for (const worktop of activeWorktops) {
      const polygon = getKitchenWorktopPolygon(worktop.params);
      if (polygon.length >= 3 && pointInPolygonXZ({ x: cursorWorld.x, z: cursorWorld.z }, polygon.map((point) => ({ x: point.x, z: point.z })))) {
        cursorOnWorktop = true;
      }

      const firstInfo = getKitchenGuideSegmentInfo(worktop, 0, backOffsetMm);
      const lastGuidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      const lastInfo = lastGuidePath.length >= 2 ? getKitchenGuideSegmentInfo(worktop, lastGuidePath.length - 2, backOffsetMm) : null;
      const edgeCandidates = [
        firstInfo
          ? {
              edgePoint: firstInfo.start.clone().addScaledVector(firstInfo.dir, -halfModuleWidthM),
              rotationY: firstInfo.rotationY
            }
          : null,
        lastInfo
          ? {
              edgePoint: lastInfo.start.clone().addScaledVector(lastInfo.dir, lastInfo.length + halfModuleWidthM),
              rotationY: lastInfo.rotationY
            }
          : null
      ].filter((candidate): candidate is { edgePoint: THREE.Vector3; rotationY: number } => candidate != null);

      if (firstInfo) {
        const projected = clampNumber(cursorWorld.clone().sub(firstInfo.start).dot(firstInfo.dir), 0, firstInfo.length);
        const closestOnGuide = firstInfo.start.clone().addScaledVector(firstInfo.dir, projected);
        closestGuideDistanceSq = Math.min(closestGuideDistanceSq, closestOnGuide.distanceToSquared(cursorWorld));
      }
      if (lastInfo) {
        const projected = clampNumber(cursorWorld.clone().sub(lastInfo.start).dot(lastInfo.dir), 0, lastInfo.length);
        const closestOnGuide = lastInfo.start.clone().addScaledVector(lastInfo.dir, projected);
        closestGuideDistanceSq = Math.min(closestGuideDistanceSq, closestOnGuide.distanceToSquared(cursorWorld));
      }

      for (const candidate of edgeCandidates) {
        const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, candidate.rotationY, 0));
        const position = candidate.edgePoint.clone().sub(rotatedBackCenter);
        position.y = 0;
        const distanceSq = candidate.edgePoint.distanceToSquared(cursorWorld);
        if (!best || distanceSq < best.distanceSq) {
          best = {
            position,
            rotationY: candidate.rotationY,
            distanceSq
          };
        }
      }
    }

    if (!best) return null;
    if (!cursorOnWorktop && Math.sqrt(closestGuideDistanceSq) > 0.45) return null;

    return {
      kitchenPlacement: null,
      position: best.position,
      rotationY: best.rotationY,
      valid: true,
      enforceRoomBounds: true,
      enforceWallOverlap: true,
      statusText: "Placement: Tall modul sa prisnapne vedľa pracovnej dosky."
    };
  };

  const getKitchenPlacementConstraint = (ghost: LayoutInstance, cursorWorld: THREE.Vector3) => {
    if (!S.kitchenEditMode || !S.activeKitchenGroupId) return null;

    const activeWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === S.activeKitchenGroupId);
    if (activeWorktops.length === 0) return null;
    const activeGroup = S.kitchenGroups.find((group) => group.id === S.activeKitchenGroupId) ?? null;
    const backOffsetMm = activeGroup?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;

    if (moduleStaysOutsideKitchenWorktop(ghost)) {
      return getTallKitchenPlacementConstraint(ghost, cursorWorld, activeWorktops, backOffsetMm);
    }

    if (isCornerKitchenModule(ghost)) {
      let best:
        | {
            binding: KitchenPlacementBinding;
            position: THREE.Vector3;
            rotationY: number;
            valid: boolean;
            distance: number;
          }
        | null = null;

      for (const worktop of activeWorktops) {
        const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
        for (let cornerIndex = 1; cornerIndex < guidePath.length - 1; cornerIndex += 1) {
          const info = getKitchenCornerPlacementInfo(worktop, cornerIndex, backOffsetMm, ghost);
          if (!info) continue;
          const distance = info.corner.distanceToSquared(cursorWorld);
          if (!best || distance < best.distance) {
            best = {
              binding: info.binding,
              position: info.position,
              rotationY: info.rotationY,
              valid: info.valid,
              distance
            };
          }
        }
      }

      if (!best) {
        return {
          kitchenPlacement: null,
          position: ghost.root.position.clone(),
          rotationY: ghost.root.rotation.y,
          valid: false,
          enforceRoomBounds: false,
          enforceWallOverlap: false,
          statusText: "Placement: Corner sa dá vložiť len do rohu pracovnej dosky."
        };
      }

      return {
        kitchenPlacement: best.binding,
        position: best.position,
        rotationY: best.rotationY,
        valid: best.valid,
        enforceRoomBounds: false,
        enforceWallOverlap: false,
        statusText: best.valid
          ? "Placement: Corner sa viaže len na roh back línie pracovnej dosky."
          : "Placement: Corner sa zmestí len do rohu s dostatočne dlhými ramenami."
      };
    }

    const localBackCenter = getModuleLocalBackCenter(ghost);
    const halfModuleWidthM = Math.max(0.001, (ghost.localBox.max.x - ghost.localBox.min.x) * 0.5);

    let best:
      | {
          binding: KitchenPlacementBinding;
          position: THREE.Vector3;
          rotationY: number;
          valid: boolean;
          distance: number;
        }
      | null = null;

    for (const worktop of activeWorktops) {
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      if (guidePath.length < 2) continue;

      for (let index = 0; index < guidePath.length - 1; index += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, index, backOffsetMm);
        if (!info) continue;
        const reserved = getKitchenSegmentReservedMargins(S.activeKitchenGroupId, worktop.id, index, backOffsetMm, ghost.id);
        const minAlong = reserved.startM + halfModuleWidthM;
        const maxAlong = info.length - reserved.endM - halfModuleWidthM;
        if (maxAlong + 1e-6 < minAlong) continue;
        const guideStart = info.start;
        const cursorOffset = cursorWorld.clone().sub(guideStart);
        const projected = cursorOffset.dot(info.dir);
        const closestOnGuide = guideStart.clone().addScaledVector(info.dir, clampNumber(projected, 0, info.length));
        const backCenterDistance = closestOnGuide.distanceToSquared(cursorWorld);
        const clampedAlongGuide = clampNumber(projected, minAlong, maxAlong);
        const backCenter = guideStart.clone().addScaledVector(info.dir, clampedAlongGuide);
        const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, info.rotationY, 0));
        const position = backCenter.clone().sub(rotatedBackCenter);
        position.y = 0;

        if (!best || backCenterDistance < best.distance) {
          best = {
            binding: {
              worktopId: worktop.id,
              segmentIndex: index,
              offsetAlongM: clampedAlongGuide
            },
            position,
            rotationY: info.rotationY,
            valid: true,
            distance: backCenterDistance
          };
        }
      }
    }

    if (!best) return null;
    best.position.y = getKitchenModulePlacementY(ghost, S.activeKitchenGroupId);
    return {
      kitchenPlacement: best.binding,
      position: best.position,
      rotationY: best.rotationY,
      valid: best.valid,
      enforceRoomBounds: false,
      enforceWallOverlap: false,
      statusText: best.valid
        ? "Placement: modul sa hýbe po back línii pod pracovnou doskou."
        : "Placement: modul je príliš široký pre zvolený úsek pracovnej dosky."
    };
  };

  const startKitchenWorktopDraw = () => {
    if (!S.kitchenEditMode || !S.activeKitchenGroupId) return;
    cancelKitchenWorktopDraw({ silent: true });
    if (placement.active) cancelPlacement(S, placementHelpers);
    ensureFloorplanViewerTab();
    kitchenWorktopDraw.active = true;
    kitchenWorktopDraw.mirrored = false;
    worktopDrawSnap = null;
    selectedKind = null;
    selectedWallId = null;
    selectedFloorId = null;
    selectedInstanceId = null;
    selectedWallIds.clear();
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    syncSelectionState();
    updateSelectionHighlights();
    setUnderlayStatus("Pracovná doska: klikaj body tvaru. Píš mm + Enter pre dĺžku segmentu. Esc = potvrdiť hotový tvar.");
    mountProps();
  };

  const appendKitchenWorktopPoint = (point: FloorBoundaryPoint) => {
    const prev = kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1] ?? null;
    if (prev && Math.hypot(point.x - prev.x, point.z - prev.z) < 5) return false;

    if (kitchenWorktopDraw.points.length === 0) {
      kitchenWorktopDraw.points = [point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      scheduleKitchenWorktopPreviewUpdate();
      setUnderlayStatus("Pracovná doska: druhý klik = ďalší bod. Píš mm + Enter.");
      return true;
    }

    if (kitchenWorktopDraw.points.length === 1) {
      kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      wallTypedHud.style.display = "none";
      scheduleKitchenWorktopPreviewUpdate();
      setUnderlayStatus("Pracovná doska: pokračuj ďalším bodom alebo Esc = potvrdiť.");
      return true;
    }

    if (kitchenWorktopDraw.points.length === 2) {
      kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      wallTypedHud.style.display = "none";
      updateKitchenWorktopPreview();
      setUnderlayStatus("Pracovná doska: pokračuj ďalším rohom alebo Esc = potvrdiť tvar.");
      return true;
    }

    kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
    kitchenWorktopDraw.hoverPoint = point;
    kitchenWorktopDraw.typedMm = "";
    wallTypedHud.style.display = "none";
    scheduleKitchenWorktopPreviewUpdate();
    setUnderlayStatus("Pracovná doska: ďalší klik = ďalší roh, Esc = potvrdiť hotový tvar.");
    return true;
  };

  const commitKitchenWorktopTypedLength = () => {
    if (!kitchenWorktopDraw.active || kitchenWorktopDraw.points.length === 0) return false;
    const mm = Math.max(1, Math.round(Number(kitchenWorktopDraw.typedMm)));
    if (!Number.isFinite(mm)) return false;

    const start = kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1];
    if (!start) return false;
    const startWorld = kitchenWorktopPointToWorld(start);
    const hover = kitchenWorktopDraw.hoverPoint ?? { x: start.x + 1000, z: start.z };
    const hoverWorld = kitchenWorktopPointToWorld(hover);
    const dir = hoverWorld.clone().sub(startWorld);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    const endWorld = startWorld.clone().addScaledVector(dir, mm / 1000);
    const rawPoint = { x: Math.round(endWorld.x * 1000), z: Math.round(endWorld.z * 1000) };
    const point = floorOrthoPoint(start, rawPoint);
    return appendKitchenWorktopPoint(point);
  };

  const mirrorKitchenWorktopDraw = () => {
    kitchenWorktopDraw.mirrored = !kitchenWorktopDraw.mirrored;
    scheduleKitchenWorktopPreviewUpdate();
    setUnderlayStatus(
      `Pracovná doska: zrkadlenie ${kitchenWorktopDraw.mirrored ? "ZAP" : "VYP"} okolo ${kitchenWorktopDraw.justification.toUpperCase()} line.`
    );
  };

  const updateSectionDrawPreview = () => {
    if (!sectionDraw.a || !sectionDraw.hoverPoint) {
      if (sectionDraw.previewRoot) sectionDraw.previewRoot.visible = false;
      return;
    }
    if (!sectionDraw.previewRoot) {
      sectionDraw.previewRoot = new THREE.Group();
      sectionDraw.previewRoot.name = "sectionDrawPreview";
      sectionDraw.previewLine = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
      );
      sectionDraw.previewLine.renderOrder = 66;
      sectionDraw.previewArrows = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
      );
      sectionDraw.previewArrows.renderOrder = 67;
      sectionDraw.previewRoot.add(sectionDraw.previewLine, sectionDraw.previewArrows);
      layoutRoot.add(sectionDraw.previewRoot);
    }
    const params: SectionParams = {
      name: "",
      aMm: { x: sectionDraw.a.x, z: sectionDraw.a.z },
      bMm: { x: sectionDraw.hoverPoint.x, z: sectionDraw.hoverPoint.z },
      mirrored: sectionDraw.mirrored
    };
    const geom = buildSectionMarkerGeometry(params);
    sectionDraw.previewLine!.geometry.dispose();
    sectionDraw.previewLine!.geometry = geom.line;
    sectionDraw.previewArrows!.geometry.dispose();
    sectionDraw.previewArrows!.geometry = geom.arrows;
    const color = sectionDraw.axisLocked ? 0x2ac46d : 0x3ddc97;
    (sectionDraw.previewLine!.material as THREE.LineBasicMaterial).color.setHex(color);
    (sectionDraw.previewArrows!.material as THREE.LineBasicMaterial).color.setHex(color);
    sectionDraw.previewRoot.visible = true;
  };

  const cancelSectionDraw = (opts?: { silent?: boolean }) => {
    sectionDraw.active = false;
    sectionDraw.mirrored = false;
    sectionDraw.axisLocked = false;
    sectionDraw.a = null;
    sectionDraw.hoverPoint = null;
    sectionDrawSnap = null;
    if (sectionDraw.previewRoot) {
      layoutRoot.remove(sectionDraw.previewRoot);
      disposeObject3D(sectionDraw.previewRoot);
      sectionDraw.previewRoot = null;
      sectionDraw.previewLine = null;
      sectionDraw.previewArrows = null;
    }
    hideHoverCursor();
    drawSnapOverlay.hide();
    if (!opts?.silent) {
      setUnderlayStatus("");
      mountProps();
    }
  };

  const commitSectionDraw = (bMm: FloorBoundaryPoint) => {
    if (!sectionDraw.a) return false;
    if (Math.hypot(bMm.x - sectionDraw.a.x, bMm.z - sectionDraw.a.z) < 5) return false;
    const section = createSectionInstance({
      name: getNextSectionName(),
      aMm: { x: sectionDraw.a.x, z: sectionDraw.a.z },
      bMm,
      mirrored: sectionDraw.mirrored
    });
    cancelSectionDraw({ silent: true });
    setSelectedSection(section.id);
    activateViewerTab(`section:${section.id}`);
    setUnderlayStatus(`Section ${section.params.name} created.`);
    mountProps();
    return true;
  };

  const handleKitchenWorktopEscape = () => {
    if (!kitchenWorktopDraw.active) return false;
    if (kitchenWorktopDraw.points.length < 2) {
      cancelKitchenWorktopDraw({ silent: true });
      setUnderlayStatus("Pracovná doska: zrušené.");
      mountProps();
      return true;
    }
    const groupId = S.activeKitchenGroupId;
    if (!groupId) {
      cancelKitchenWorktopDraw({ silent: true });
      mountProps();
      return true;
    }
    const params = makeKitchenWorktopParamsFromPath(kitchenWorktopDraw.points);
    if (params.path.length < 2) {
      cancelKitchenWorktopDraw({ silent: true });
      mountProps();
      return true;
    }
    const existingId = getKitchenGroupWorktops(groupId)[0]?.id ?? `wt${worktopCounter}`;
    replaceKitchenGroupWorktops(groupId, [{ id: existingId, params }], { skipHistory: false });
    cancelKitchenWorktopDraw({ silent: true });
    setUnderlayStatus(params.path.length >= 3 ? "Rohová pracovná doska vytvorená." : "Pracovná doska vytvorená.");
    mountProps();
    return true;
  };

  const wallEps = 0.002;
  const wallDefs: Record<
    WallId,
    {
      plane: THREE.Plane;
      inwardNormal: THREE.Vector3;
      axis: "x" | "z";
      fixedPos: THREE.Vector3;
      axisHalf: number;
    }
  > = {
    back: {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -roomBounds.halfD)
      ),
      inwardNormal: new THREE.Vector3(0, 0, 1),
      axis: "x",
      fixedPos: new THREE.Vector3(0, 0, -roomBounds.halfD + wallEps),
      axisHalf: roomBounds.halfW
    },
    left: {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-roomBounds.halfW, 0, 0)
      ),
      inwardNormal: new THREE.Vector3(1, 0, 0),
      axis: "z",
      fixedPos: new THREE.Vector3(-roomBounds.halfW + wallEps, 0, 0),
      axisHalf: roomBounds.halfD
    },
    right: {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(roomBounds.halfW, 0, 0)
      ),
      inwardNormal: new THREE.Vector3(-1, 0, 0),
      axis: "z",
      fixedPos: new THREE.Vector3(roomBounds.halfW - wallEps, 0, 0),
      axisHalf: roomBounds.halfD
    }
  };

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.08 };
  const pointerNdc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const dragState = {
    active: false,
    id: null as string | null,
    offset: new THREE.Vector3(),
    lastValid: new THREE.Vector3()
  };

  const underlayDragState = {
    active: false,
    pointerId: null as number | null,
    startWorld: new THREE.Vector3(),
    startOffsetMm: { x: 0, z: 0 }
  };

  const windowDragState = {
    active: false,
    wall: null as WallId | null,
    offsetMm: 0
  };

  const navClock = new THREE.Clock();
  const isTypingTarget = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((el as any).isContentEditable) return true;
    return false;
  };

  const isEscapeKey = (ev: KeyboardEvent) => ev.key === "Escape" || ev.code === "Escape";
  const resetViewBtn = args.viewerEl.querySelector("#resetViewBtn") as HTMLButtonElement | null;
  viewNavigation = createViewNavigation({
    viewerEl: args.viewerEl,
    canvasEl: renderer.domElement,
    resetViewButton: resetViewBtn,
    getCamera: cam,
    getControls: ctl,
    getState: () => ({ mode, viewMode, activeViewerTab }),
    isTypingTarget,
    isInteractionBlocked: () =>
      dragState.active ||
      windowDragState.active ||
      Boolean(wallEditHud.drag) ||
      marquee.active ||
      marquee.pending ||
      floorEdit.active ||
      underlayDragState.active ||
      !!transformState.kind,
    getSceneBounds: () => getNavigationSceneBounds(),
    refreshDetailView: () => {
      activeDetailClipPlanes = [];
      updateDetailViewCamera();
      updateDetailSliceOverlay();
    }
  });
  detailViewPanOffset = viewNavigation.detailViewPanOffset;
  viewNavigation.syncControls();

  const handleGlobalMeasurementClear = (ev: KeyboardEvent) => {
    if (!ev.shiftKey || !isEscapeKey(ev)) return false;
    if (measureState.measures.length === 0 && !measureState.firstPoint && !measureState.hoverPoint) return false;
    clearAllMeasurements();
    measureState.firstPoint = null;
    measureState.firstBinding = null;
    measureState.hoverPoint = null;
    measureState.hoverSnap = "none";
    clearPreview();
    clearToolHud();
    measurePlanSnap = null;
    resetMeasureSnapCycle();
    hideHoverCursor();
    setFirstPointMarker(null);
    args.measureReadoutEl.textContent = measureState.enabled ? "Measure: klikni prvý bod." : "";
    setUnderlayStatus("Measurements cleared.");
    ev.preventDefault();
    ev.stopPropagation();
    return true;
  };

  const handleLayoutEscape = (ev: KeyboardEvent) => {
    if (mode !== "layout") return false;

    if (isTypingTarget(ev.target)) return false;

    if (layoutTool === "align") {
      if (alignState.ref) {
        alignState.ref = null;
        setUnderlayStatus("Align: canceled. Click reference line...");
      } else {
        setToolSelect();
      }
      ev.preventDefault();
      return true;
    }

    if (layoutTool === "trim") {
      if (trimState.step !== "pickTarget") {
        trimState.step = "pickTarget";
        trimState.targetWallId = null;
        trimState.targetPick = null;
        trimState.targetClick = null;
        trimState.hover = null;
        trimState.lastTarget = null;
        trimState.lastCutter = null;
        trimState.lastUntilMs = 0;
        clearToolHud();
        setUnderlayStatus("Trim: click target wall...");
        mountProps();
      } else {
        setToolSelect();
      }
      ev.preventDefault();
      return true;
    }

    if (layoutTool === "measure") {
      measureState.enabled = false;
      measureState.firstPoint = null;
      measureState.firstBinding = null;
      measureState.hoverPoint = null;
      measureState.hoverSnap = "none";
      clearPreview();
      clearToolHud();
      hideHoverCursor();
      setFirstPointMarker(null);
      setToolSelect();
      setUnderlayStatus("Measure: stopped.");
      ev.preventDefault();
      return true;
    }

    if (layoutTool === "dimension") {
      if (dimensionState.picked.length > 0) {
        technicalDimensions.resetDraft();
        setUnderlayStatus("Kóta: výber zrušený. Vyber prvú čiaru.");
      } else {
        setToolSelect();
        setUnderlayStatus("Kóta: stopped.");
      }
      ev.preventDefault();
      return true;
    }

    if (layoutTool === "section") {
      if (sectionDraw.a) {
        sectionDraw.a = null;
        sectionDraw.hoverPoint = null;
        updateSectionDrawPreview();
        hideHoverCursor();
        drawSnapOverlay.hide();
        setUnderlayStatus("Section: canceled current line. Klikni prvý bod.");
        mountProps();
      } else {
        setToolSelect();
        setUnderlayStatus("Section: stopped.");
      }
      ev.preventDefault();
      return true;
    }

    if (layoutTool === "wall") {
      setToolSelect();
      setUnderlayStatus("Wall: stopped.");
      ev.preventDefault();
      return true;
    }

    return false;
  };

  const clearWallDrawState = () => {
    wallDraw.active = false;
    wallDraw.a = null;
    wallDraw.chainStart = null;
    wallDraw.segments = 0;
    wallDraw.hoverB = null;
    wallDraw.typedMm = "";
    wallTypedHud.textContent = "";
    if (wallDraw.preview) {
      layoutRoot.remove(wallDraw.preview);
      wallDraw.preview.geometry.dispose();
      (wallDraw.preview.material as THREE.Material).dispose();
      wallDraw.preview = null;
    }
    wallDrawSnap = null;
    hideHoverCursor();
    showWallSnapMarkersFor(selectedKind === "wall" ? selectedWallId : null);
    wallTypedHud.style.display = "none";
  };

  const deactivateMeasureTool = (opts?: { clearSaved?: boolean }) => {
    measureState.enabled = false;
    measureState.firstPoint = null;
    measureState.firstBinding = null;
    measureState.hoverPoint = null;
    measureState.hoverSnap = "none";
    clearPreview();
    clearToolHud();
    measurePlanSnap = null;
    resetMeasureSnapCycle();
    hideHoverCursor();
    setFirstPointMarker(null);
    if (opts?.clearSaved) clearAllMeasurements();
  };

  const setToolSelect = () => {
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "select";
    deactivateMeasureTool();
    technicalDimensions.resetDraft();
    clearWallDrawState();
    cancelSectionDraw({ silent: true });
    cancelKitchenWorktopDraw({ silent: true });
    setUnderlayStatus("");
    mountProps();
  };

  const setToolWall = () => {
    if (S.kitchenEditMode) {
      setUnderlayStatus("Wall: v kitchen edit mode sa steny nekreslia.");
      mountProps();
      return;
    }
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "wall";
    deactivateMeasureTool();
    technicalDimensions.resetDraft();
    clearWallDrawState();
    cancelSectionDraw({ silent: true });
    cancelKitchenWorktopDraw({ silent: true });
    ensureFloorplanViewerTab();
    selectedKind = null;
    selectedWallId = null;
    setInstanceSelected(null);
    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }
    mountProps();
  };

  const setToolAlign = () => {
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "align";
    deactivateMeasureTool();
    technicalDimensions.resetDraft();
    clearWallDrawState();
    cancelSectionDraw({ silent: true });
    cancelKitchenWorktopDraw({ silent: true });
    alignState.ref = null;
    alignState.hover = null;
    alignState.lastA = null;
    alignState.lastB = null;
    alignState.lastUntilMs = 0;
    ensureFloorplanViewerTab();
    setUnderlayStatus("Align: click reference line...");
    mountProps();
  };

  const setToolTrim = () => {
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "trim";
    deactivateMeasureTool();
    technicalDimensions.resetDraft();
    clearWallDrawState();
    cancelSectionDraw({ silent: true });
    cancelKitchenWorktopDraw({ silent: true });
    trimState.step = "pickTarget";
    trimState.targetWallId = null;
    trimState.targetPick = null;
    trimState.targetClick = null;
    trimState.hover = null;
    trimState.lastTarget = null;
    trimState.lastCutter = null;
    trimState.lastUntilMs = 0;
    ensureFloorplanViewerTab();
    setUnderlayStatus("Trim: click target wall...");
    mountProps();
  };

  const setToolSection = () => {
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "section";
    deactivateMeasureTool();
    technicalDimensions.resetDraft();
    clearWallDrawState();
    cancelKitchenWorktopDraw({ silent: true });
    cancelSectionDraw({ silent: true });
    ensureFloorplanViewerTab();
    selectedKind = null;
    selectedSectionId = null;
    selectedKitchenGroupId = null;
    selectedWallId = null;
    selectedFloorId = null;
    selectedWallIds.clear();
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    sectionDraw.active = true;
    syncSelectionState();
    updateAllSectionVisuals();
    updateSelectionHighlights();
    setUnderlayStatus("Section: klikni prvý bod, potom druhý bod. Space = zrkadliť smer.");
    mountProps();
  };

  const setToolMeasure = () => {
    if (layoutTool === "measure") {
      setToolSelect();
      return;
    }
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "measure";
    measureState.enabled = true;
    technicalDimensions.resetDraft();
    measureState.firstPoint = null;
    measureState.firstBinding = null;
    measureState.hoverPoint = null;
    measureState.hoverSnap = "none";
    clearPreview();
    clearToolHud();
    hideHoverCursor();
    resetMeasureSnapCycle();
    setFirstPointMarker(null);
    clearWallDrawState();
    cancelSectionDraw({ silent: true });
    cancelKitchenWorktopDraw({ silent: true });
    selectedKind = null;
    selectedWallId = null;
    selectedFloorId = null;
    selectedWallIds.clear();
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    syncSelectionState();
    updateSelectionHighlights();
    args.measureBtn.textContent = "Measure: On";
    args.measureReadoutEl.textContent = "Measure: klikni prvý bod.";
    setUnderlayStatus("Measure: klikni prvý roh alebo hranu.");
    mountProps();
  };

  const setToolDimension = () => {
    if (layoutTool === "dimension") {
      setToolSelect();
      return;
    }
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    layoutTool = "dimension";
    deactivateMeasureTool();
    technicalDimensions.resetDraft();
    clearWallDrawState();
    cancelSectionDraw({ silent: true });
    cancelKitchenWorktopDraw({ silent: true });
    ensureFloorplanViewerTab();
    selectedKind = null;
    selectedWallId = null;
    selectedFloorId = null;
    selectedWallIds.clear();
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    syncSelectionState();
    updateSelectionHighlights();
    setUnderlayStatus("Kóta: vyber prvú čiaru, potom ďalšie rovnobežné čiary. Klik do voľného miesta vloží kótu.");
    mountProps();
  };

  document.addEventListener(
    "keydown",
    (ev) => {
      if (
        ev.key === "Tab" &&
        mode === "layout" &&
        layoutTool === "measure" &&
        viewMode === "2d" &&
        activeViewerTab === "floorplan" &&
        !isTypingTarget(ev.target) &&
        measureSnapCyclePoint
      ) {
        measureSnapCycleIndex += ev.shiftKey ? -1 : 1;
        updateMeasureHoverFromPlanPoint(
          measureSnapCyclePoint.clone(),
          renderer.domElement.getBoundingClientRect(),
          measureSnapCycleNormalMode
        );
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (handleGlobalMeasurementClear(ev)) return;
      if (ev.defaultPrevented) return;
      if (!isEscapeKey(ev)) return;
      handleLayoutEscape(ev);
    },
    true
  );

  window.addEventListener("keydown", (ev) => {
    if (ev.defaultPrevented) return;
    if (isTypingTarget(ev.target) && ev.key !== "Escape") return;
    if (S.kitchenEditMode && kitchenWorktopDraw.active && mode === "layout" && viewMode === "2d") {
      if (ev.key === " " || ev.code === "Space") {
        mirrorKitchenWorktopDraw();
        ev.preventDefault();
        return;
      }
      const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
      if (isDigit) {
        kitchenWorktopDraw.typedMm = `${kitchenWorktopDraw.typedMm}${ev.key}`.slice(0, 8);
        wallTypedHud.textContent = `${kitchenWorktopDraw.typedMm} mm`;
        wallTypedHud.style.left = `${kitchenWorktopDraw.lastPointerPx.x}px`;
        wallTypedHud.style.top = `${kitchenWorktopDraw.lastPointerPx.y}px`;
        wallTypedHud.style.display = "block";
        setUnderlayStatus(`Pracovná doska: ${kitchenWorktopDraw.typedMm} mm (Enter = pridať bod, Backspace = edit, Esc = potvrdiť)`);
        ev.preventDefault();
        return;
      }
      if (ev.key === "Backspace") {
        kitchenWorktopDraw.typedMm = kitchenWorktopDraw.typedMm.slice(0, Math.max(0, kitchenWorktopDraw.typedMm.length - 1));
        if (kitchenWorktopDraw.typedMm.trim().length > 0) {
          wallTypedHud.textContent = `${kitchenWorktopDraw.typedMm} mm`;
          wallTypedHud.style.left = `${kitchenWorktopDraw.lastPointerPx.x}px`;
          wallTypedHud.style.top = `${kitchenWorktopDraw.lastPointerPx.y}px`;
          wallTypedHud.style.display = "block";
          setUnderlayStatus(`Pracovná doska: ${kitchenWorktopDraw.typedMm} mm (Enter = pridať bod, Backspace = edit, Esc = potvrdiť)`);
        } else {
          wallTypedHud.style.display = "none";
          setUnderlayStatus("Pracovná doska: klikaj body alebo píš mm + Enter. Esc = potvrdiť.");
        }
        ev.preventDefault();
        return;
      }
      if (ev.key === "Enter" && kitchenWorktopDraw.typedMm.trim().length > 0) {
        if (commitKitchenWorktopTypedLength()) {
          ev.preventDefault();
          return;
        }
      }
    }
    if (mode === "layout" && layoutTool === "section" && viewMode === "2d" && activeViewerTab === "floorplan") {
      if (ev.key === " " || ev.code === "Space") {
        sectionDraw.mirrored = !sectionDraw.mirrored;
        updateSectionDrawPreview();
        setUnderlayStatus(`Section: smer ${sectionDraw.mirrored ? "mirrored" : "default"}.`);
        ev.preventDefault();
        return;
      }
    }
    if (S.kitchenEditMode) return;
    if (floorEdit.active) {
      if (ev.key === "Escape") {
        if (floorEdit.first) {
          floorEdit.first = null;
          floorEdit.hover = null;
          renderFloorBoundaryEdit();
        } else {
          discardFloorBoundaryEdit();
        }
        ev.preventDefault();
      }
      return;
    }

    if (mode === "layout") {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
        const k = ev.key;
        if (k === "z" || k === "Z") {
          if (ev.shiftKey) redo(S, helpers);
          else undo(S, helpers);
          ev.preventDefault();
          return;
        }
        if (k === "y" || k === "Y") {
          redo(S, helpers);
          ev.preventDefault();
          return;
        }
      }

      if (placement.active && ev.key === "Escape") {
        cancelPlacement(S, placementHelpers);
        ev.preventDefault();
        return;
      }

      if (transformState.kind) {
        if (ev.key === "Escape") {
          clearTransform({ restore: true, status: "Canceled." });
          ev.preventDefault();
          return;
        }

        if (transformState.kind === "rotate" && transformState.step === "rotating") {
          const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
          if (isDigit) {
            transformState.typed = `${transformState.typed}${ev.key}`.slice(0, 6);
            setUnderlayStatus(`Rotácia: ${transformState.typed}° (Enter)`);
            ev.preventDefault();
            return;
          }
          if (ev.key === "Backspace") {
            transformState.typed = transformState.typed.slice(0, -1);
            setUnderlayStatus(transformState.typed.length ? `Rotácia: ${transformState.typed}° (Enter)` : "Rotácia: pohni myšou pre smer, alebo zadaj stupne + Enter.");
            ev.preventDefault();
            return;
          }
          if (ev.key === "Enter" && transformState.typed.trim().length > 0) {
            const n = Number(transformState.typed.trim().replace(",", "."));
            if (Number.isFinite(n) && n !== 0) {
              const sign = transformState.lastAngleSign || 1;
              const ang = (Math.abs(n) * Math.PI) / 180 * sign;
              applyRotateAngle(ang);
              setUnderlayStatus(`Rotácia: ${sign < 0 ? "CW" : "CCW"} ${Math.abs(Math.round(n))}° (klikni pre dokončenie)`);
            }
            transformState.typed = "";
            ev.preventDefault();
            return;
          }
        }
      }

      const nudgeStepM = () => {
        if (viewMode !== "2d") return 0;
        const c = cam();
        if (!(c instanceof THREE.OrthographicCamera)) return 0;
        const visibleW = Math.abs(c.right - c.left) / Math.max(1e-6, c.zoom);
        const visibleH = Math.abs(c.top - c.bottom) / Math.max(1e-6, c.zoom);
        const visible = Math.min(visibleW, visibleH);
        if (visible >= 20) return 1;
        if (visible >= 12) return 0.5;
        if (visible >= 7) return 0.25;
        if (visible >= 4) return 0.1;
        if (visible >= 2) return 0.05;
        return 0.01;
      };

      const nudgeSelection = (dxM: number, dzM: number) => {
        if (viewMode !== "2d" || layoutTool !== "select") return false;
        if (measureState.enabled) return false;
        if (dragState.active || windowDragState.active || wallEditHud.drag || marquee.active) return false;
        if (underlayCal.active) return false;

        const dxMm = Math.round(dxM * 1000);
        const dzMm = Math.round(dzM * 1000);

        let moved = false;
        const prevWalls = new Map<string, WallParams>();
        for (const w of walls) prevWalls.set(w.id, JSON.parse(JSON.stringify(w.params)) as WallParams);
        const prevInstancePos = new Map<string, THREE.Vector3>();
        for (const inst of instances) prevInstancePos.set(inst.id, inst.root.position.clone());

        // Walls (single or multi)
        const wallIds = selectedWallIds.size > 0 ? Array.from(selectedWallIds) : selectedKind === "wall" && selectedWallId ? [selectedWallId] : [];
        if (wallIds.length > 0) {
          const touched = new Set<string>();
          const movedEnds = new Set<string>();
          const moveEnd = (w: WallInstance, which: "a" | "b") => {
            const k = `${w.id}:${which}`;
            if (movedEnds.has(k)) return;
            if (pinnedWallIds.has(w.id)) return;
            if (which === "a") w.params.aMm = { x: w.params.aMm.x + dxMm, z: w.params.aMm.z + dzMm };
            else w.params.bMm = { x: w.params.bMm.x + dxMm, z: w.params.bMm.z + dzMm };
            movedEnds.add(k);
            touched.add(w.id);
          };

          for (const id of wallIds) {
            const w = walls.find((x) => x.id === id) ?? null;
            if (!w) continue;
            if (pinnedWallIds.has(w.id)) continue;

            const oldA = { x: w.params.aMm.x, z: w.params.aMm.z };
            const oldB = { x: w.params.bMm.x, z: w.params.bMm.z };

            // Move selected wall (translate both endpoints)
            moveEnd(w, "a");
            moveEnd(w, "b");

            // Propagate corner moves: any wall endpoint connected to oldA/oldB follows.
            for (const other of walls) {
              if (other.id === w.id) continue;
              if (pinnedWallIds.has(other.id)) continue;
              const wa = wallEndpointWhich(other, oldA, wallJoinTolMm);
              if (wa) moveEnd(other, wa);
              const wb = wallEndpointWhich(other, oldB, wallJoinTolMm);
              if (wb) moveEnd(other, wb);
            }
          }

          for (const id of touched) {
            const w = walls.find((x) => x.id === id) ?? null;
            if (w) rebuildWall(w);
          }
          if (touched.size > 0) {
            rebuildWallPlanMesh();
            moved = true;
          }
        }

        // Modules (single or multi)
        const instIds =
          selectedInstanceIds.size > 0
            ? Array.from(selectedInstanceIds)
            : selectedKind === "module" && selectedInstanceId
              ? [selectedInstanceId]
              : [];
        if (instIds.length > 0) {
          for (const id of instIds) {
            const inst = findInstance(id);
            if (!inst) continue;
            const prev = inst.root.position.clone();
            const prevRotationY = inst.root.rotation.y;
            const prevKitchenPlacement = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;
            const desired = new THREE.Vector3(
              inst.root.position.x + dxMm / 1000,
              inst.root.position.y,
              inst.root.position.z + dzMm / 1000
            );
            const desiredInRoom = applyWallConstraints(inst, desired);
            let desiredPlaced = desiredInRoom.clone();
            if (instIds.length === 1 && inst.kitchenGroupId) {
              const kitchenConstraint = getKitchenPlacementConstraint(inst, desiredInRoom);
              if (kitchenConstraint) {
                desiredPlaced.copy(kitchenConstraint.position);
                inst.root.rotation.y = kitchenConstraint.rotationY;
                inst.kitchenPlacement = kitchenConstraint.kitchenPlacement ?? prevKitchenPlacement;
              }
            }
            const snapped =
              instIds.length === 1
                ? snapPositionDetailed(inst, desiredPlaced, {
                    stickyNeighborId: null,
                    snapDistanceM: inst.kitchenGroupId ? 0.12 : undefined
                  }).position
                : desiredPlaced;
            inst.root.position.copy(snapped);
            if (anyOverlap(inst, null) || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst)) {
              inst.root.position.copy(prev);
              inst.root.rotation.y = prevRotationY;
              inst.kitchenPlacement = prevKitchenPlacement;
            } else {
              autoOrientModuleToRoomWallIfSnapped(inst);
              if (instIds.length === 1) {
                const actualDelta = inst.root.position.clone().sub(prev);
                nudgePinnedModuleChain(inst, actualDelta);
              }
              moved = true;
            }
          }
          if (moved) {
            for (const movedInst of instances) {
              if (!movedInst.kitchenGroupId) continue;
              const group = S.kitchenGroups.find((item) => item.id === movedInst.kitchenGroupId) ?? null;
              const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
              movedInst.kitchenPlacement = inferKitchenPlacementBinding(movedInst, movedInst.kitchenGroupId, backOffsetMm);
            }
            updateLayoutPanel();
          }
        }

        const sectionIds = selectedKind === "section" && selectedSectionId ? [selectedSectionId] : [];
        if (sectionIds.length > 0) {
          for (const id of sectionIds) {
            const section = sections.find((item) => item.id === id) ?? null;
            if (!section) continue;
            section.params.aMm = { x: section.params.aMm.x + dxMm, z: section.params.aMm.z + dzMm };
            section.params.bMm = { x: section.params.bMm.x + dxMm, z: section.params.bMm.z + dzMm };
            updateSectionVisual(section);
            moved = true;
          }
        }

        const modulesInvalid = instances.some(
          (i) =>
            !instanceFitsRoom(i) ||
            anyOverlap(i, null) ||
            moduleOverlapsWalls(i) ||
            moduleOverlapsKitchenWorktops(i)
        );

        // Never allow illegal module states (also blocks walls moving into existing modules).
        if (modulesInvalid) {
          for (const w of walls) {
            const p = prevWalls.get(w.id);
            if (p) w.params = JSON.parse(JSON.stringify(p)) as WallParams;
            rebuildWall(w);
          }
          for (const inst of instances) {
            const prev = prevInstancePos.get(inst.id);
            if (!prev) continue;
            inst.root.position.copy(prev);
          }
          rebuildWallPlanMesh();
          // best-effort: if a module nudge happened, it already reverted per-module on overlap;
          // so restoring walls is enough to eliminate illegal states.
          updateLayoutPanel();
          mountProps();
          return false;
        }

        if (moved) {
          mountProps();
          commitHistory(S);
        }
        return moved;
      };

      if (ev.key.startsWith("Arrow")) {
        const step = nudgeStepM();
        if (step > 0) {
          let dx = 0;
          let dz = 0;
          if (ev.key === "ArrowLeft") dx = -step;
          if (ev.key === "ArrowRight") dx = step;
          if (ev.key === "ArrowUp") dz = -step;
          if (ev.key === "ArrowDown") dz = step;
          if (dx !== 0 || dz !== 0) {
            const moved = nudgeSelection(dx, dz);
            if (moved) {
              ev.preventDefault();
              return;
            }
          }
        }
      }

      if ((ev.key === "m" || ev.key === "M") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (startTransformFromSelection("move")) {
          ev.preventDefault();
          return;
        }
      }

      if ((ev.key === "r" || ev.key === "R") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (startTransformFromSelection("rotate")) {
          ev.preventDefault();
          return;
        }
      }

      if ((ev.key === "w" || ev.key === "W") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        setToolWall();
        ev.preventDefault();
        return;
      }
      if ((ev.key === "a" || ev.key === "A") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        setToolAlign();
        ev.preventDefault();
        return;
      }
      if ((ev.key === "t" || ev.key === "T") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        setToolTrim();
        ev.preventDefault();
        return;
      }
      if (ev.key === " " || ev.code === "Space") {
        // Mirror wall side (Revit-like): works while drawing + when wall is selected.
        if (layoutTool === "wall") {
          wallDefault.exteriorSign = wallDefault.exteriorSign === 1 ? -1 : 1;
          setUnderlayStatus(`Wall: exterior ${wallDefault.exteriorSign === 1 ? "left" : "right"} of A->B.`);
          if (wallDraw.preview && wallDraw.a) {
            updateWallMeshWithJustification(
              wallDraw.preview,
              wallDraw.a,
              wallDraw.hoverB ?? wallDraw.a,
              wallDefault.thicknessMm,
              wallDefault.justification,
              wallDefault.exteriorSign
            );
          }
          mountProps();
          ev.preventDefault();
          return;
        }

        if (selectedKind === "wall" && selectedWallId) {
          const w = walls.find((x) => x.id === selectedWallId) ?? null;
          if (w) {
            w.params.exteriorSign = (w.params.exteriorSign ?? 1) === 1 ? -1 : 1;
            for (const ww of walls) rebuildWall(ww);
            rebuildWallPlanMesh();
            mountProps();
          }
          ev.preventDefault();
          return;
        }

        setToolSelect();
        ev.preventDefault();
        return;
      }

      if (ev.key === "Escape" && handleLayoutEscape(ev)) return;

      // Typed length while placing wall segment (Revit-style).
      if (layoutTool === "wall" && wallDraw.active && wallDraw.a && viewMode === "2d") {
        const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
        if (isDigit) {
          wallDraw.typedMm = `${wallDraw.typedMm}${ev.key}`.slice(0, 8);
          wallTypedHud.textContent = `${wallDraw.typedMm} mm`;
          wallTypedHud.style.left = `${wallDraw.lastPointerPx.x}px`;
          wallTypedHud.style.top = `${wallDraw.lastPointerPx.y}px`;
          wallTypedHud.style.display = "block";
          setUnderlayStatus(`Wall: ${wallDraw.typedMm} mm (Enter = place, Backspace = edit)`);
          ev.preventDefault();
          return;
        }
        if (ev.key === "Backspace") {
          wallDraw.typedMm = wallDraw.typedMm.slice(0, Math.max(0, wallDraw.typedMm.length - 1));
          if (wallDraw.typedMm.trim().length > 0) {
            wallTypedHud.textContent = `${wallDraw.typedMm} mm`;
            wallTypedHud.style.left = `${wallDraw.lastPointerPx.x}px`;
            wallTypedHud.style.top = `${wallDraw.lastPointerPx.y}px`;
            wallTypedHud.style.display = "block";
            setUnderlayStatus(`Wall: ${wallDraw.typedMm} mm (Enter = place, Backspace = edit)`);
          } else {
            wallTypedHud.style.display = "none";
            setUnderlayStatus("Stena: druhý bod... (píš mm + Enter, Shift = bez axis snap, Esc = stop)");
          }
          ev.preventDefault();
          return;
        }
        if (ev.key === "Enter" && wallDraw.typedMm.trim().length > 0) {
          const mm = Math.max(1, Math.round(Number(wallDraw.typedMm)));
          if (Number.isFinite(mm) && wallDraw.a) {
            const a = wallDraw.a.clone();
            const hb = wallDraw.hoverB ? wallDraw.hoverB.clone() : a.clone().add(new THREE.Vector3(1, 0, 0));
            const dir = hb.clone().sub(a);
            if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
            dir.normalize();
            const end = a.clone().addScaledVector(dir, mm / 1000);

            const bMm = { x: Math.round(end.x * 1000), z: Math.round(end.z * 1000) };
            const bExact = new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000);

            // close loop when near chain start
            const closeTolM = 0.03;
            const cs = wallDraw.chainStart;
            const closes =
              !!cs && wallDraw.segments >= 2 && Math.hypot(bExact.x - cs.x, bExact.z - cs.z) <= closeTolM;
            const finalEnd = closes && cs ? cs.clone() : bExact;

            const w = addWall(a, finalEnd, wallDefault.thicknessMm);
            if (!w) {
              ev.preventDefault();
              return;
            }
            autoJoinAtMmPoint(w.params.aMm);
            autoJoinAtMmPoint(w.params.bMm);
            wallDraw.segments += 1;

            wallDraw.typedMm = "";
            wallTypedHud.style.display = "none";

            if (closes) {
              clearWallDrawState();
              setUnderlayStatus("Wall: chain closed.");
              ev.preventDefault();
              return;
            }

            wallDraw.active = true;
            wallDraw.a = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
            wallDraw.hoverB = wallDraw.a.clone();
        updateWallMeshWithJustification(
          wallDraw.preview!,
          wallDraw.a,
          wallDraw.a,
          wallDefault.thicknessMm,
          wallDefault.justification,
          wallDefault.exteriorSign
        );
            setUnderlayStatus("Stena: ďalší bod... (píš mm + Enter, Shift = bez axis snap, Esc = stop)");
            selectedKind = "wall";
            selectedWallId = w.id;
            mountProps();
            ev.preventDefault();
            return;
          }
        }
      }

      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selectedInstanceIds.size > 0) {
          const ids = Array.from(selectedInstanceIds);
          for (const id of ids) deleteInstance(id);
          setSelectedModule(null);
          selectedInstanceIds.clear();
          commitHistory(S);
          ev.preventDefault();
          return;
        }
        if (selectedWallIds.size > 0) {
          const ids = Array.from(selectedWallIds);
          for (const id of ids) deleteWall(id);
          setSelectedWall(null);
          selectedWallIds.clear();
          ev.preventDefault();
          return;
        }
      }
    }

  });

  args.viewerEl.addEventListener("pointerleave", () => {
    wallDrawSnap = null;
    worktopDrawSnap = null;
    sectionDrawSnap = null;
    measurePlanSnap = null;
    resetMeasureSnapCycle();
    selectPlanSnap = null;
    hideHoverCursor();
    if (layoutTool === "measure") {
      hideHoverCursor();
      clearToolHud();
    }
  });

  let selectedMesh: THREE.Mesh | null = null;
  let selectedBox: THREE.BoxHelper | null = null;
  let grainArrow: THREE.ArrowHelper | null = null;
  let activeBuildControls: ParamHighlightControls | null = null;
  let drawOrthoEnabled = true;
  let drawOrthoToggleEl: HTMLButtonElement | null = null;

  let overlapBoxes: Array<{ mesh: THREE.Mesh; helper: THREE.BoxHelper }> = [];
  const drawSnapOverlay = createSnapOverlay(args.viewerEl);
  const measureSnapOverlay = createSnapOverlay(args.viewerEl);
  let wallDrawSnap: PlanSnapResult | null = null;
  let worktopDrawSnap: PlanSnapResult | null = null;
  let sectionDrawSnap: PlanSnapResult | null = null;
  let measurePlanSnap: PlanSnapResult | null = null;
  let measureSnapCycleIndex = 0;
  let measureSnapCyclePoint: THREE.Vector3 | null = null;
  let measureSnapCycleNormalMode = false;
  let selectPlanSnap: PlanSnapResult | null = null;

  const {
    measureOverlay,
    wallTypedHud,
    wallEditHud,
    moduleEditHud,
    marquee,
    marqueeEl,
    measureState,
    addMeasurement,
    updateMeasurementGeometry,
    updateMeasureLabels,
    updatePreview,
    clearPreview,
    setFirstPointMarker,
    clearAllMeasurements,
    updateHoverCursor,
    hideHoverCursor
  } = createMeasureTools({
    viewerEl: args.viewerEl,
    scene,
    getCamera: cam,
    snapOverlay: measureSnapOverlay,
    axisLockEl: args.axisLockEl,
    measureBtn: args.measureBtn,
    clearMeasuresBtn: args.clearMeasuresBtn,
    measureReadoutEl: args.measureReadoutEl
  });
  measureStateRef = measureState;

  const resetMeasureSnapCycle = () => {
    measureSnapCycleIndex = 0;
    measureSnapCyclePoint = null;
    measureSnapCycleNormalMode = false;
  };

  const resolveMeasurePlanSnap = (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => {
    if (
      !measureSnapCyclePoint ||
      measureSnapCyclePoint.distanceToSquared(hitPoint) > 1e-8 ||
      measureSnapCycleNormalMode !== normalMode
    ) {
      measureSnapCycleIndex = 0;
      measureSnapCyclePoint = hitPoint.clone();
      measureSnapCycleNormalMode = normalMode;
    }
    const snapped = snapPoint2D(hitPoint, rect, cam(), 24, {
      perpendicularFrom: normalMode ? null : measureState.firstPoint,
      kindPriority: ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"],
      sticky: measurePlanSnap,
      cycleIndex: measureSnapCycleIndex
    });
    measurePlanSnap = snapped.kind !== "none" ? snapped : null;
    return snapped;
  };

  const updateMeasureHoverFromPlanPoint = (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => {
    const snapped = resolveMeasurePlanSnap(hitPoint, rect, normalMode);
    let kind = snapped.kind;
    let point = snapped.kind !== "none" ? snapped.point : hitPoint;
    if (!measureState.axisLock && (snapped.kind === "none" || snapped.kind === "axis")) {
      const axisAssist = applyMeasureAxisAssist(measureState.firstPoint, point, cam(), rect, 12);
      if (axisAssist) {
        point = axisAssist.point;
        kind = "axis";
      }
    }
    measureState.hoverPoint = point.clone();
    measureState.hoverSnap = kind;
    updateHoverCursor(worldToScreen(point, cam(), rect), kind);

    const thick = hudLineThicknessM(rect);
    if (
      snapped.a &&
      snapped.b &&
      (snapped.kind === "edge" ||
        snapped.kind === "axis" ||
        snapped.kind === "midpoint" ||
        snapped.kind === "perpendicular")
    ) {
      updateHudLine(hudHoverLine, snapped.a, snapped.b, thick * 1.75);
    } else if (kind === "axis" && measureState.firstPoint) {
      updateHudLine(hudHoverLine, measureState.firstPoint, point, thick * 1.75);
    } else {
      hudHoverLine.visible = false;
    }

    if (measureState.firstPoint) {
      let a = measureState.firstPoint.clone();
      let b = point.clone();
      if (measureState.axisLock) b = axisLockXZ(a, b);
      if (normalMode) {
        const baseDir = b.clone().sub(a).setY(0);
        if (baseDir.lengthSq() > 1e-10) {
          baseDir.normalize();
          const normalDir = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
          const spanM = Math.max(4, Math.min(30, a.distanceTo(b) * 6));
          updatePreview(
            a.clone().addScaledVector(normalDir, -spanM / 2),
            a.clone().addScaledVector(normalDir, spanM / 2),
            rect,
            planarDistanceMm(a, b),
            { kind: "normalGuide" }
          );
        } else {
          clearPreview();
        }
        args.measureReadoutEl.textContent = `Normal: ${Math.round(planarDistanceMm(a, b))} mm`;
      } else {
        updatePreview(a, b, rect);
        args.measureReadoutEl.textContent = `Measure: ${Math.round(planarDistanceMm(a, b))} mm`;
      }
    } else {
      clearPreview();
      const cycleCount = snapped.cycleCount ?? 0;
      const cycleHint = cycleCount > 1 ? ` (${Math.min(measureSnapCycleIndex + 1, cycleCount)}/${cycleCount}, Tab)` : "";
      args.measureReadoutEl.textContent = normalMode
        ? `Normal hover (${kind}): ${formatMm(point)}${cycleHint}`
        : `Measure hover (${kind}): ${formatMm(point)}${cycleHint}`;
    }
    setFirstPointMarker(measureState.firstPoint);
  };

  // Editor UI
  args.formEl.innerHTML = "";

  const buildUi = document.createElement("div");
  const layoutUi = document.createElement("div");
  buildUi.style.display = "none";
  args.formEl.appendChild(buildUi);
  args.formEl.appendChild(layoutUi);

  // Build UI: model switcher + model-specific controls
  const modelWrap = document.createElement("div");
  modelWrap.className = "field";

  const modelLabel = document.createElement("label");
  modelLabel.textContent = "Model";
  modelLabel.htmlFor = "modelType";

  const modelSelect = document.createElement("select");
  modelSelect.id = "modelType";
  modelSelect.style.width = "120px";
  modelSelect.style.height = "36px";
  modelSelect.style.borderRadius = "10px";
  modelSelect.style.border = "1px solid var(--border)";
  modelSelect.style.background = "#0f1117";
  modelSelect.style.color = "var(--text)";

  if (hasImportedModules) {
    modelSelect.innerHTML = availableModuleDescriptors
      .map((descriptor) => `<option value="${descriptor.type}">${descriptor.type}</option>`)
      .join("");
  } else {
    modelSelect.innerHTML = `<option value="">No modules imported</option>`;
    modelSelect.disabled = true;
  }

  modelWrap.appendChild(modelLabel);
  modelWrap.appendChild(modelSelect);
  buildUi.appendChild(modelWrap);

  const editorHost = document.createElement("div");
  buildUi.appendChild(editorHost);

  // Layout UI: global view/render controls only. Module actions live in kitchen edit toolbar.
  const viewWrap = document.createElement("div");
  viewWrap.className = "field";
  const viewLabel = document.createElement("label");
  viewLabel.textContent = "2D top view";
  viewLabel.htmlFor = "view2d";
  const view2d = document.createElement("input");
  view2d.id = "view2d";
  view2d.type = "checkbox";
  view2d.checked = true;
  view2d.style.justifySelf = "start";
  viewWrap.appendChild(viewLabel);
  viewWrap.appendChild(view2d);
  layoutUi.appendChild(viewWrap);

  drawOrthoToggleEl = document.createElement("button");
  drawOrthoToggleEl.type = "button";
  drawOrthoToggleEl.style.position = "absolute";
  drawOrthoToggleEl.style.right = "16px";
  drawOrthoToggleEl.style.bottom = "16px";
  drawOrthoToggleEl.style.zIndex = "12";
  drawOrthoToggleEl.style.padding = "10px 14px";
  drawOrthoToggleEl.style.borderRadius = "999px";
  drawOrthoToggleEl.style.border = "1px solid rgba(255,255,255,0.14)";
  drawOrthoToggleEl.style.boxShadow = "0 10px 30px rgba(0,0,0,0.24)";
  drawOrthoToggleEl.style.backdropFilter = "blur(14px)";
  drawOrthoToggleEl.style.fontSize = "12px";
  drawOrthoToggleEl.style.fontWeight = "700";
  drawOrthoToggleEl.style.letterSpacing = "0.04em";
  drawOrthoToggleEl.style.cursor = "pointer";
  drawOrthoToggleEl.textContent = "Ortho ON";
  drawOrthoToggleEl.style.background = "rgba(16,42,60,0.96)";
  drawOrthoToggleEl.style.borderColor = "#53c6ff";
  drawOrthoToggleEl.style.color = "#dff6ff";
  drawOrthoToggleEl.addEventListener("click", () => toggleDrawOrthoMode());
  args.viewerEl.appendChild(drawOrthoToggleEl);

  const sunHost = document.createElement("div");
  sunHost.className = "field";
  sunHost.style.display = "grid";
  sunHost.style.gap = "10px";
  sunHost.style.padding = "10px";
  sunHost.style.border = "1px solid var(--border)";
  sunHost.style.borderRadius = "12px";
  sunHost.style.background = "rgba(10,12,16,0.4)";

  const sunTitle = document.createElement("div");
  sunTitle.textContent = "Lighting";
  sunTitle.style.fontWeight = "600";
  sunHost.appendChild(sunTitle);

  const sunRow = (label: string, el: HTMLElement) => {
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "160px 1fr";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";
    const l = document.createElement("div");
    l.textContent = label;
    wrap.appendChild(l);
    wrap.appendChild(el);
    sunHost.appendChild(wrap);
  };

  const mkNum = (v: number) => {
    const i = document.createElement("input");
    i.type = "number";
    i.value = String(v);
    i.step = "1";
    return i;
  };

  const day = document.createElement("input");
  day.type = "range";
  day.min = "0";
  day.max = "25";
  day.step = "0.1";
  day.value = "9";
  day.addEventListener("input", () => setDaylightIntensity(Number(day.value)));
  sunRow("Window daylight", day);

  const shadowSel = document.createElement("select");
  shadowSel.innerHTML = `
    <option value="pcfsoft">Shadows: PCFSoft</option>
    <option value="vsm">Shadows: VSM (experimental)</option>
  `;
  shadowSel.value = getShadowAlgorithm();
  shadowSel.addEventListener("change", () => {
    const next = shadowSel.value === "vsm" ? "vsm" : "pcfsoft";
    setShadowAlgorithm(next);
  });
  sunRow("Shadows", shadowSel);

  const renderModeSel = document.createElement("select");
  renderModeSel.innerHTML = `
    <option value="realtime">Render: realtime</option>
    ${ENABLE_SSGI ? `<option value="realtime_ssgi">Render: realtime + SSGI (experimental)</option>` : ""}
    ${ENABLE_PHOTO ? `<option value="photo_pathtrace">Render: photo mode (path tracing)</option>` : ""}
  `;
  renderModeSel.value = renderMode;

  const isPhotoRenderMode = (m: RenderMode) => m === "photo_pathtrace";

  const photoWrap = document.createElement("div");
  photoWrap.style.display = isPhotoRenderMode(renderMode) ? "" : "none";
  photoWrap.style.paddingLeft = "168px";
  photoWrap.style.marginTop = "-6px";

  renderModeSel.addEventListener("change", () => {
    const v = renderModeSel.value as RenderMode;
    renderMode = v === "realtime_ssgi" || v === "photo_pathtrace" ? v : "realtime";

    if (renderMode !== "realtime_ssgi") {
      ssgi?.dispose();
      ssgi = null;
      ssgiCameraUuid = null;
    }
    if (renderMode !== "photo_pathtrace") {
      photo?.dispose();
      photo = null;
      photoCameraUuid = null;
      photoLastLightingRevision = -1;
    }

    photoWrap.style.display = isPhotoRenderMode(renderMode) ? "" : "none";
  });
  sunRow("Render mode", renderModeSel);
  sunHost.appendChild(photoWrap);

  const photoControls = document.createElement("div");
  photoControls.style.display = "flex";
  photoControls.style.flexWrap = "wrap";
  photoControls.style.gap = "8px";
  photoWrap.appendChild(photoControls);

  const photoSamples = document.createElement("input");
  photoSamples.type = "number";
  photoSamples.min = "1";
  photoSamples.max = "4096";
  photoSamples.step = "1";
  photoSamples.value = "256";
  photoSamples.style.width = "110px";
  photoControls.appendChild(photoSamples);

  const photoReset = document.createElement("button");
  photoReset.type = "button";
  photoReset.textContent = "Reset";
  photoControls.appendChild(photoReset);

  const photoSave = document.createElement("button");
  photoSave.type = "button";
  photoSave.textContent = "Save PNG";
  photoControls.appendChild(photoSave);

  const photoStatus = document.createElement("div");
  photoStatus.style.opacity = "0.9";
  photoStatus.style.fontSize = "12px";
  photoStatus.style.marginTop = "6px";
  photoWrap.appendChild(photoStatus);

  photoReset.addEventListener("click", () => {
    photo?.reset();
  });

  photoSave.addEventListener("click", () => {
    downloadViewportPng();
  });

  const hdriSel = document.createElement("select");
  hdriSel.innerHTML = `
    <option value="">HDRI: off</option>
    <option value="/hdri/OutdoorFieldBaseballDayClear001/HdrOutdoorFieldBaseballDayClear001_HDR_2K.exr">Outdoor day (2K)</option>
    <option value="/hdri/SkySunset007/HdrSkySunset007_HDR_1K.exr">Sunset (1K)</option>
  `;
  hdriSel.value = "";
  sunRow("HDRI", hdriSel);

  const hdriBg = document.createElement("input");
  hdriBg.type = "checkbox";
  hdriBg.checked = false;
  sunRow("HDRI background", hdriBg);

  const hdriIntensity = document.createElement("input");
  hdriIntensity.type = "range";
  hdriIntensity.min = "0";
  hdriIntensity.max = "1";
  hdriIntensity.step = "0.01";
  hdriIntensity.value = "0.15";
  sunRow("HDRI intensity", hdriIntensity);

  const applyHdri = () => {
    const id = hdriSel.value || null;
    const envIntensity = Number(hdriIntensity.value);
    if (id && !hdriBg.checked) hdriBg.checked = true; // make it visible by default
    setHdri({ id, background: hdriBg.checked, envIntensity, backgroundIntensity: 1 });
  };

  hdriSel.addEventListener("change", applyHdri);
  hdriBg.addEventListener("change", applyHdri);
  hdriIntensity.addEventListener("input", applyHdri);

  layoutUi.appendChild(sunHost);

  const instanceEditorHost = document.createElement("div");
  layoutUi.appendChild(instanceEditorHost);

  const windowEditorHost = document.createElement("div");
  windowEditorHost.style.display = "none";
  layoutUi.appendChild(windowEditorHost);

  // Panels
  args.partsEl.innerHTML = "";
  const partsBuildHost = document.createElement("div");
  const partsLayoutHost = document.createElement("div");
  partsLayoutHost.style.display = "none";
  args.partsEl.appendChild(partsBuildHost);
  args.partsEl.appendChild(partsLayoutHost);

  const partPanel = createPartPanel(partsBuildHost, {
    onSelect: (name) => selectByName(name),
    onSetVisible: (name, visible) => setVisibleByName(name, visible),
    onHighlightPair: (a, b) => highlightOverlap(a, b),
    isMaterialOverrideEnabled: () => false,
    getMaterialOverride: () => "",
    onSetMaterialOverride: () => {}
  });

  const layoutPanel = createLayoutPanel(partsLayoutHost, {
    onSelect: (id) => selectInstanceById(id),
    onDuplicate: (id) => duplicateInstance(id),
    onDelete: (id) => deleteInstance(id)
  });

  // Ribbon (Revit-style tabs) [legacy]
  let underlayStatusEl: HTMLDivElement | null = null;
  let underlayScaleEl: HTMLInputElement | null = null;
  let underlayOffXEl: HTMLInputElement | null = null;
  let underlayOffZEl: HTMLInputElement | null = null;
  const setUnderlayStatus = (text: string) => {
    if (underlayStatusEl) underlayStatusEl.textContent = text;
  };

  const hideWallEditHud = () => {
    wallEditHud.lenLine.style.display = "none";
    wallEditHud.lenExtA.style.display = "none";
    wallEditHud.lenExtB.style.display = "none";
    wallEditHud.offsetLine.style.display = "none";
    wallEditHud.offsetTickA.style.display = "none";
    wallEditHud.offsetTickB.style.display = "none";
    wallEditHud.handleA.style.display = "none";
    wallEditHud.handleB.style.display = "none";
    wallEditHud.handleMid.style.display = "none";
    wallEditHud.label.style.display = "none";
    wallEditHud.input.style.display = "none";
    wallEditHud.offsetLabel.style.display = "none";
    wallEditHud.offsetInput.style.display = "none";
    wallEditHud.offsetRefWallId = null;
  };

  const hideModuleEditHud = () => {
    moduleEditHud.widthLine.style.display = "none";
    moduleEditHud.widthExtA.style.display = "none";
    moduleEditHud.widthExtB.style.display = "none";
    moduleEditHud.label.style.display = "none";
    moduleEditHud.input.style.display = "none";
  };

  const getEditableModuleWidthMm = (inst: LayoutInstance) => {
    const raw = (inst.params as any).widthMm ?? (inst.params as any).width;
    return typeof raw === "number" && Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : null;
  };

  const setEditableModuleWidthMm = (inst: LayoutInstance, valueMm: number) => {
    if (typeof (inst.params as any).widthMm === "number") {
      (inst.params as any).widthMm = valueMm;
      return true;
    }
    if (typeof (inst.params as any).width === "number") {
      (inst.params as any).width = valueMm;
      return true;
    }
    return false;
  };

  const commitWallLengthMm = (raw: string) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    const w = walls.find((x) => x.id === selectedWallId) ?? null;
    if (!w) return;

    const v = Number(String(raw).trim().replace(/[^0-9.\\-]/g, ""));
    if (!Number.isFinite(v)) return;
    const lenMm = Math.max(1, Math.round(v));

    const oldB = { ...w.params.bMm };
    const a = fromMmPoint(w.params.aMm);
    const b = fromMmPoint(w.params.bMm);
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) d.set(1, 0, 0);
    d.normalize();
    const newB = a.clone().addScaledVector(d, lenMm / 1000);
    const newBMm = toMmPoint(newB);
    setWallEndpointMm(w, "b", newBMm);

    // Keep connected joins attached (move any walls that shared the old endpoint).
    for (const other of walls) {
      if (other.id === w.id) continue;
      const which = wallEndpointWhich(other, oldB, wallJoinTolMm);
      if (which) setWallEndpointMm(other, which, newBMm);
    }

    autoJoinAtMmPoint(w.params.aMm);
    autoJoinAtMmPoint(w.params.bMm);
    rebuildWallPlanMesh();
    mountProps();
  };

  const commitWallOffsetMm = (raw: string) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    const w = walls.find((x) => x.id === selectedWallId) ?? null;
    const refId = wallEditHud.offsetRefWallId;
    const ref = refId ? walls.find((x) => x.id === refId) ?? null : null;
    if (!w || !ref) return;

    const v = Number(String(raw).trim().replace(/[^0-9.\\-]/g, ""));
    if (!Number.isFinite(v)) return;
    const desiredOffsetMm = Math.max(0, Math.round(v));

    const a = fromMmPoint(w.params.aMm);
    const b = fromMmPoint(w.params.bMm);
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) return;
    d.normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).normalize();

    const ra = fromMmPoint(ref.params.aMm);
    const rb = fromMmPoint(ref.params.bMm);
    const rmid = ra.clone().add(rb).multiplyScalar(0.5);
    const mid = a.clone().add(b).multiplyScalar(0.5);

    const signed = rmid.clone().sub(mid).dot(n);
    const sign = signed >= 0 ? 1 : -1;
    const desiredCenterDistM = desiredOffsetMm / 1000 + (w.params.thicknessMm + ref.params.thicknessMm) / 2000;
    const desiredSigned = sign * desiredCenterDistM;
    const shift = signed - desiredSigned;

    const shiftMm = { x: Math.round(n.x * shift * 1000), z: Math.round(n.z * shift * 1000) };

    const oldA = { ...w.params.aMm };
    const oldB = { ...w.params.bMm };

    w.params.aMm = { x: w.params.aMm.x + shiftMm.x, z: w.params.aMm.z + shiftMm.z };
    w.params.bMm = { x: w.params.bMm.x + shiftMm.x, z: w.params.bMm.z + shiftMm.z };

    // Keep connected joins attached at both ends.
    for (const other of walls) {
      if (other.id === w.id) continue;
      const wa = wallEndpointWhich(other, oldA, wallJoinTolMm);
      if (wa) setWallEndpointMm(other, wa, w.params.aMm);
      const wb = wallEndpointWhich(other, oldB, wallJoinTolMm);
      if (wb) setWallEndpointMm(other, wb, w.params.bMm);
    }

    rebuildWall(w);
    autoJoinAtMmPoint(w.params.aMm);
    autoJoinAtMmPoint(w.params.bMm);
    rebuildWallPlanMesh();
    mountProps();
  };

  const commitModuleWidthMm = (raw: string) => {
    if (selectedKind !== "module" || !selectedInstanceId) return;
    const inst = findInstance(selectedInstanceId) ?? null;
    if (!inst) return;
    const nextMm = Number(String(raw).trim().replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(nextMm)) return;
    const widthMm = Math.max(1, Math.round(nextMm));
    const previousParams = structuredClone(inst.params);
    if (!setEditableModuleWidthMm(inst, widthMm)) return;
    const accepted = rebuildInstance(inst, {
      previousParams,
      preserveBackAnchor: true,
      sourceKey: typeof (inst.params as any).widthMm === "number" ? "widthMm" : "width"
    });
    if (!accepted) return;
    mountProps();
    commitHistory(S);
  };

  wallEditHud.label.addEventListener("pointerdown", (ev) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    if (mode !== "layout" || viewMode !== "2d") return;
    if (layoutTool === "wall" && wallDraw.active) return;
    ev.preventDefault();
    ev.stopPropagation();

    const w = walls.find((x) => x.id === selectedWallId) ?? null;
    if (!w) return;
    wallEditHud.input.value = String(Math.round(mmDist(w.params.aMm, w.params.bMm)));
    wallEditHud.input.style.left = wallEditHud.label.style.left;
    wallEditHud.input.style.top = wallEditHud.label.style.top;
    wallEditHud.input.style.transform = "translate(-50%, -50%)";
    wallEditHud.input.style.display = "block";
    wallEditHud.input.focus();
    wallEditHud.input.select();
  });

  wallEditHud.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      commitWallLengthMm(wallEditHud.input.value);
      wallEditHud.input.blur();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      wallEditHud.input.style.display = "none";
      wallEditHud.input.blur();
      ev.preventDefault();
    }
  });
  wallEditHud.input.addEventListener("blur", () => {
    wallEditHud.input.style.display = "none";
  });

  wallEditHud.offsetLabel.addEventListener("pointerdown", (ev) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    if (mode !== "layout" || viewMode !== "2d") return;
    if (layoutTool === "wall" && wallDraw.active) return;
    ev.preventDefault();
    ev.stopPropagation();

    wallEditHud.offsetInput.value = String(wallEditHud.offsetLabel.textContent?.replace(/[^0-9\\-]/g, "") ?? "");
    wallEditHud.offsetInput.style.left = wallEditHud.offsetLabel.style.left;
    wallEditHud.offsetInput.style.top = wallEditHud.offsetLabel.style.top;
    wallEditHud.offsetInput.style.transform = "translate(-50%, -50%)";
    wallEditHud.offsetInput.style.display = "block";
    wallEditHud.offsetInput.focus();
    wallEditHud.offsetInput.select();
  });

  wallEditHud.offsetInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      commitWallOffsetMm(wallEditHud.offsetInput.value);
      wallEditHud.offsetInput.blur();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      wallEditHud.offsetInput.style.display = "none";
      wallEditHud.offsetInput.blur();
      ev.preventDefault();
    }
  });
  wallEditHud.offsetInput.addEventListener("blur", () => {
    wallEditHud.offsetInput.style.display = "none";
  });

  moduleEditHud.label.addEventListener("pointerdown", (ev) => {
    if (selectedKind !== "module" || !selectedInstanceId) return;
    if (mode !== "layout" || viewMode !== "2d" || activeViewerTab !== "floorplan") return;
    ev.preventDefault();
    ev.stopPropagation();

    const inst = findInstance(selectedInstanceId) ?? null;
    const widthMm = inst ? getEditableModuleWidthMm(inst) : null;
    if (!inst || widthMm == null) return;
    moduleEditHud.input.value = String(widthMm);
    moduleEditHud.input.style.left = moduleEditHud.label.style.left;
    moduleEditHud.input.style.top = moduleEditHud.label.style.top;
    moduleEditHud.input.style.transform = "translate(-50%, -50%)";
    moduleEditHud.input.style.display = "block";
    moduleEditHud.input.focus();
    moduleEditHud.input.select();
  });

  moduleEditHud.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      commitModuleWidthMm(moduleEditHud.input.value);
      moduleEditHud.input.blur();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      moduleEditHud.input.style.display = "none";
      moduleEditHud.input.blur();
      ev.preventDefault();
    }
  });
  moduleEditHud.input.addEventListener("blur", () => {
    moduleEditHud.input.style.display = "none";
  });

  const beginWallDrag = (
    ev: PointerEvent,
    wallId: string,
    kind: "a" | "b" | "move"
  ) => {
    if (mode !== "layout" || viewMode !== "2d") return;
    if (layoutTool !== "select") return;
    if (measureState.enabled) return;

    const w = walls.find((x) => x.id === wallId) ?? null;
    if (!w) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    pointerNdc.set(x, y);
    raycaster.setFromCamera(pointerNdc, cam());
    const hitPoint = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

    const gatherConnected = (p: { x: number; z: number }) => {
      const out: Array<{ wallId: string; which: "a" | "b" }> = [];
      for (const other of walls) {
        if (other.id === wallId) continue;
        const which = wallEndpointWhich(other, p, wallJoinTolMm);
        if (which) out.push({ wallId: other.id, which });
      }
      return out;
    };

    wallEditHud.drag = {
      wallId,
      kind,
      pointerId: ev.pointerId,
      startWorld: hitPoint.clone(),
      startA: { ...w.params.aMm },
      startB: { ...w.params.bMm },
      connectedA: gatherConnected(w.params.aMm),
      connectedB: gatherConnected(w.params.bMm)
    };

    try {
      renderer.domElement.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    ev.preventDefault();
    ev.stopPropagation();
  };

  wallEditHud.handleA.addEventListener("pointerdown", (ev) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    beginWallDrag(ev, selectedWallId, "a");
  });
  wallEditHud.handleB.addEventListener("pointerdown", (ev) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    beginWallDrag(ev, selectedWallId, "b");
  });
  wallEditHud.handleMid.addEventListener("pointerdown", (ev) => {
    if (selectedKind !== "wall" || !selectedWallId) return;
    beginWallDrag(ev, selectedWallId, "move");
  });

  const ensureLayoutMode = () => {
    if (mode !== "layout") {
      setMode("layout");
    }
  };

  /* legacy ribbon UI (disabled)
  createRibbon(args.ribbonEl, [
    {
      id: "kitchens",
      title: "Kuchyne",
      build(panelEl) {
        const g = ribbonGroup(panelEl, "Moduly");
        const a = ribbonActions(g, 3);
        ribbonButton(a, "Pridať drawer", () => {
          ensureLayoutMode();
          addInstance("drawer_low");
        });
        ribbonButton(a, "Pridať shelves", () => {
          ensureLayoutMode();
          addInstance("shelves");
        });
        ribbonButton(a, "Pridať corner", () => {
          ensureLayoutMode();
          addInstance("corner_shelf_lower");
        });

        const g2 = ribbonGroup(panelEl, "Výber");
        const a2 = ribbonActions(g2, 3);
        ribbonButton(a2, "Duplikovať", () => {
          ensureLayoutMode();
          if (!selectedInstanceId) return;
          duplicateInstance(selectedInstanceId);
        });
        ribbonButton(a2, "Zmazať", () => {
          ensureLayoutMode();
          if (!selectedInstanceId) return;
          deleteInstance(selectedInstanceId);
        });
        ribbonButton(a2, "2D pohľad", () => {
          ensureLayoutMode();
          view2d.checked = !view2d.checked;
          setView2d(view2d.checked);
        });

        const g3 = ribbonGroup(panelEl, "Projekt");
        const a3 = ribbonActions(g3, 3);
        ribbonButton(a3, "Reset defaults", () => args.resetBtn.click());
        ribbonButton(a3, "Export JSON", () => args.exportBtn.click());
        ribbonButton(a3, "Copy export", () => args.copyBtn.click());

        const resetViewBtn = args.viewerEl.querySelector("#resetViewBtn") as HTMLButtonElement | null;
        ribbonButton(a3, "Reset view", () => resetViewBtn?.click());
      }
    },
    {
      id: "walls",
      title: "Stena",
      build(panelEl) {
        const g = ribbonGroup(panelEl, "Podklad (PDF/PNG)");

        const file = document.createElement("input");
        file.type = "file";
        file.accept = ".png,.pdf,image/png,application/pdf";
        ribbonRow(g, "Nahrať", file);

        const clearBtnWrap = ribbonActions(g, 1);
        ribbonButton(clearBtnWrap, "Odstrániť podklad", () => {
          ensureLayoutMode();
          clearUnderlay();
          setUnderlayStatus("Podklad odstránený.");
        });

        const opacity = document.createElement("input");
        opacity.type = "range";
        opacity.min = "0";
        opacity.max = "1";
        opacity.step = "0.01";
        opacity.value = String(underlayState.opacity);
        ribbonRow(g, "Opacity", opacity);

        const rot = document.createElement("input");
        rot.type = "number";
        rot.step = "1";
        rot.value = String(underlayState.rotationDeg);
        ribbonRow(g, "Rotácia (°)", rot);

        const offX = document.createElement("input");
        offX.type = "number";
        offX.step = "1";
        offX.value = String(underlayState.offsetMm.x);
        ribbonRow(g, "Offset X (mm)", offX);

        const offZ = document.createElement("input");
        offZ.type = "number";
        offZ.step = "1";
        offZ.value = String(underlayState.offsetMm.z);
        ribbonRow(g, "Offset Z (mm)", offZ);

        const known = document.createElement("input");
        known.type = "number";
        known.step = "1";
        known.value = String(underlayCal.knownMm);
        ribbonRow(g, "Kalibrácia (mm)", known);

        const calWrap = ribbonActions(g, 2);
        ribbonButton(calWrap, "Kalibrovať škálu", () => {
          ensureLayoutMode();
          if (!underlayMesh.visible) {
            setUnderlayStatus("Najprv nahraj podklad.");
            return;
          }
          underlayCal.knownMm = Math.max(1, Number(known.value) || 1);
          underlayCal.active = true;
          underlayCal.first = null;
          setUnderlayStatus("Kalibrácia: klikni prvý bod...");
        });
        ribbonButton(calWrap, "Reset škály", () => {
          ensureLayoutMode();
          underlayState.scale = 1;
          updateUnderlayTransform();
          setUnderlayStatus("Škála resetnutá.");
        });

        underlayStatusEl = document.createElement("div");
        underlayStatusEl.className = "muted";
        underlayStatusEl.style.fontSize = "12px";
        underlayStatusEl.textContent = "Nahraj PDF/PNG podklad a nastav 1:1 kalibráciou.";
        g.appendChild(underlayStatusEl);

        file.addEventListener("change", async () => {
          ensureLayoutMode();
          const f = file.files?.[0] ?? null;
          if (!f) return;
          setUnderlayStatus("Načítavam...");
          try {
            const res = await loadUnderlayToCanvas(f);
            setUnderlayFromCanvas(res.canvas, res.name, res.kind);
            opacity.value = String(underlayState.opacity);
            rot.value = String(underlayState.rotationDeg);
            offX.value = String(underlayState.offsetMm.x);
            offZ.value = String(underlayState.offsetMm.z);
            setUnderlayStatus(`Podklad: ${res.name}`);
          } catch (e) {
            setUnderlayStatus(`Chyba pri načítaní: ${(e as Error).message}`);
          } finally {
            file.value = "";
          }
        });

        opacity.addEventListener("input", () => {
          underlayState.opacity = Math.min(1, Math.max(0, Number(opacity.value) || 0));
          updateUnderlayTransform();
        });

        rot.addEventListener("change", () => {
          underlayState.rotationDeg = Number(rot.value) || 0;
          updateUnderlayTransform();
        });

        offX.addEventListener("change", () => {
          underlayState.offsetMm.x = Number(offX.value) || 0;
          updateUnderlayTransform();
        });

        offZ.addEventListener("change", () => {
          underlayState.offsetMm.z = Number(offZ.value) || 0;
          updateUnderlayTransform();
        });

        const g2 = ribbonGroup(panelEl, "Steny");
        const a2 = ribbonActions(g2, 3);
        ribbonButton(a2, "Pridať stenu");
        ribbonButton(a2, "Odsadiť stenu");
        ribbonButton(a2, "Zmazať stenu");
      }
    },
    {
      id: "doors",
      title: "Dvere",
      build(panelEl) {
        const g = ribbonGroup(panelEl, "Dvere");
        const a = ribbonActions(g, 3);
        ribbonButton(a, "Pridať dvere");
        ribbonButton(a, "Editovať dvere");
        ribbonButton(a, "Odstrániť dvere");
      }
    },
    {
      id: "windows",
      title: "Okno",
      build(panelEl) {
        const g = ribbonGroup(panelEl, "Okno");
        const a = ribbonActions(g, 3);
        ribbonButton(a, "Pridať/označiť okno", () => {
          ensureLayoutMode();
          addOrSelectWindow();
        });
      }
    }
  ]);
  */

  // Top bar (single strip with icon buttons)
  const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const I_SELECT = icon("M4 4h7v2H6v5H4V4zm14 0v7h-2V6h-5V4h7zM4 20v-7h2v5h5v2H4zm16-7v7h-7v-2h5v-5h2z");
  const I_WALL = icon("M4 6h16v2H4V6zm0 10h16v2H4v-2zM6 8h2v8H6V8zm10 0h2v8h-2V8z");
  const I_UNDERLAY = icon("M6 2h9l3 3v17H6V2zm9 1.5V6h2.5L15 3.5zM8 9h8v2H8V9zm0 4h8v2H8v-2z");
  const I_CABINET = icon("M4 6h16v14H4V6zm2 2v3h12V8H6zm0 5v5h5v-5H6zm7 0v5h5v-5h-5z");
  const I_GRID2D = icon("M4 4h16v16H4V4zm2 2v4h4V6H6zm6 0v4h6V6h-6zM6 12v6h4v-6H6zm6 0v6h6v-6h-6z");
  const I_DUP = icon("M7 7h10v10H7V7zm-3 3h2v10h10v2H4V10z");
  const I_TRASH = icon("M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9z");
  const I_EXPORT = icon("M12 3v10l3-3 1.4 1.4L12 16.8 7.6 11.4 9 10l3 3V3h0zM5 19h14v2H5v-2z");
  const I_COPY = icon("M8 7h11v14H8V7zM5 3h11v2H7v12H5V3z");
  const I_RESET = icon("M12 6V3l-4 4 4 4V8c2.8 0 5 2.2 5 5a5 5 0 1 1-9.8-1H5.1A7 7 0 1 0 12 6z");
  const I_VIEW = icon("M12 5c5.5 0 9.5 5.5 9.5 7s-4 7-9.5 7S2.5 14.5 2.5 12 6.5 5 12 5zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z");
  const I_BOM = icon("M5 3h14v18H5V3zm2 2v4h10V5H7zm0 6v2h10v-2H7zm0 4v2h6v-2H7z");
  const I_ALIGN = icon("M4 7h12v2H4V7zm0 8h12v2H4v-2zM18 6l4 3-4 3V6zm0 6l4 3-4 3v-6z");
  const I_TRIM = icon("M4 7h11v2H4V7zm0 8h8v2H4v-2zM18 5l4 4-2 2-4-4 2-2zm-4 4l4 4-2 2-4-4 2-2z");
  const I_DIM = icon("M3 7h18v2H3V7zm0 8h18v2H3v-2zM6 9v6H4V9h2zm16 0v6h-2V9h2z");
  const I_SECTION = icon("M4 6h16v2H4V6zm2 4h2v8H6v-8zm10 0h2v8h-2v-8zm-5 1 4 4-1.4 1.4L12 13.8V20h-2v-6.2l-1.6 1.6L7 14l4-4z");
  const I_FLOOR = icon("M4 15l8 4 8-4-8-4-8 4zm0-4l8 4 8-4-8-4-8 4z");
  const I_UNDO = icon("M12 5H7.8l1.6-1.6L8 2 4 6l4 4 1.4-1.4L7.8 7H12c3.3 0 6 2.7 6 6 0 1.1-.3 2.1-.8 3l1.7 1c.7-1.2 1.1-2.6 1.1-4 0-4.4-3.6-8-8-8z");
  const I_REDO = icon("M12 5c-4.4 0-8 3.6-8 8 0 1.4.4 2.8 1.1 4l1.7-1c-.5-.9-.8-1.9-.8-3 0-3.3 2.7-6 6-6h4.2l-1.6 1.6L16 10l4-4-4-4-1.4 1.4L16.2 5H12z");
  const I_DONE = icon("M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z");
  const I_CANCEL = icon("M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z");
  const I_MOVE = icon("M11 2h2v4h3l-4 4-4-4h3V2zm0 16H8l4-4 4 4h-3v4h-2v-4zM2 11h4V8l4 4-4 4v-3H2v-2zm16 0h4v2h-4v3l-4-4 4-4v3z");
  const I_ROTATE = icon("M12 5V2L7.8 6.2 12 10V7c2.8 0 5 2.2 5 5 0 1.3-.5 2.5-1.3 3.4l1.4 1.4A7 7 0 0 0 12 5zm-5.1 2.2A7 7 0 0 0 12 19v3l4.2-4.2L12 14v3a5 5 0 0 1-3.7-8.4L6.9 7.2z");
  const I_INSTALL = icon("M12 3v8.2l2.6-2.6 1.4 1.4-5 5-5-5 1.4-1.4 2.6 2.6V3h2zm-7 14h14v4H5v-4z");

  const tb = createTopbar(args.ribbonEl);
  tb.setChrome({
    title: "Kitchen Layout 2026 - Floor Plan",
    projectLabel: "Project 1",
    tabs: [
      { id: "file", label: "File", accent: true },
      { label: "Architecture" },
      { label: "Modify", active: true },
      { label: "View" },
      { label: "Manage" }
    ]
  });

  const props = {
    setTitle(title: string) {
      args.propertiesEl.innerHTML = "";
      const t = document.createElement("div");
      t.className = "props-title";
      t.textContent = title;
      args.propertiesEl.appendChild(t);
    },
    section() {
      const s = document.createElement("div");
      s.className = "props-section";
      args.propertiesEl.appendChild(s);
      return s;
    },
    row(sectionEl: HTMLElement, label: string, inputEl: HTMLElement) {
      const r = document.createElement("div");
      r.className = "props-row";
      const l = document.createElement("label");
      l.textContent = label;
      bindLabelToControl(l, inputEl, label);
      r.appendChild(l);
      r.appendChild(inputEl);
      sectionEl.appendChild(r);
      return r;
    }
  };

  const showNoProps = () => {
    props.setTitle("Properties");
    const s = props.section();
    const p = document.createElement("div");
    p.className = "muted";
    p.textContent = mode === "layout" ? "Vyber objekt alebo nástroj." : "Properties sú dostupné iba v layout mode.";
    s.appendChild(p);
  };

  const mountActiveViewProps = () => {
    props.setTitle("View");
    const s = props.section();
    const row = (label: string, value: string) => {
      const el = document.createElement("div");
      el.className = "muted";
      el.style.marginTop = "4px";
      el.textContent = `${label}: ${value}`;
      s.appendChild(el);
    };
    const wallCountText = `${walls.length}`;
    const moduleCountText = `${instances.length}`;
    const worktopCountText = `${kitchenWorktops.length}`;
    if (viewMode === "3d") {
      row("View", "3D");
      row("Walls", wallCountText);
      row("Modules", moduleCountText);
      row("Worktops", worktopCountText);
      return;
    }
    if (activeViewerTab === "floorplan") {
      row("View", "Floorplan");
      row("Ortho", drawOrthoEnabled ? "ON" : "OFF");
      row("Walls", wallCountText);
      row("Modules", moduleCountText);
      row("Sections", `${sections.length}`);
      return;
    }
    if (activeViewerTab.startsWith("section:")) {
      const sectionId = activeViewerTab.slice("section:".length);
      const section = sections.find((item) => item.id === sectionId) ?? null;
      if (!section) return showNoProps();
      const basis = getSectionBasis(section.params);
      row("View", section.params.name || section.id);
      row("Type", "Section");
      row("Length", basis ? `${Math.round(basis.length * 1000)} mm` : "0 mm");
      row("Direction", section.params.mirrored ? "Mirrored" : "Default");
      row("Cut line", `${section.params.aMm.x}, ${section.params.aMm.z} -> ${section.params.bMm.x}, ${section.params.bMm.z}`);
      return;
    }
    if (activeViewerTab.startsWith("elevation:")) {
      row("View", activeViewerTab.slice("elevation:".length));
      row("Type", "Elevation");
      row("Walls", wallCountText);
      row("Modules", moduleCountText);
      row("Worktops", worktopCountText);
      return;
    }
    showNoProps();
  };

  const floorEdit = {
    active: false,
    floorId: null as string | null,
    params: null as FloorParams | null,
    snapshot: null as FloorParams | null,
    segments: [] as FloorBoundarySegment[],
    tool: "line" as FloorBoundaryTool,
    ortho: true,
    first: null as FloorBoundaryPoint | null,
    hover: null as FloorBoundaryPoint | null,
    selectedSegmentIndex: null as number | null,
    selectedVertex: null as FloorEditVertexRef | null,
    drag: null as FloorEditDrag | null,
    error: "",
    overlayEl: null as HTMLDivElement | null
  };

  const syncDrawOrthoUi = () => {
    floorEdit.ortho = drawOrthoEnabled;
    if (drawOrthoToggleEl) {
      drawOrthoToggleEl.textContent = `Ortho ${drawOrthoEnabled ? "ON" : "OFF"}`;
      drawOrthoToggleEl.style.background = drawOrthoEnabled ? "rgba(16,42,60,0.96)" : "rgba(22,24,29,0.96)";
      drawOrthoToggleEl.style.borderColor = drawOrthoEnabled ? "#53c6ff" : "rgba(255,255,255,0.14)";
      drawOrthoToggleEl.style.color = drawOrthoEnabled ? "#dff6ff" : "#d7dde6";
    }
  };

  const toggleDrawOrthoMode = () => {
    drawOrthoEnabled = !drawOrthoEnabled;
    syncDrawOrthoUi();
    if (floorEdit.active) {
      buildFloorBoundaryTopbar();
      renderFloorBoundaryEdit();
    }
    if (kitchenWorktopDraw.active && kitchenWorktopDraw.points.length > 0) {
      scheduleKitchenWorktopPreviewUpdate();
      mountProps();
    }
  };

  syncDrawOrthoUi();

  const floorPointDistMm = (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => Math.hypot(a.x - b.x, a.z - b.z);
  const floorPointEq = (a: FloorBoundaryPoint, b: FloorBoundaryPoint, tolMm = 3) => floorPointDistMm(a, b) <= tolMm;
  const worldToFloorPoint = (point: THREE.Vector3): FloorBoundaryPoint => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) });
  const floorPointToWorld = (point: FloorBoundaryPoint, y = 0.055) => new THREE.Vector3(point.x / 1000, y, point.z / 1000);
  const cloneFloorSegments = (segments: FloorBoundarySegment[]) => segments.map((segment) => ({ a: { ...segment.a }, b: { ...segment.b } }));

  const floorOrthoPoint = (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => {
    if (!drawOrthoEnabled) return raw;
    const dx = raw.x - start.x;
    const dz = raw.z - start.z;
    return Math.abs(dx) >= Math.abs(dz) ? { x: raw.x, z: start.z } : { x: start.x, z: raw.z };
  };

  const moveFloorEditVertex = (startSegments: FloorBoundarySegment[], startPoint: FloorBoundaryPoint, nextPoint: FloorBoundaryPoint) => {
    floorEdit.segments = startSegments.map((segment) => ({
      a: floorPointEq(segment.a, startPoint) ? { ...nextPoint } : { ...segment.a },
      b: floorPointEq(segment.b, startPoint) ? { ...nextPoint } : { ...segment.b }
    }));
  };

  const moveFloorEditSegment = (
    startSegments: FloorBoundarySegment[],
    segmentIndex: number,
    startWorld: FloorBoundaryPoint,
    nextWorld: FloorBoundaryPoint
  ) => {
    const segment = startSegments[segmentIndex];
    if (!segment) return;
    const dx = nextWorld.x - startWorld.x;
    const dz = nextWorld.z - startWorld.z;
    const nextA = { x: segment.a.x + dx, z: segment.a.z + dz };
    const nextB = { x: segment.b.x + dx, z: segment.b.z + dz };
    floorEdit.segments = startSegments.map((item) => ({
      a: floorPointEq(item.a, segment.a) ? { ...nextA } : floorPointEq(item.a, segment.b) ? { ...nextB } : { ...item.a },
      b: floorPointEq(item.b, segment.a) ? { ...nextA } : floorPointEq(item.b, segment.b) ? { ...nextB } : { ...item.b }
    }));
  };

  const pickFloorEditElement = (mousePx: { x: number; y: number }, rect: DOMRect) => {
    let bestVertex: { ref: FloorEditVertexRef; px: number } | null = null;
    for (let i = 0; i < floorEdit.segments.length; i++) {
      for (const endpoint of ["a", "b"] as const) {
        const p = floorEdit.segments[i][endpoint];
        const s = worldToScreen(floorPointToWorld(p), cam(), rect);
        const px = Math.hypot(mousePx.x - s.x, mousePx.y - s.y);
        if (px <= 12 && (!bestVertex || px < bestVertex.px)) bestVertex = { ref: { segmentIndex: i, endpoint }, px };
      }
    }
    if (bestVertex) return { kind: "vertex" as const, ref: bestVertex.ref };

    let bestSegment: { segmentIndex: number; px: number } | null = null;
    for (let i = 0; i < floorEdit.segments.length; i++) {
      const segment = floorEdit.segments[i];
      const a = worldToScreen(floorPointToWorld(segment.a), cam(), rect);
      const b = worldToScreen(floorPointToWorld(segment.b), cam(), rect);
      const px = distPxPointToSeg(mousePx.x, mousePx.y, a.x, a.y, b.x, b.y);
      if (px <= 10 && (!bestSegment || px < bestSegment.px)) bestSegment = { segmentIndex: i, px };
    }
    if (bestSegment) return { kind: "segment" as const, segmentIndex: bestSegment.segmentIndex };
    return null;
  };

  const floorBoundaryToSegments = (boundary: FloorBoundaryPoint[]) => {
    const segments: FloorBoundarySegment[] = [];
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i];
      const b = boundary[(i + 1) % boundary.length];
      segments.push({ a: { ...a }, b: { ...b } });
    }
    return segments;
  };

  const floorSegmentsToBoundary = (segments: FloorBoundarySegment[]) => {
    if (segments.length < 3) return null as FloorBoundaryPoint[] | null;
    const remaining = segments.map((segment) => ({ a: { ...segment.a }, b: { ...segment.b } }));
    const first = remaining.shift()!;
    const boundary: FloorBoundaryPoint[] = [{ ...first.a }, { ...first.b }];

    let closed = false;
    while (remaining.length > 0) {
      const current = boundary[boundary.length - 1];
      const index = remaining.findIndex((segment) => floorPointEq(segment.a, current) || floorPointEq(segment.b, current));
      if (index < 0) break;
      const [next] = remaining.splice(index, 1);
      boundary.push(floorPointEq(next.a, current) ? { ...next.b } : { ...next.a });
      if (boundary.length >= 4 && floorPointEq(boundary[boundary.length - 1], boundary[0])) {
        boundary.pop();
        closed = true;
        break;
      }
    }

    if (!closed && floorPointEq(boundary[boundary.length - 1], boundary[0])) {
      boundary.pop();
      closed = true;
    }
    if (boundary.length < 3) return null;
    if (!closed) return null;
    if (remaining.length > 0) return null;
    return boundary;
  };

  const clearFloorBoundaryGroup = () => {
    for (const child of [...floorBoundaryGroup.children]) {
      floorBoundaryGroup.remove(child);
      const anyChild = child as any;
      anyChild.geometry?.dispose?.();
      if (Array.isArray(anyChild.material)) for (const mat of anyChild.material) mat?.dispose?.();
      else anyChild.material?.dispose?.();
    }
  };

  const addFloorBoundaryLineMesh = (a: FloorBoundaryPoint, b: FloorBoundaryPoint, color = 0x00e5ff, opacity = 0.95) => {
    const geom = new THREE.BufferGeometry().setFromPoints([floorPointToWorld(a), floorPointToWorld(b)]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    line.renderOrder = 90;
    floorBoundaryGroup.add(line);
  };

  const addFloorBoundaryPointMesh = (p: FloorBoundaryPoint, selected: boolean) => {
    const geom = new THREE.CircleGeometry(selected ? 0.055 : 0.04, 16);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ color: selected ? 0xffd166 : 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
    );
    mesh.position.copy(floorPointToWorld(p, 0.058));
    mesh.renderOrder = 95;
    floorBoundaryGroup.add(mesh);
  };

  const renderFloorBoundaryEdit = () => {
    clearFloorBoundaryGroup();
    for (let i = 0; i < floorEdit.segments.length; i++) {
      const segment = floorEdit.segments[i];
      addFloorBoundaryLineMesh(segment.a, segment.b, floorEdit.selectedSegmentIndex === i ? 0xffd166 : 0x00e5ff);
      addFloorBoundaryPointMesh(segment.a, floorEdit.selectedVertex?.segmentIndex === i && floorEdit.selectedVertex.endpoint === "a");
      addFloorBoundaryPointMesh(segment.b, floorEdit.selectedVertex?.segmentIndex === i && floorEdit.selectedVertex.endpoint === "b");
    }

    if (floorEdit.first && floorEdit.hover) {
      if (floorEdit.tool === "rectangle") {
        const a = floorEdit.first;
        const b = floorEdit.hover;
        const p1 = { x: a.x, z: a.z };
        const p2 = { x: b.x, z: a.z };
        const p3 = { x: b.x, z: b.z };
        const p4 = { x: a.x, z: b.z };
        for (const [start, end] of [[p1, p2], [p2, p3], [p3, p4], [p4, p1]] as Array<[FloorBoundaryPoint, FloorBoundaryPoint]>) {
          addFloorBoundaryLineMesh(start, end, 0xffd166, 0.75);
        }
      } else if (floorEdit.tool === "circle") {
        const points = makeFloorCirclePoints(floorEdit.first, floorEdit.hover);
        for (let i = 0; i < points.length; i++) addFloorBoundaryLineMesh(points[i], points[(i + 1) % points.length], 0xffd166, 0.75);
      } else {
        addFloorBoundaryLineMesh(floorEdit.first, floorEdit.hover, 0xffd166, 0.75);
      }
    }

    floorBoundaryGroup.visible = floorEdit.active;
  };

  const makeFloorCirclePoints = (center: FloorBoundaryPoint, edge: FloorBoundaryPoint) => {
    const radius = Math.max(1, floorPointDistMm(center, edge));
    const points: FloorBoundaryPoint[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      points.push({ x: Math.round(center.x + Math.cos(a) * radius), z: Math.round(center.z + Math.sin(a) * radius) });
    }
    return points;
  };

  const setFloorBoundaryTool = (tool: FloorBoundaryTool) => {
    floorEdit.tool = tool;
    floorEdit.first = null;
    floorEdit.hover = null;
    clearToolHud();
    renderFloorBoundaryEdit();
    setUnderlayStatus(
      tool === "pickLines"
        ? "Floor boundary: Pick Lines — klikni hranu steny."
        : tool === "rectangle"
          ? "Floor boundary: Rectangle — klikni prvý a druhý roh."
          : tool === "circle"
            ? "Floor boundary: Circle — klikni stred a polomer."
            : "Floor boundary: Line — klikaj body boundary line."
    );
    mountProps();
  };

  const buildFloorBoundaryTopbar = () => {
    tb.clear();
    buildClassicTopbar();
    const row = tb.addRow({ title: "Floor boundary", className: "topbar-floor-ribbon" });
    const draw = tb.addGroup("Draw", { row });
    tb.toolButton(draw, { title: "Line", iconSvg: I_DIM, label: "Line", onClick: () => setFloorBoundaryTool("line") });
    tb.toolButton(draw, { title: "Rectangle", iconSvg: I_GRID2D, label: "Rectangle", onClick: () => setFloorBoundaryTool("rectangle") });
    tb.toolButton(draw, { title: "Circle", iconSvg: I_VIEW, label: "Circle", onClick: () => setFloorBoundaryTool("circle") });
    tb.toolButton(draw, { title: "Pick Lines", iconSvg: I_ALIGN, label: "Pick Lines", onClick: () => setFloorBoundaryTool("pickLines") });
    tb.toolButton(draw, {
      title: "Ortho kreslenie",
      iconSvg: I_ALIGN,
      label: drawOrthoEnabled ? "Ortho ON" : "Ortho OFF",
      onClick: () => {
        toggleDrawOrthoMode();
        buildFloorBoundaryTopbar();
        mountProps();
      }
    });
    tb.addSpacer({ row });
    const finish = tb.addGroup("Boundary", { row });
    tb.toolButton(finish, { title: "Dokončiť podlahu", iconSvg: I_DONE, label: "Dokončiť", variant: "success", onClick: () => finishFloorBoundaryEdit() });
    tb.toolButton(finish, { title: "Zrušiť", iconSvg: I_CANCEL, label: "Zrušiť", variant: "danger", onClick: () => discardFloorBoundaryEdit() });
  };

  const ensureFloorOverlay = () => {
    floorEdit.overlayEl?.remove();
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(255,255,255,0.14)";
    overlay.style.mixBlendMode = "screen";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "9";
    args.viewerEl.appendChild(overlay);
    floorEdit.overlayEl = overlay;
  };

  const enterFloorBoundaryEdit = (floorId?: string) => {
    ensureLayoutMode();
    ensureFloorplanViewerTab();
    if (placement.active) cancelPlacement(S, placementHelpers);
    setToolSelect();

    const existing = floorId ? floors.find((floor) => floor.id === floorId) ?? null : null;
    const params = existing
      ? cloneFloorParams(existing.params)
      : {
          name: `Podlaha ${floorCounter}`,
          heightMm: floorDefault.heightMm,
          thicknessMm: floorDefault.thicknessMm,
          materialId: floorDefault.materialId,
          boundary: []
        };

    floorEdit.active = true;
    floorEdit.floorId = existing?.id ?? null;
    floorEdit.params = params;
    floorEdit.snapshot = existing ? cloneFloorParams(existing.params) : null;
    floorEdit.segments = floorBoundaryToSegments(params.boundary);
    floorEdit.tool = "line";
    floorEdit.first = null;
    floorEdit.hover = null;
    floorEdit.selectedSegmentIndex = null;
    floorEdit.selectedVertex = null;
    floorEdit.drag = null;
    floorEdit.error = "";
    selectedKind = null;
    selectedFloorId = null;
    selectedWallId = null;
    selectedWallIds.clear();
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    ensureFloorOverlay();
    buildFloorBoundaryTopbar();
    renderFloorBoundaryEdit();
    setUnderlayStatus("Floor boundary: Line — kresli boundary line alebo použi Pick Lines.");
    mountProps();
  };

  const exitFloorBoundaryEditCommon = () => {
    floorEdit.active = false;
    floorEdit.floorId = null;
    floorEdit.params = null;
    floorEdit.snapshot = null;
    floorEdit.segments = [];
    floorEdit.first = null;
    floorEdit.hover = null;
    floorEdit.selectedSegmentIndex = null;
    floorEdit.selectedVertex = null;
    floorEdit.drag = null;
    floorEdit.error = "";
    floorEdit.overlayEl?.remove();
    floorEdit.overlayEl = null;
    clearFloorBoundaryGroup();
    clearToolHud();
    rebuildStandardTopbar();
    mountProps();
  };

  const finishFloorBoundaryEdit = () => {
    if (!floorEdit.active || !floorEdit.params) return;
    const boundary = floorSegmentsToBoundary(floorEdit.segments);
    if (!boundary || boundary.length < 3) {
      floorEdit.error = "Boundary line nie je uzavretá. Uzavri loop alebo doplň chýbajúce čiary.";
      setUnderlayStatus("Floor boundary: boundary musí mať aspoň 3 čiary.");
      mountProps();
      return;
    }
    floorEdit.error = "";
    floorEdit.params.boundary = boundary;
    let floor = floorEdit.floorId ? floors.find((item) => item.id === floorEdit.floorId) ?? null : null;
    if (floor) {
      floor.params = cloneFloorParams(floorEdit.params);
      rebuildFloor(floor);
    } else {
      floor = createFloor(cloneFloorParams(floorEdit.params), { skipHistory: true });
    }
    selectedFloorId = floor.id;
    selectedKind = "floor";
    exitFloorBoundaryEditCommon();
    setSelectedFloor(floor.id);
    commitHistory(S);
    setUnderlayStatus("Floor boundary: uložené.");
  };

  const discardFloorBoundaryEdit = () => {
    if (!floorEdit.active) return;
    const existing = floorEdit.floorId ? floors.find((floor) => floor.id === floorEdit.floorId) ?? null : null;
    if (existing && floorEdit.snapshot) {
      existing.params = cloneFloorParams(floorEdit.snapshot);
      rebuildFloor(existing);
    }
    exitFloorBoundaryEditCommon();
    setUnderlayStatus("Floor boundary: zrušené.");
  };

  const addFloorEditSegment = (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => {
    if (floorPointDistMm(a, b) < 2) return;
    floorEdit.error = "";
    floorEdit.segments.push({ a: { ...a }, b: { ...b } });
    renderFloorBoundaryEdit();
  };

  const mountFloorBoundaryProps = () => {
    props.setTitle("Floor Boundary");
    const s = props.section();
    const params = floorEdit.params;
    if (!params) return;

    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(params.heightMm);
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.step = "1";
    thickness.value = String(params.thicknessMm);
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = document.createElement("select");
    mat.innerHTML = getAllMaterials().map((material) => `<option value="${material.id}">${material.name}</option>`).join("");
    mat.value = params.materialId ?? floorDefault.materialId;
    props.row(s, "Materiál", mat);

    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = `Boundary lines: ${floorEdit.segments.length}. Ortho: ${floorEdit.ortho ? "ON" : "OFF"}. Horná línia je na výške úrovne, hrúbka ide vždy smerom dole.`;
    s.appendChild(info);

    if (floorEdit.error) {
      const error = document.createElement("div");
      error.style.color = "#ff6b6b";
      error.style.marginTop = "8px";
      error.textContent = floorEdit.error;
      s.appendChild(error);
    }

    height.addEventListener("change", () => {
      const next = Number(height.value);
      if (!Number.isFinite(next)) return;
      params.heightMm = Math.round(next);
      height.value = String(params.heightMm);
    });
    thickness.addEventListener("change", () => {
      const next = Number(thickness.value);
      if (!Number.isFinite(next)) return;
      params.thicknessMm = Math.max(1, Math.round(next));
      thickness.value = String(params.thicknessMm);
    });
    mat.addEventListener("change", () => {
      params.materialId = mat.value || floorDefault.materialId;
    });
  };

  const mountWallToolProps = () => {
    props.setTitle("Wall");
    const s = props.section();
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.value = String(wallDefault.thicknessMm);
    props.row(s, "Thickness (mm)", th);
    const just = document.createElement("select");
    just.innerHTML = `
      <option value="center">Center</option>
      <option value="interior">Finish face: interior</option>
      <option value="exterior">Finish face: exterior</option>
    `;
    just.value = wallDefault.justification;
    props.row(s, "Justification", just);
    const flip = document.createElement("button");
    flip.type = "button";
    flip.textContent = "Flip exterior";
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const mat = document.createElement("select");
    mat.innerHTML = `<option value="default">Default</option>`;
    mat.value = wallDefault.materialId;
    props.row(s, "Material", mat);
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni 2 body v 2D. Shift = bez axis snap. Esc = stop chain.";
    s.appendChild(hint);
    const updatePreview = () => {
      if (!wallDraw.preview || !wallDraw.a) return;
      updateWallMeshWithJustification(
        wallDraw.preview,
        wallDraw.a,
        wallDraw.hoverB ?? wallDraw.a,
        wallDefault.thicknessMm,
        wallDefault.justification,
        wallDefault.exteriorSign
      );
    };
    th.addEventListener("change", () => {
      wallDefault.thicknessMm = Math.max(10, Number(th.value) || wallDefault.thicknessMm);
      th.value = String(wallDefault.thicknessMm);
      updatePreview();
    });
    just.addEventListener("change", () => {
      wallDefault.justification =
        just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      updatePreview();
    });
    flip.addEventListener("click", () => {
      wallDefault.exteriorSign = wallDefault.exteriorSign === 1 ? -1 : 1;
      updatePreview();
      setUnderlayStatus(`Wall: exterior ${wallDefault.exteriorSign === 1 ? "left" : "right"} of Aâ†’B.`);
    });
    mat.addEventListener("change", () => {
      wallDefault.materialId = mat.value || "default";
    });
  };

  const mountKitchenWorktopToolProps = () => {
    props.setTitle("Worktop");
    const section = props.section();

    const just = document.createElement("select");
    just.innerHTML = `
      <option value="center">Center</option>
      <option value="back">Back edge</option>
      <option value="front">Front edge</option>
    `;
    just.value = kitchenWorktopDraw.justification;
    props.row(section, "Justification", just);

    const depth = document.createElement("div");
    depth.textContent = `${S.kitchenCtx.worktopDepthMm} mm`;
    props.row(section, "Depth", depth);

    const thickness = document.createElement("div");
    thickness.textContent = `${S.kitchenCtx.worktopThicknessMm} mm`;
    props.row(section, "Thickness", thickness);

    const height = document.createElement("div");
    height.textContent = `${S.kitchenCtx.heightMm} mm`;
    props.row(section, "Top Height", height);

    const material = document.createElement("div");
    material.textContent = getMaterialDefinitionById(S.kitchenCtx.worktopMaterialId)?.displayName ?? S.kitchenCtx.worktopMaterialId;
    props.row(section, "Material", material);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      "Klikaj body tvaru dosky. Môžeš pokračovať ďalšími rohmi aj pre U tvar. Esc = potvrdiť hotový tvar. Space zrkadlí dosku okolo tej istej back/front line.";
    section.appendChild(hint);

    just.addEventListener("change", () => {
      kitchenWorktopDraw.justification =
        just.value === "front" ? "front" : just.value === "center" ? "center" : "back";
      scheduleKitchenWorktopPreviewUpdate();
    });
  };

  const mountAlignToolProps = () => {
    props.setTitle("Align");
    const s = props.section();
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni referenčnú líniu, potom druhú rovnobežnú líniu (stena sa posunie alebo sa upraví koniec). Esc = zrušiť.";
    s.appendChild(hint);
    const cur = document.createElement("div");
    cur.className = "muted";
    cur.style.marginTop = "8px";
    cur.textContent = alignState.ref ? `Referencia: ${alignState.ref.label}` : "Referencia: (žiadna)";
    s.appendChild(cur);
  };

  const mountTrimToolProps = () => {
    props.setTitle("Trim");
    const s = props.section();
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni cieľovú stenu (ktorú chceš skrátiť), potom klikni reznú líniu. Esc = späť.";
    s.appendChild(hint);

    const step = document.createElement("div");
    step.className = "muted";
    step.style.marginTop = "8px";
    step.textContent = trimState.step === "pickTarget" ? "Krok: vyber cieľ" : "Krok: vyber rez";
    s.appendChild(step);

    const cur = document.createElement("div");
    cur.className = "muted";
    cur.style.marginTop = "6px";
    cur.textContent = trimState.targetPick ? `Cieľ: ${trimState.targetPick.label}` : "Cieľ: (žiadny)";
    s.appendChild(cur);
  };

  const mountMeasureToolProps = () => {
    props.setTitle("Measure");
    const s = props.section();

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      "Funguje v 2D aj 3D. Klikni prvý snap bod alebo hranu. Pri druhom bode sa v 2D zapne aj perpendicular snap na hrany. Drž Shift pre normal guide mode. Esc len vypne tool, Shift+Esc vymaže všetky uložené merania.";
    s.appendChild(hint);

    const axisWrap = document.createElement("label");
    axisWrap.style.display = "flex";
    axisWrap.style.alignItems = "center";
    axisWrap.style.gap = "8px";
    axisWrap.style.marginTop = "10px";
    const axis = document.createElement("input");
    axis.type = "checkbox";
    axis.checked = measureState.axisLock;
    axis.addEventListener("change", () => {
      measureState.axisLock = axis.checked;
      args.axisLockEl.checked = axis.checked;
    });
    axisWrap.append(axis, document.createTextNode("Axis lock (optional, 2D/3D)"));
    s.appendChild(axisWrap);

    const status = document.createElement("div");
    status.className = "muted";
    status.style.marginTop = "8px";
    status.textContent = measureState.firstPoint
      ? `Prvý bod: ${formatMm(measureState.firstPoint)}`
      : "Prvý bod: (žiadny)";
    s.appendChild(status);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.style.marginTop = "10px";
    clearBtn.addEventListener("click", () => {
      clearAllMeasurements();
      setUnderlayStatus("Measure: klikni prvý bod.");
      mountProps();
    });
    s.appendChild(clearBtn);
  };

  const mountWallProps = (w?: WallInstance) => {
    const selectedWalls =
      selectedWallIds.size > 1
        ? [...selectedWallIds]
            .map((id) => walls.find((wall) => wall.id === id))
            .filter((wall): wall is WallInstance => Boolean(wall))
        : w
          ? [w]
          : [];
    if (selectedWalls.length === 0) return showNoProps();

    const isMulti = selectedWalls.length > 1;
    const firstWall = selectedWalls[0];
    props.setTitle(isMulti ? `Steny (${selectedWalls.length})` : `Stena (${firstWall.id})`);
    const s = props.section();

    const multiVal = <K extends keyof WallParams>(items: WallInstance[], key: K) => {
      const first = items[0].params[key];
      const mixed = items.some((item) => item.params[key] !== first);
      return { value: mixed ? null : first, mixed };
    };

    const applyToSelectedWalls = (fn: (wall: WallInstance) => void) => {
      for (const wall of selectedWalls) fn(wall);
      for (const wall of walls) rebuildWall(wall);
      rebuildWallPlanMesh();
      commitHistory(S);
      mountProps();
    };

    const thickness = multiVal(selectedWalls, "thicknessMm");
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.placeholder = thickness.mixed ? "(rôzne)" : "";
    th.value = thickness.mixed ? "" : String(thickness.value);
    props.row(s, "Hrúbka (mm)", th);

    const height = multiVal(selectedWalls, "heightMm");
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.step = "1";
    heightInput.placeholder = height.mixed ? "(rôzne)" : "";
    heightInput.value = height.mixed ? "" : String(height.value);
    props.row(s, "Výška (mm)", heightInput);

    const justification = multiVal(selectedWalls, "justification");
    const just = document.createElement("select");
    just.innerHTML = `
      ${justification.mixed ? `<option value="">(rôzne)</option>` : ""}
      <option value="center">Center</option>
      <option value="interior">Finish face: interior</option>
      <option value="exterior">Finish face: exterior</option>
    `;
    just.value = justification.mixed ? "" : String(justification.value ?? "center");
    props.row(s, "Justification", just);

    th.addEventListener("change", () => {
      const next = Number(th.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.thicknessMm = Math.max(10, Math.round(next));
      });
    });
    heightInput.addEventListener("change", () => {
      const next = Number(heightInput.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.heightMm = Math.max(1, Math.round(next));
        wall.heightMm = wall.params.heightMm;
      });
    });
    just.addEventListener("change", () => {
      if (!just.value) return;
      applyToSelectedWalls((wall) => {
        wall.params.justification =
          just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      });
    });

    if (isMulti) return;

    const flip = document.createElement("button");
    flip.type = "button";
    flip.textContent = "Flip exterior";
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const mat = document.createElement("select");
    mat.innerHTML = `<option value="default">Default</option>`;
    mat.value = firstWall.params.materialId;
    props.row(s, "Material", mat);
    const len = document.createElement("div");
    len.className = "muted";
    const dx = firstWall.params.bMm.x - firstWall.params.aMm.x;
    const dz = firstWall.params.bMm.z - firstWall.params.aMm.z;
    len.textContent = `Length: ${Math.round(Math.hypot(dx, dz))} mm`;
    s.appendChild(len);
    flip.addEventListener("click", () => {
      firstWall.params.exteriorSign = (firstWall.params.exteriorSign ?? 1) === 1 ? -1 : 1;
      applyToSelectedWalls((wall) => {
        if (wall.id === firstWall.id) wall.params.exteriorSign = firstWall.params.exteriorSign;
      });
    });
    mat.addEventListener("change", () => {
      firstWall.params.materialId = mat.value || "default";
      commitHistory(S);
    });

    appendLinkedMeasureInputs(s, { kind: "wall", wallId: firstWall.id });
  };

  const mountFloorProps = (floor: FloorInstance) => {
    props.setTitle(`Podlaha (${floor.id})`);
    const s = props.section();

    const name = document.createElement("input");
    name.type = "text";
    name.value = floor.params.name;
    props.row(s, "Názov", name);

    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(floor.params.heightMm);
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.step = "1";
    thickness.value = String(floor.params.thicknessMm);
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = document.createElement("select");
    mat.innerHTML = getAllMaterials().map((material) => `<option value="${material.id}">${material.name}</option>`).join("");
    mat.value = floor.params.materialId ?? floorDefault.materialId;
    props.row(s, "Materiál", mat);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit Boundary Line";
    edit.style.marginTop = "10px";
    s.appendChild(edit);

    const commit = () => {
      floor.params.name = name.value.trim() || floor.params.name;
      floor.params.heightMm = Math.round(Number(height.value) || floor.params.heightMm);
      floor.params.thicknessMm = Math.max(1, Math.round(Number(thickness.value) || floor.params.thicknessMm));
      floor.params.materialId = mat.value || floorDefault.materialId;
      name.value = floor.params.name;
      height.value = String(floor.params.heightMm);
      thickness.value = String(floor.params.thicknessMm);
      mat.value = floor.params.materialId;
      rebuildFloor(floor);
      updateSelectionHighlights();
      commitHistory(S);
    };

    name.addEventListener("change", commit);
    height.addEventListener("change", commit);
    thickness.addEventListener("change", commit);
    mat.addEventListener("change", commit);
    edit.addEventListener("click", () => enterFloorBoundaryEdit(floor.id));

    appendLinkedMeasureInputs(s, { kind: "floor", floorId: floor.id });
  };

  const mountSectionToolProps = () => {
    props.setTitle("Section");
    const s = props.section();
    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = sectionDraw.a
      ? `Klikni druhý bod. Ortho ${drawOrthoEnabled ? "ON" : "OFF"}, Shift = bez axis snap, Space = zrkadliť smer. Aktuálne: ${sectionDraw.mirrored ? "mirrored" : "default"}.`
      : "Klikni prvý bod section line. Po druhom bode sa section vytvorí a otvorí.";
    s.appendChild(info);
  };

  const mountSectionProps = (id: string) => {
    const section = sections.find((item) => item.id === id) ?? null;
    if (!section) return showNoProps();
    props.setTitle(`Section (${section.id})`);
    const s = props.section();

    const name = document.createElement("input");
    name.type = "text";
    name.value = section.params.name;
    props.row(s, "Name", name);

    const info = document.createElement("div");
    info.className = "muted";
    info.style.marginTop = "8px";
    const basis = getSectionBasis(section.params);
    info.textContent = `A: ${section.params.aMm.x}, ${section.params.aMm.z} mm | B: ${section.params.bMm.x}, ${section.params.bMm.z} mm | Dĺžka: ${basis ? Math.round(basis.length * 1000) : 0} mm`;
    s.appendChild(info);

    const dir = document.createElement("div");
    dir.className = "muted";
    dir.style.marginTop = "6px";
    dir.textContent = `Smer: ${section.params.mirrored ? "Mirrored" : "Default"}`;
    s.appendChild(dir);

    const commit = () => {
      const nextName = name.value.trim() || section.params.name;
      if (nextName === section.params.name) {
        name.value = section.params.name;
        return;
      }
      section.params.name = nextName;
      name.value = section.params.name;
      updateAllSectionVisuals();
      mountProps();
      commitHistory(S);
    };

    name.addEventListener("change", commit);
    name.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
    });
  };

  const mountModuleProps = (id: string) => {
    const inst = findInstance(id);
    if (!inst) return showNoProps();
    props.setTitle(`Module (${inst.id})`);
    const s = props.section();
    const type = document.createElement("div");
    type.className = "muted";
    type.textContent = `Type: ${inst.params.type}`;
    s.appendChild(type);
    const pos = document.createElement("div");
    pos.className = "muted";
    pos.textContent = `Pozícia: ${Math.round(inst.root.position.x * 1000)}×${Math.round(inst.root.position.z * 1000)} mm`;
    s.appendChild(pos);

    const rowHost = document.createElement("div");
    rowHost.style.marginTop = "10px";
    s.appendChild(rowHost);

    const rot = document.createElement("input");
    rot.type = "number";
    rot.step = "1";
    rot.value = String(Math.round((inst.root.rotation.y * 180) / Math.PI));
    props.row(rowHost, "Rotation (deg)", rot);

    const pinned = document.createElement("input");
    pinned.type = "checkbox";
    pinned.checked = pinnedInstanceIds.has(inst.id);
    props.row(rowHost, "Pinned", pinned);

    const applyRot = () => {
      const n = Number(String(rot.value).trim().replace(",", "."));
      if (!Number.isFinite(n)) return;
      const deg = ((n % 360) + 360) % 360;
      const next = (deg * Math.PI) / 180;
      const prevRot = inst.root.rotation.y;
      inst.root.rotation.y = next;
      const inRoom = instanceFitsRoom(inst);
      const overlaps = anyOverlap(inst, null) || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst);
      if (!inRoom || overlaps) {
        inst.root.rotation.y = prevRot;
        rot.value = String(Math.round((prevRot * 180) / Math.PI));
        return;
      }
      commitHistory(S);
      mountProps();
    };

    rot.addEventListener("change", applyRot);
    rot.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyRot();
      if (ev.key === "Escape") {
        ev.preventDefault();
        rot.value = String(Math.round((inst.root.rotation.y * 180) / Math.PI));
        rot.select();
      }
    });

    pinned.addEventListener("change", () => {
      if (pinned.checked) pinnedInstanceIds.add(inst.id);
      else pinnedInstanceIds.delete(inst.id);
      commitHistory(S);
      mountProps();
    });

    const editorHost = document.createElement("div");
    editorHost.style.marginTop = "10px";
    s.appendChild(editorHost);

    const worktopArgs = { getWorktopThicknessMm: () => 0 };
    const onChange = (previousParams?: Record<string, unknown>, sourceKey?: string) => {
      const accepted = rebuildInstance(inst, {
        previousParams: previousParams as ModuleParams | undefined,
        preserveBackAnchor: true,
        sourceKey
      });
      if (!accepted) return false;
      commitHistory(S);
      pos.textContent = `Pozícia: ${Math.round(inst.root.position.x * 1000)}×${Math.round(inst.root.position.z * 1000)} mm`;
      mountProps();
      return true;
    };

    getModuleDescriptorOrThrow(inst.params.type).createControls(editorHost, inst.params, {
      ...worktopArgs,
      onChange,
      textInputCommitMode: "explicit",
      commitBoundary: args.propertiesEl
    });

    appendLinkedMeasureInputs(s, { kind: "module", instanceId: inst.id });
  };

  const mountWindowProps = () => {
    props.setTitle("Window");
    const s = props.section();
    const p = document.createElement("div");
    p.className = "muted";
    p.textContent = "Nastavenia okna zatiaľ zostávajú vpravo (TODO: presunúť do properties).";
    s.appendChild(p);
  };

  const mountUnderlayProps = () => {
    props.setTitle("Underlay");
    const s = props.section();

    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".png,.pdf,image/png,application/pdf";
    props.row(s, "Upload", file);

    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0";
    opacity.max = "1";
    opacity.step = "0.01";
    opacity.value = String(underlayState.opacity);
    props.row(s, "Opacity", opacity);
    S.underlayOpacityEl = opacity;

    const scale = document.createElement("input");
    scale.type = "number";
    scale.step = "0.01";
    scale.value = String(underlayState.scale);
    props.row(s, "Scale", scale);
    underlayScaleEl = scale;
    S.underlayScaleEl = scale;

    const rot = document.createElement("input");
    rot.type = "number";
    rot.step = "1";
    rot.value = String(underlayState.rotationDeg);
    props.row(s, "Rotation °", rot);
    S.underlayRotEl = rot;

    const offX = document.createElement("input");
    offX.type = "number";
    offX.step = "1";
    offX.value = String(underlayState.offsetMm.x);
    props.row(s, "Offset X", offX);
    underlayOffXEl = offX;
    S.underlayOffXEl = offX;

    const offZ = document.createElement("input");
    offZ.type = "number";
    offZ.step = "1";
    offZ.value = String(underlayState.offsetMm.z);
    props.row(s, "Offset Z", offZ);
    underlayOffZEl = offZ;
    S.underlayOffZEl = offZ;

    const known = document.createElement("input");
    known.type = "number";
    known.step = "1";
    known.value = String(underlayCal.knownMm);
    props.row(s, "Calibrate mm", known);

    const pinned = document.createElement("input");
    pinned.type = "checkbox";
    pinned.checked = underlayState.pinned;
    props.row(s, "Pinned", pinned);

    const actions = document.createElement("div");
    actions.className = "actions";
    const calibrateBtn = document.createElement("button");
    calibrateBtn.type = "button";
    calibrateBtn.textContent = "Calibrate";
    const resetScaleBtn = document.createElement("button");
    resetScaleBtn.type = "button";
    resetScaleBtn.textContent = "Reset scale";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Remove";
    clearBtn.style.borderColor = "#3a1f23";
    clearBtn.style.background = "#1a0f12";
    clearBtn.style.color = "#ff6b6b";
    actions.appendChild(calibrateBtn);
    actions.appendChild(resetScaleBtn);
    actions.appendChild(clearBtn);
    s.appendChild(actions);

    underlayStatusEl = document.createElement("div");
    underlayStatusEl.className = "muted";
    underlayStatusEl.style.fontSize = "12px";
    underlayStatusEl.style.marginTop = "10px";
    underlayStatusEl.textContent = underlayMesh.visible ? `Underlay: ${underlayState.sourceName ?? "loaded"}` : "Upload PDF/PNG underlay.";
    S.underlayStatusEl = underlayStatusEl;
    s.appendChild(underlayStatusEl);

    file.addEventListener("change", async () => {
      ensureLayoutMode();
      const f = file.files?.[0] ?? null;
      if (!f) return;
      setUnderlayStatus("Loading...");
      try {
        const res = await loadUnderlayToCanvas(f);
        setUnderlayFromCanvas(res.canvas, res.name, res.kind);
        opacity.value = String(underlayState.opacity);
        scale.value = String(underlayState.scale);
        rot.value = String(underlayState.rotationDeg);
        offX.value = String(underlayState.offsetMm.x);
        offZ.value = String(underlayState.offsetMm.z);
        pinned.checked = underlayState.pinned;
        setUnderlayStatus(`Underlay: ${res.name}`);
        setSelectedUnderlay();
        commitHistory(S);
      } catch (e) {
        setUnderlayStatus(`Load failed: ${(e as Error).message}`);
      } finally {
        file.value = "";
      }
    });

    opacity.addEventListener("input", () => {
      underlayState.opacity = Math.min(1, Math.max(0, Number(opacity.value) || 0));
      updateUnderlayTransform();
    });
    scale.addEventListener("change", () => {
      underlayState.scale = Math.max(0.001, Number(scale.value) || 1);
      updateUnderlayTransform();
      commitHistory(S);
    });
    rot.addEventListener("change", () => {
      underlayState.rotationDeg = Number(rot.value) || 0;
      updateUnderlayTransform();
      commitHistory(S);
    });
    offX.addEventListener("change", () => {
      underlayState.offsetMm.x = Number(offX.value) || 0;
      updateUnderlayTransform();
      commitHistory(S);
    });
    offZ.addEventListener("change", () => {
      underlayState.offsetMm.z = Number(offZ.value) || 0;
      updateUnderlayTransform();
      commitHistory(S);
    });
    pinned.addEventListener("change", () => {
      underlayState.pinned = pinned.checked;
      S.underlayState.pinned = underlayState.pinned;
      if (underlayState.pinned) setSelectedModule(null);
      commitHistory(S);
      mountProps();
    });
    calibrateBtn.addEventListener("click", () => {
      ensureLayoutMode();
      if (!underlayMesh.visible) {
        setUnderlayStatus("Upload underlay first.");
        return;
      }
      underlayCal.knownMm = Math.max(1, Number(known.value) || 1);
      underlayCal.active = true;
      underlayCal.mode = "calibrate";
      underlayCal.first = null;
      setUnderlayStatus("Calibration: click first point...");
    });
    resetScaleBtn.addEventListener("click", () => {
      underlayState.scale = 1;
      scale.value = "1";
      updateUnderlayTransform();
      commitHistory(S);
      setUnderlayStatus("Scale reset.");
    });
    clearBtn.addEventListener("click", () => {
      clearUnderlay();
      setSelectedModule(null);
      selectedKind = "underlay";
      commitHistory(S);
      mountProps();
    });
  };

  let kitchenMode: ReturnType<typeof createKitchenEditMode> | null = null;

  const mountProps = () => {
    if (mode !== "layout") return showNoProps();
    if (floorEdit.active) return mountFloorBoundaryProps();
    if (placement.active) return mountPlacementControls(S, placementHelpers);
    if (layoutTool === "wall") return mountWallToolProps();
    if (layoutTool === "measure") return mountMeasureToolProps();
    if (layoutTool === "section") return mountSectionToolProps();
    if (S.kitchenEditMode && kitchenWorktopDraw.active) return mountKitchenWorktopToolProps();
    if (layoutTool === "align") return mountAlignToolProps();
    if (layoutTool === "trim") return mountTrimToolProps();
    if (selectedKind === "kitchenGroup" && selectedKitchenGroupId && kitchenMode?.mountKitchenGroupProps(selectedKitchenGroupId)) {
      const section = args.propertiesEl.querySelector(".props-section:last-of-type") as HTMLElement | null;
      if (section) {
        appendLinkedMeasureInputs(section, {
          kind: "kitchenGroup",
          groupId: selectedKitchenGroupId,
          instanceIds: new Set(instances.filter((inst) => inst.kitchenGroupId === selectedKitchenGroupId).map((inst) => inst.id)),
          worktopIds: new Set(
            kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === selectedKitchenGroupId).map((worktop) => worktop.id)
          )
        });
      }
      return;
    }
    if (selectedKind === "underlay") return mountUnderlayProps();
    if (selectedWallIds.size > 1 && selectedInstanceIds.size === 0) return mountWallProps();
    if (selectedWallIds.size + selectedInstanceIds.size > 1) {
      args.propertiesEl.innerHTML = "";
      const t = document.createElement("div");
      t.className = "props-title";
      t.textContent = "Properties";
      args.propertiesEl.appendChild(t);
      const s = document.createElement("div");
      s.className = "props-section";
      s.innerHTML = `<div class="muted">Selected: ${selectedWallIds.size} wall(s), ${selectedInstanceIds.size} module(s)</div>
      <div class="muted" style="margin-top:6px;">Delete = remove selected</div>`;
      args.propertiesEl.appendChild(s);
      return;
    }
    if (selectedKind === "wall") {
      const w = walls.find((x) => x.id === selectedWallId) ?? null;
      if (w) return mountWallProps(w);
      return showNoProps();
    }
    if (selectedKind === "floor" && selectedFloorId) {
      const floor = floors.find((x) => x.id === selectedFloorId) ?? null;
      if (floor) return mountFloorProps(floor);
      return showNoProps();
    }
    if (selectedKind === "window") return mountWindowProps();
    if (selectedKind === "section" && selectedSectionId) return mountSectionProps(selectedSectionId);
    if (selectedKind === "module" && selectedInstanceId) return mountModuleProps(selectedInstanceId);
    if (kitchenMode && kitchenMode.tryMountActiveKitchenGroupProps()) return;
    mountActiveViewProps();
  };

  helpers = {
    setSelectedWall,
    setSelectedFloor,
    setSelectedModule,
    updateSelectionHighlights,
    disposeObject3D,
    createInstance,
    createWallMesh,
    createWallOutline,
    rebuildWall,
    rebuildWallPlanMesh,
    restoreFloors: restoreFloorsFromSnapshot,
    restoreSections: restoreSectionsFromSnapshot,
    restoreWorktops: restoreKitchenWorktopsFromSnapshot,
    clearToolHud,
    mountProps,
    setSelectedSection,
    updateLayoutPanel,
    layoutRoot
  };

  placementHelpers = {
    props,
    layoutRoot,
    setUnderlayStatus,
    getBuildParams: (type) => (params.type === type ? (structuredClone(params) as ModuleParams) : null),
    createInstance,
    disposeObject3D,
    updateLayoutPanel,
    mountProps,
    setSelectedModule,
    applyWallConstraints,
    roomContainsBoxXZ,
    instanceWorldBox,
    anyOverlap,
    moduleOverlapsWalls,
    moduleOverlapsKitchenWorktops,
    autoOrientModuleToRoomWallIfSnapped,
    resolveModuleAdjacencySnap,
    setPlacementAdjacencyPreview,
    finalizePlacedInstance,
    syncPlacedInstancePresentation,
    resolvePlacementConstraint: getKitchenPlacementConstraint
  };


  let rebuildStandardTopbar = () => {};
  const openUnderlayPanel = () => {
    ensureLayoutMode();
    if (placement.active) cancelPlacement(S, placementHelpers);
    setToolSelect();
    if (underlayMesh.visible && !underlayState.pinned) {
      setSelectedUnderlay();
      return;
    }
    setSelectedWall(null);
    setSelectedModule(null);
    selectedKind = "underlay";
    mountProps();
  };

  const duplicateSelected = () => {
    ensureLayoutMode();
    if (selectedKind !== "module" || !selectedInstanceId) return;
    duplicateInstance(selectedInstanceId);
    commitHistory(S);
  };

  const deleteSelected = () => {
    ensureLayoutMode();
    if (selectedKind === "kitchenGroup") return;
    if (selectedKind === "section" && selectedSectionId) {
      deleteSectionInstance(selectedSectionId);
      setSelectedSection(null);
      mountProps();
      return;
    }
    if (selectedKind === "floor" && selectedFloorId) {
      deleteFloor(selectedFloorId);
      setSelectedFloor(null);
      return;
    }
    if (selectedKind === "module" && selectedInstanceIds.size > 0) {
      const ids = Array.from(selectedInstanceIds);
      for (const id of ids) deleteInstance(id);
      setSelectedModule(null);
      selectedInstanceIds.clear();
      commitHistory(S);
      return;
    }
    if (selectedKind === "wall" && selectedWallIds.size > 0) {
      const ids = Array.from(selectedWallIds);
      for (const id of ids) deleteWall(id);
      setSelectedWall(null);
      selectedWallIds.clear();
    }
  };

  const toggle2dView = () => {
    ensureLayoutMode();
    view2d.checked = !view2d.checked;
    setView2d(view2d.checked);
  };

  floorplanTab.addEventListener("click", () => {
    if (mode !== "layout") return;
    activateViewerTab("floorplan");
  });

  view3dTab.addEventListener("click", () => {
    if (mode !== "layout") return;
    activateViewerTab("3d");
  });

  const openBomPanel = () => {
    const overlay = document.createElement("div");
    overlay.className = "bom-modal";

    const panel = document.createElement("div");
    panel.className = "bom-modal__panel";
    overlay.appendChild(panel);

    const header = document.createElement("div");
    header.className = "bom-modal__header";
    panel.appendChild(header);

    const title = document.createElement("h2");
    title.textContent = "BOM";
    title.className = "bom-modal__title";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Zavrieť";
    closeBtn.className = "bom-modal__close";
    header.appendChild(closeBtn);

    const content = document.createElement("div");
    content.className = "bom-modal__content";
    panel.appendChild(content);

    const close = () => overlay.remove();
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });

    mountBomDevPanel(content, S.instances, S.kitchenWorktops, S.kitchenCtx);
    document.body.appendChild(overlay);
  };

  const openPricingCatalog = () => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "1000";
    overlay.style.background = "rgba(0,0,0,0.72)";
    overlay.style.display = "grid";
    overlay.style.gridTemplateRows = "1fr";
    overlay.style.padding = "20px";

    const panel = document.createElement("div");
    panel.style.width = "calc(100vw - 40px)";
    panel.style.height = "calc(100vh - 40px)";
    panel.style.overflow = "auto";
    panel.style.background = "#0b0f14";
    panel.style.border = "1px solid #303746";
    panel.style.borderRadius = "14px";
    panel.style.boxShadow = "0 24px 80px rgba(0,0,0,0.45)";
    panel.style.padding = "20px";
    overlay.appendChild(panel);

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";
    header.style.marginBottom = "14px";
    panel.appendChild(header);

    const title = document.createElement("h2");
    title.textContent = "Pricing Catalog";
    title.style.margin = "0";
    title.style.color = "#eef2ff";
    title.style.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Zavrieť";
    closeBtn.style.background = "#0e1118";
    closeBtn.style.color = "#eef2ff";
    closeBtn.style.border = "1px solid #303746";
    closeBtn.style.borderRadius = "6px";
    closeBtn.style.padding = "7px 10px";
    header.appendChild(closeBtn);

    const content = document.createElement("div");
    panel.appendChild(content);

    const close = () => overlay.remove();
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });

    mountPricingCatalogPanel(content);
    document.body.appendChild(overlay);
  };

  const buildClassicTopbar = () => {
    const row = tb.addRow({ className: "topbar-classic-ribbon" });

    const tools = tb.addGroup("Layout", { row });
    tb.toolButton(tools, { title: "Select", label: "Select", iconSvg: I_SELECT, onClick: () => setToolSelect() });
    tb.toolButton(tools, { title: "Wall", label: "Wall", iconSvg: I_WALL, onClick: () => setToolWall() });
    tb.toolButton(tools, { title: "Align", label: "Align", iconSvg: I_ALIGN, onClick: () => setToolAlign() });
    tb.toolButton(tools, { title: "Trim", label: "Trim", iconSvg: I_TRIM, onClick: () => setToolTrim() });
    tb.toolButton(tools, { title: "Section", label: "Section", iconSvg: I_SECTION, onClick: () => setToolSection() });
    tb.toolButton(tools, {
      title: "Dimension",
      label: "Kóta",
      iconSvg: I_DIM,
      onClick: () => setToolDimension()
    });
    tb.toolButton(tools, {
      title: "Measure",
      label: "Measure",
      iconSvg: I_DIM,
      onClick: () => {
        if (layoutTool === "measure") setToolSelect();
        else setToolMeasure();
      }
    });
    tb.toolButton(tools, { title: "Floor", label: "Floor", iconSvg: I_FLOOR, onClick: () => enterFloorBoundaryEdit() });
    tb.toolButton(tools, { title: "Underlay", label: "Underlay", iconSvg: I_UNDERLAY, onClick: openUnderlayPanel });
    tb.toolButton(tools, { title: "Kitchen", label: "Kitchen", iconSvg: I_CABINET, onClick: () => kitchenMode?.enterNew() });

    const edit = tb.addGroup("Edit", { row });
    S.undoBtnEl = tb.toolButton(edit, { title: "Undo", label: "Undo", iconSvg: I_UNDO, onClick: () => undo(S, helpers) });
    S.redoBtnEl = tb.toolButton(edit, { title: "Redo", label: "Redo", iconSvg: I_REDO, onClick: () => redo(S, helpers) });
    tb.toolButton(edit, { title: "Move", label: "Move", iconSvg: I_MOVE, onClick: () => startTransformFromSelection("move") });
    tb.toolButton(edit, { title: "Rotate", label: "Rotate", iconSvg: I_ROTATE, onClick: () => startTransformFromSelection("rotate") });
    tb.toolButton(edit, { title: "Duplicate", label: "Duplicate", iconSvg: I_DUP, onClick: duplicateSelected });
    tb.toolButton(edit, { title: "Delete", label: "Delete", iconSvg: I_TRASH, onClick: deleteSelected });

    const project = tb.addGroup("Project", { row });
    tb.toolButton(project, { title: "2D View", label: "2D View", iconSvg: I_GRID2D, onClick: toggle2dView });
    tb.toolButton(project, { title: "Reset Defaults", label: "Reset", iconSvg: I_RESET, onClick: () => args.resetBtn.click() });
    tb.toolButton(project, { title: "Export JSON", label: "Export", iconSvg: I_EXPORT, onClick: () => args.exportBtn.click() });
    tb.toolButton(project, { title: "Copy Export", label: "Copy", iconSvg: I_COPY, onClick: () => args.copyBtn.click() });
    tb.toolButton(project, { title: "Pricing Catalog", iconSvg: I_BOM, label: "Catalog", onClick: openPricingCatalog });
    tb.toolButton(project, { title: "BOM", iconSvg: I_BOM, label: "BOM", onClick: openBomPanel });
    const installBtn = tb.toolButton(project, {
      title: "Install App",
      label: "Install",
      iconSvg: I_INSTALL,
      onClick: () => {
        const state = getInstallState();
        if (state.available) {
          void promptAppInstall();
          return;
        }
        window.alert("Chrome: Save and share > Install page as app.");
      }
    });
    const syncInstallButton = () => {
      const state = getInstallState();
      installBtn.style.display = state.supported && !state.installed ? "" : "none";
      installBtn.style.opacity = state.available ? "1" : "0.72";
      installBtn.title = state.available ? "Install App" : "Install App (Chrome menu)";
    };
    syncInstallButton();
    subscribeInstallState(syncInstallButton);
    const resetViewBtn = args.viewerEl.querySelector("#resetViewBtn") as HTMLButtonElement | null;
    tb.toolButton(project, { title: "Reset View", label: "View", iconSvg: I_VIEW, onClick: () => resetViewBtn?.click() });

    updateUndoRedoUi(S);
  };

  kitchenMode = createKitchenEditMode({
    S,
    layoutRoot,
    viewerEl: args.viewerEl,
    tb,
    props,
    icons: { cabinet: I_CABINET, worktop: I_FLOOR, done: I_DONE, cancel: I_CANCEL },
    ensureLayoutMode,
    ensureFloorplanViewerTab: () => ensureFloorplanViewerTab(),
    setToolSelect,
    cancelPlacementIfActive: () => {
      if (placement.active) cancelPlacement(S, placementHelpers);
    },
    addInstance: (type) => addInstance(S, placementHelpers, type),
    rebuildInstance,
    rebuildKitchenGroupLayout,
    disposeObject3D,
    createInstance,
    findInstance,
    setSelectedModule,
    updateLayoutPanel,
    startWorktopDraw: startKitchenWorktopDraw,
    cancelWorktopDraw: cancelKitchenWorktopDraw,
    handleWorktopEscape: handleKitchenWorktopEscape,
    refreshWorktopPreview: updateKitchenWorktopPreview,
    getGroupWorktops: getKitchenGroupWorktops,
    replaceGroupWorktops: replaceKitchenGroupWorktops,
    rebuildGroupWorktops: (groupId, ctx) => rebuildKitchenGroupWorktops(groupId, ctx),
    buildClassicTopbar,
    restoreStandardTopbar: () => rebuildStandardTopbar(),
    refreshProps: () => mountProps()
  });

  rebuildStandardTopbar = () => {
    tb.clear();
    buildClassicTopbar();
  };

  rebuildStandardTopbar();

  view2d.addEventListener("change", () => {
    if (mode !== "layout") return;
    setView2d(view2d.checked);
  });

  function findInstance(id: string) {
    return instances.find((x) => x.id === id) ?? null;
  }

  function moduleRootLocalBox(root: THREE.Object3D, module: THREE.Object3D) {
    root.updateMatrixWorld(true);
    module.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    const childBox = new THREE.Box3();
    const relativeMatrix = new THREE.Matrix4();
    module.traverse((obj) => {
      const geometry = (obj as THREE.Mesh | THREE.LineSegments).geometry as THREE.BufferGeometry | undefined;
      if (!geometry) return;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      relativeMatrix.multiplyMatrices(rootInverse, obj.matrixWorld);
      childBox.copy(geometry.boundingBox).applyMatrix4(relativeMatrix);
      box.union(childBox);
    });
    return box;
  }

  function instanceVisualWorldBox(inst: LayoutInstance) {
    inst.root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(inst.module);
  }

  function instanceLayoutWorldBox(inst: LayoutInstance) {
    const visualBox = instanceVisualWorldBox(inst);
    const polygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
    if (polygon.length === 0) return visualBox;
    const xs = polygon.map((point) => point.x);
    const zs = polygon.map((point) => point.z);
    return new THREE.Box3(
      new THREE.Vector3(Math.min(...xs), visualBox.min.y, Math.min(...zs)),
      new THREE.Vector3(Math.max(...xs), visualBox.max.y, Math.max(...zs))
    );
  }

  function instanceWorldBox(inst: LayoutInstance) {
    return instanceLayoutWorldBox(inst);
  }

  function footprintExtentsMatchXZ(a: THREE.Box3, b: THREE.Box3, eps = 1e-6) {
    return (
      Math.abs((a.max.x - a.min.x) - (b.max.x - b.min.x)) <= eps &&
      Math.abs((a.max.z - a.min.z) - (b.max.z - b.min.z)) <= eps
    );
  }

  function instanceFitsRoom(inst: LayoutInstance) {
    return roomContainsBoxXZ(instanceLayoutWorldBox(inst));
  }

  function instanceFitsLayoutBounds(inst: LayoutInstance) {
    if (inst.kitchenGroupId) return true;
    return instanceFitsRoom(inst);
  }

  function roomContainsBoxXZ(box: THREE.Box3, eps = 0.0005) {
    return (
      box.min.x >= -roomBounds.halfW - eps &&
      box.max.x <= roomBounds.halfW + eps &&
      box.min.z >= -roomBounds.halfD - eps &&
      box.max.z <= roomBounds.halfD + eps
    );
  }

  function buildModulePlanPickGeometry(polygon: THREE.Vector3[]) {
    const shape = new THREE.Shape();
    polygon.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  function ensurePickAndOutline(inst: LayoutInstance, flattenToPlan = viewMode === "2d" && activeViewerTab === "floorplan") {
    const polygon = getModulePlanLocalPolygon(inst, getModuleLocalBackCenter);
    const bounds = getModulePlanLocalRect(inst, getModuleLocalBackCenter);
    const xs = bounds.map((point) => point.x);
    const zs = bounds.map((point) => point.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    inst.pick.geometry.dispose();
    if (flattenToPlan) {
      inst.pick.geometry = buildModulePlanPickGeometry(polygon);
      inst.pick.position.set(0, 0.015, 0);
      inst.pick.rotation.set(0, 0, 0);
    } else {
      const width = Math.max(0.001, maxX - minX);
      const depth = Math.max(0.001, maxZ - minZ);
      inst.pick.geometry = new THREE.BoxGeometry(width, 0.03, depth);
      inst.pick.position.set((minX + maxX) * 0.5, 0.015, (minZ + maxZ) * 0.5);
      inst.pick.rotation.set(0, 0, 0);
    }
    inst.pick.visible = true;

    const pickMaterial = inst.pick.material as THREE.MeshBasicMaterial;
    pickMaterial.transparent = true;
    pickMaterial.depthWrite = false;
    pickMaterial.depthTest = false;
    pickMaterial.color.setHex(0xc5cfdb);
    pickMaterial.opacity = viewMode === "2d" ? 0.18 : 0;

    const g = buildModuleEdgeGeometry(inst, flattenToPlan);
    inst.outline.geometry.dispose();
    inst.outline.geometry = g;
    inst.outline.position.set(0, 0, 0);
  }

  function buildModuleEdgeGeometry(inst: LayoutInstance, flattenToPlan: boolean) {
    if (flattenToPlan) {
      const polygon = getModulePlanLocalPolygon(inst, getModuleLocalBackCenter);
      const points: THREE.Vector3[] = [];
      for (let index = 0; index < polygon.length; index += 1) {
        const a = polygon[index]!;
        const b = polygon[(index + 1) % polygon.length]!;
        points.push(new THREE.Vector3(a.x, 0.01, a.z), new THREE.Vector3(b.x, 0.01, b.z));
      }
      return new THREE.BufferGeometry().setFromPoints(points);
    }

    inst.root.updateMatrixWorld(true);
    inst.module.updateMatrixWorld(true);

    const rootInv = inst.root.matrixWorld.clone().invert();
    const points: THREE.Vector3[] = [];
    const seen = new Set<string>();

    const pushSegment = (a: THREE.Vector3, b: THREE.Vector3) => {
      const ay = flattenToPlan ? 0.01 : a.y;
      const by = flattenToPlan ? 0.01 : b.y;
      const aa = new THREE.Vector3(a.x, ay, a.z);
      const bb = new THREE.Vector3(b.x, by, b.z);

      const ax = Math.round(aa.x * 10000);
      const ayi = Math.round(aa.y * 10000);
      const az = Math.round(aa.z * 10000);
      const bx = Math.round(bb.x * 10000);
      const byi = Math.round(bb.y * 10000);
      const bz = Math.round(bb.z * 10000);
      const same = ax === bx && ayi === byi && az === bz;
      if (same) return;

      const key =
        ax < bx || (ax === bx && (ayi < byi || (ayi === byi && az <= bz)))
          ? `${ax},${ayi},${az}|${bx},${byi},${bz}`
          : `${bx},${byi},${bz}|${ax},${ayi},${az}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push(aa, bb);
    };

    inst.module.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const edgeGeom = new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry, 1);
      const pos = edgeGeom.getAttribute("position");
      const toRoot = rootInv.clone().multiply(mesh.matrixWorld);

      for (let i = 0; i < pos.count; i += 2) {
        const a = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(toRoot);
        const b = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)).applyMatrix4(toRoot);
        if (flattenToPlan) {
          if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-5) continue;
        } else {
          if (a.distanceToSquared(b) < 1e-10) continue;
        }
        pushSegment(a, b);
      }

      edgeGeom.dispose();
    });

    if (points.length === 0) {
      const min = inst.localBox.min;
      const max = inst.localBox.max;
      const y = flattenToPlan ? 0.01 : min.y;
      if (flattenToPlan) {
        points.push(
          new THREE.Vector3(min.x, y, min.z),
          new THREE.Vector3(max.x, y, min.z),
          new THREE.Vector3(max.x, y, min.z),
          new THREE.Vector3(max.x, y, max.z),
          new THREE.Vector3(max.x, y, max.z),
          new THREE.Vector3(min.x, y, max.z),
          new THREE.Vector3(min.x, y, max.z),
          new THREE.Vector3(min.x, y, min.z)
        );
      } else {
        const corners = [
          new THREE.Vector3(min.x, min.y, min.z),
          new THREE.Vector3(max.x, min.y, min.z),
          new THREE.Vector3(max.x, min.y, max.z),
          new THREE.Vector3(min.x, min.y, max.z),
          new THREE.Vector3(min.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, max.z),
          new THREE.Vector3(min.x, max.y, max.z)
        ];
        const edges: Array<[number, number]> = [
          [0, 1], [1, 2], [2, 3], [3, 0],
          [4, 5], [5, 6], [6, 7], [7, 4],
          [0, 4], [1, 5], [2, 6], [3, 7]
        ];
        for (const [i0, i1] of edges) points.push(corners[i0], corners[i1]);
      }
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  function tagModuleGeometry(module: THREE.Object3D, instanceId: string) {
    module.userData.kind = "module";
    module.userData.instanceId = instanceId;
    module.traverse((obj: any) => {
      obj.userData.kind = "module";
      obj.userData.instanceId = instanceId;
    });
  }

  function getInstanceGeometryMeshes(inst: LayoutInstance) {
    if (viewMode === "2d") return [inst.pick];
    const meshes: THREE.Mesh[] = [];
    inst.module.traverse((obj: any) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      meshes.push(mesh);
    });
    return meshes;
  }

  function getAllInstanceGeometryMeshes() {
    return instances.flatMap((inst) => getInstanceGeometryMeshes(inst));
  }

  function getKitchenWorktopGeometryMeshes() {
    return kitchenWorktops.flatMap((worktop) => {
      if (viewMode === "2d") return worktop.mesh.visible ? [worktop.mesh] : [];
      return worktop.mesh.visible ? [worktop.mesh] : [];
    });
  }

  function getMeasure3DSnapTargetObject(obj: THREE.Object3D | null | undefined) {
    if (!obj) return null;
    const instanceId = getInstanceIdFromObject(obj);
    if (instanceId) {
      const inst = findInstance(instanceId);
      if (inst) return inst.module;
    }

    const worktopId = getWorktopIdFromObject(obj);
    if (worktopId) {
      const worktop = kitchenWorktops.find((item) => item.id === worktopId) ?? null;
      if (worktop) return worktop.mesh;
    }

    const kind = obj.userData?.kind as string | undefined;
    if (kind === "window" && windowInst) return windowInst.root;

    const wallId = obj.userData?.wallId as string | undefined;
    if (wallId) {
      const wall = walls.find((item) => item.id === wallId) ?? null;
      if (wall) return wall.mesh;
    }

    const floorId = obj.userData?.floorId as string | undefined;
    if (floorId) {
      const floor = floors.find((item) => item.id === floorId) ?? null;
      if (floor) return floor.mesh;
    }

    return obj;
  }

  function getLayoutMeasureMeshes3d() {
    const meshes: THREE.Mesh[] = [];
    meshes.push(...getAllInstanceGeometryMeshes());
    meshes.push(...getKitchenWorktopGeometryMeshes());
    for (const wall of walls) if (wall.mesh.visible) meshes.push(wall.mesh);
    for (const floor of floors) if (floor.mesh.visible) meshes.push(floor.mesh);
    if (windowInst?.pick.visible) meshes.push(windowInst.pick);
    return meshes;
  }

  function getInstanceIdFromObject(obj: THREE.Object3D | null | undefined) {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.instanceId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  }

  function getWorktopIdFromObject(obj: THREE.Object3D | null | undefined) {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.worktopId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  }

  function getSectionIdFromObject(obj: THREE.Object3D | null | undefined) {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.sectionId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  }

  function getSectionPickMeshes() {
    return sections.map((section) => section.pick);
  }

  function findKitchenWorktop(id: string) {
    return kitchenWorktops.find((worktop) => worktop.id === id) ?? null;
  }

  function keepStickyPlanSnap(
    rawPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx = 20
  ) {
    if (!sticky || sticky.kind === "none") return null;
    const rawScreen = worldToScreen(rawPoint, camera, rect);
    const stickyScreen = worldToScreen(sticky.point, camera, rect);
    const dx = rawScreen.x - stickyScreen.x;
    const dy = rawScreen.y - stickyScreen.y;
    if (Math.hypot(dx, dy) > thresholdPx) return null;
    return {
      point: sticky.point.clone(),
      kind: sticky.kind,
      a: sticky.a?.clone() ?? null,
      b: sticky.b?.clone() ?? null,
      owner: sticky.owner
    } satisfies PlanSnapResult;
  }

  const getNavigationSceneBounds = () => {
    const box = new THREE.Box3();
    if (mode !== "layout") {
      if (cabinetGroup) box.expandByObject(cabinetGroup);
      if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
      return box.expandByScalar(0.08);
    }
    for (const wall of walls) box.expandByObject(wall.root);
    for (const floor of floors) box.expandByObject(floor.root);
    for (const inst of instances) box.expandByObject(inst.root);
    for (const worktop of kitchenWorktops) box.expandByObject(worktop.root);
    if (windowInst) box.expandByObject(windowInst.root);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2.6, 1));
    return box.expandByScalar(0.05);
  };

  const applyMaterialClippingPlanes = (material: THREE.Material | THREE.Material[] | undefined, planes: THREE.Plane[]) => {
    const nextPlanes = planes.map((plane) => plane.clone());
    const applyOne = (mat: THREE.Material) => {
      (mat as THREE.Material & { clippingPlanes?: THREE.Plane[] }).clippingPlanes = nextPlanes;
      mat.needsUpdate = true;
    };
    if (Array.isArray(material)) {
      for (const mat of material) applyOne(mat);
      return;
    }
    if (material) applyOne(material);
  };

  const applyMaterialOpacityMode = (
    material: THREE.Material | THREE.Material[] | undefined,
    transparent: boolean,
    opacity: number,
    depthWrite: boolean
  ) => {
    const applyOne = (mat: THREE.Material) => {
      if (!("opacity" in mat)) return;
      mat.transparent = transparent;
      mat.opacity = opacity;
      mat.depthWrite = depthWrite;
      mat.needsUpdate = true;
    };
    if (Array.isArray(material)) {
      for (const mat of material) applyOne(mat);
      return;
    }
    if (material) applyOne(material);
  };

  const syncDetailClippingAndMaterials = () => {
    const detailPlanes = viewMode === "2d" && activeViewerTab !== "floorplan" ? activeDetailClipPlanes : [];
    const isSectionDetailView = viewMode === "2d" && activeViewerTab.startsWith("section:");
    renderer.clippingPlanes = [];

    for (const wall of walls) {
      applyMaterialClippingPlanes(wall.mesh.material, detailPlanes);
      applyMaterialOpacityMode(
        wall.mesh.material,
        viewMode === "2d",
        viewMode === "2d" ? (activeViewerTab === "floorplan" ? 1 : isSectionDetailView ? 0.07 : 0.16) : 1,
        viewMode !== "2d"
      );
    }

    for (const floor of floors) {
      applyMaterialClippingPlanes(floor.mesh.material, detailPlanes);
      applyMaterialOpacityMode(floor.mesh.material, false, 1, true);
    }

    for (const worktop of kitchenWorktops) {
      applyMaterialClippingPlanes(worktop.mesh.material, detailPlanes);
      applyMaterialOpacityMode(
        worktop.mesh.material,
        viewMode === "2d",
        viewMode === "2d" ? (activeViewerTab === "floorplan" ? 0.35 : 0.16) : 1,
        viewMode !== "2d"
      );
    }

    for (const inst of instances) {
      inst.module.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        applyMaterialClippingPlanes(mesh.material as THREE.Material | THREE.Material[], detailPlanes);
        applyMaterialOpacityMode(
          mesh.material as THREE.Material | THREE.Material[],
          viewMode === "2d" && activeViewerTab !== "floorplan",
          viewMode === "2d" && activeViewerTab !== "floorplan" ? (isSectionDetailView ? 0.1 : 0.18) : 1,
          viewMode !== "2d"
        );
      });
    }
  };

  const applyOrthoViewConfig = (config: ReturnType<typeof computeElevationViewConfig> | ReturnType<typeof computeSectionViewConfig>) => {
    const activeCam = cam();
    if (!(activeCam instanceof THREE.OrthographicCamera) || !config) return;
    activeDetailClipPlanes = [config.clipPlane.clone()];
    syncDetailClippingAndMaterials();
    activeCam.position.copy(config.position).add(detailViewPanOffset);
    activeCam.up.copy(config.up);
    activeCam.left = config.left;
    activeCam.right = config.right;
    activeCam.top = config.top;
    activeCam.bottom = config.bottom;
    activeCam.near = config.near;
    activeCam.far = config.far;
    const nextTarget = config.target.clone().add(detailViewPanOffset);
    activeCam.lookAt(nextTarget);
    activeCam.updateProjectionMatrix();
    ctl().target.copy(nextTarget);
    ctl().update();
  };

  const updateDetailSliceOverlay = () => {
    for (const child of [...detailSliceGroup.children]) {
      detailSliceGroup.remove(child);
      disposeObject3D(child);
    }
    const isSectionView = viewMode === "2d" && activeViewerTab.startsWith("section:") && activeDetailClipPlanes.length > 0;
    detailSliceGroup.visible = isSectionView;
    if (!isSectionView) return;
    const plane = activeDetailClipPlanes[0]?.clone();
    if (!plane) return;
    const addSliceMesh = (targets: THREE.Object3D[], thicknessM: number, color: number) => {
      const sliceGeometry = buildPlaneSliceStripGeometry(targets, plane, thicknessM);
      if (!sliceGeometry.getAttribute("position")?.count) return;
      const mesh = new THREE.Mesh(
        sliceGeometry,
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
      );
      mesh.renderOrder = 75;
      mesh.frustumCulled = false;
      detailSliceGroup.add(mesh);
    };

    addSliceMesh(walls.map((wall) => wall.mesh), 0.09, 0x0b0f14);
    addSliceMesh(instances.map((inst) => inst.module), 0.055, 0x1c2430);
    addSliceMesh(kitchenWorktops.map((worktop) => worktop.mesh), 0.045, 0x202a37);
  };

  const viewerElevations: Array<{ key: `elevation:${SectionElevationKey}`; label: string; direction: SectionElevationKey }> = [
    { key: "elevation:north", label: "North", direction: "north" },
    { key: "elevation:east", label: "East", direction: "east" },
    { key: "elevation:south", label: "South", direction: "south" },
    { key: "elevation:west", label: "West", direction: "west" }
  ];

  const refreshViewerTabs = () => {
    const sectionTabs = sections.map((section) => ({
      key: `section:${section.id}`,
      label: section.params.name,
      onClick: () => activateViewerTab(`section:${section.id}`)
    }));
    const elevationTabs = viewerElevations.map((item) => ({
      key: item.key,
      label: item.label,
      onClick: () => activateViewerTab(item.key)
    }));
    setExtraTabs([...sectionTabs, ...elevationTabs]);
    syncViewerTabs(activeViewerTab);
  };

  const isCustomOrthoView = () => viewMode === "2d" && activeViewerTab !== "floorplan";
  const ensureFloorplanViewerTab = () => {
    if (activeViewerTab !== "floorplan" || viewMode !== "2d") {
      activateViewerTab("floorplan");
    } else {
      view2d.checked = true;
      setView2d(true);
    }
  };

  const activateViewerTab = (key: string) => {
    if (activeViewerTab === "floorplan" && key !== "floorplan" && viewMode === "2d") {
      viewNavigation.captureFloorplanView();
    }
    if (key === "3d") {
      activeViewerTab = "3d";
      detailViewPanOffset.set(0, 0, 0);
      activeDetailClipPlanes = [];
      view2d.checked = false;
      setView2d(false);
      syncViewerTabs(activeViewerTab);
      return;
    }

    activeViewerTab = key;
    view2d.checked = true;
    setView2d(true);
    if (key === "floorplan") {
      detailViewPanOffset.set(0, 0, 0);
      activeDetailClipPlanes = [];
      syncDetailClippingAndMaterials();
      viewNavigation.restoreFloorplanView();
      updateDetailSliceOverlay();
      syncViewerTabs(activeViewerTab);
      return;
    }

    const bounds = getNavigationSceneBounds();
    detailViewPanOffset.set(0, 0, 0);
    if (key.startsWith("section:")) {
      const sectionId = key.slice("section:".length);
      const section = sections.find((item) => item.id === sectionId) ?? null;
      if (section) applyOrthoViewConfig(computeSectionViewConfig(section.params, bounds));
    } else if (key.startsWith("elevation:")) {
      const direction = key.slice("elevation:".length) as SectionElevationKey;
      applyOrthoViewConfig(computeElevationViewConfig(direction, bounds));
    }
    updateDetailSliceOverlay();
    syncViewerTabs(activeViewerTab);
  };

  const updateDetailViewCamera = () => {
    if (!isCustomOrthoView()) return;
    const bounds = getNavigationSceneBounds();
    if (activeViewerTab.startsWith("section:")) {
      const sectionId = activeViewerTab.slice("section:".length);
      const section = sections.find((item) => item.id === sectionId) ?? null;
      if (section) applyOrthoViewConfig(computeSectionViewConfig(section.params, bounds));
      updateDetailSliceOverlay();
      return;
    }
    if (activeViewerTab.startsWith("elevation:")) {
      const direction = activeViewerTab.slice("elevation:".length) as SectionElevationKey;
      applyOrthoViewConfig(computeElevationViewConfig(direction, bounds));
    }
    updateDetailSliceOverlay();
  };

  const updateAllSectionVisuals = () => {
    for (const section of sections) updateSectionVisual(section);
    refreshViewerTabs();
  };
  refreshViewerTabs();

  function resolveKitchenWorktopDrawSnap(rawPoint: THREE.Vector3, rect: DOMRect) {
    const snapped = snapPoint2D(rawPoint, rect, cam(), 32, {
        kindPriority: ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"],
      sticky: worktopDrawSnap,
      preferNearest: true
    });
    const activeSnap =
      snapped.kind !== "none" ? snapped : keepStickyPlanSnap(rawPoint, worktopDrawSnap, cam(), rect, 32);
    worktopDrawSnap = activeSnap;
    return activeSnap;
  }

  function resolveSectionDrawSnap(rawPoint: THREE.Vector3, rect: DOMRect) {
    const snapped = snapPoint2D(rawPoint, rect, cam(), 24, {
        kindPriority: ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"],
      sticky: sectionDrawSnap,
      preferNearest: true
    });
    const activeSnap =
      snapped.kind !== "none" ? snapped : keepStickyPlanSnap(rawPoint, sectionDrawSnap, cam(), rect, 28);
    sectionDrawSnap = activeSnap;
    return activeSnap;
  }

  function resolveSectionDrawPoint(rawPoint: THREE.Vector3, rect: DOMRect, allowAxis = true) {
    const activeSnap = resolveSectionDrawSnap(rawPoint, rect);
    if (activeSnap && activeSnap.kind !== "none") {
      return { point: activeSnap.point.clone(), kind: activeSnap.kind as PlanSnapResult["kind"], axisLocked: false };
    }
    if (allowAxis && drawOrthoEnabled && sectionDraw.a) {
      const orthoPoint = floorOrthoPoint(sectionDraw.a, { x: Math.round(rawPoint.x * 1000), z: Math.round(rawPoint.z * 1000) });
      if (orthoPoint.x !== Math.round(rawPoint.x * 1000) || orthoPoint.z !== Math.round(rawPoint.z * 1000)) {
        return {
          point: new THREE.Vector3(orthoPoint.x / 1000, 0, orthoPoint.z / 1000),
          kind: "axis" as PlanSnapResult["kind"],
          axisLocked: true
        };
      }
    }
    return { point: rawPoint.clone(), kind: "none" as PlanSnapResult["kind"], axisLocked: false };
  }

  function beginKitchenWorktopSelection(worktopId: string, ev: PointerEvent) {
    const worktop = findKitchenWorktop(worktopId);
    if (!worktop) return false;
    if (marquee.pending && marquee.pointerId === ev.pointerId) {
      marquee.hitSomething = true;
      marquee.pending = false;
      marquee.active = false;
      marqueeEl.style.display = "none";
    }
    if (!S.kitchenEditMode && worktop.kitchenGroupId) {
      const group = kitchenMode?.findKitchenGroup(worktop.kitchenGroupId) ?? null;
      if (group) {
        setSelectedKitchenGroup(group.id);
        return true;
      }
    }
    if (worktop.kitchenGroupId) {
      setSelectedKitchenGroup(worktop.kitchenGroupId);
      return true;
    }
    return false;
  }

  function createInstance(nextParams: ModuleParams, opts?: { id?: string }) {
    const id = opts?.id ?? `m${instanceCounter++}`;
    // Keep counter ahead of restored ids ("m123" => 124)
    if (opts?.id) {
      const m = /^m(\d+)$/.exec(id);
      const n = m ? Number(m[1]) : NaN;
      if (Number.isFinite(n) && n >= instanceCounter) instanceCounter = n + 1;
    }
    const root = new THREE.Group();
    root.name = `module_${id}`;

    const module = buildModule(nextParams);
    module.name = `moduleGeom_${id}`;
    tagModuleGeometry(module, id);
    root.add(module);

    const localBox = moduleRootLocalBox(root, module);

    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), pickMat);
    pick.name = `pick_${id}`;
    pick.userData.kind = "module";
    pick.userData.instanceId = id;
    root.add(pick);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x525c70, transparent: true, opacity: 0.92, depthTest: true, depthWrite: false });
    const outline = new THREE.LineSegments(gEmpty(), lineMat);
    outline.name = `outline_${id}`;
    outline.visible = true;
    outline.userData.kind = "modulePlan";
    outline.userData.instanceId = id;
    outline.renderOrder = 58;
    root.add(outline);

    const inst: LayoutInstance = { id, params: nextParams, kitchenGroupId: null, kitchenPlacement: null, root, module, localBox, pick, outline };
    ensurePickAndOutline(inst);
    return inst;
  }

  function gEmpty() {
    return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
  }

  function updateLayoutPanel() {
    layoutPanel.setRows(
      instances.map((i) => ({
        id: i.id,
        type: i.params.type,
        xMm: i.root.position.x * 1000,
        zMm: i.root.position.z * 1000
      }))
    );
    layoutPanel.setSelected(selectedInstanceId);
  }

  function setInstanceSelected(id: string | null) {
    selectedInstanceId = id;
    layoutPanel.setSelected(id);

    if (selectedInstanceBox) {
      scene.remove(selectedInstanceBox);
      selectedInstanceBox.geometry.dispose();
      (selectedInstanceBox.material as THREE.Material).dispose();
      selectedInstanceBox = null;
    }

    if (!id) return;
  }

  function setSelectedKitchenGroup(groupId: string | null) {
    if (layoutTool !== "wall") layoutTool = "select";
    selectedKind = groupId ? "kitchenGroup" : null;
    selectedSectionId = null;
    selectedKitchenGroupId = groupId;
    selectedFloorId = null;
    selectedWallId = null;
    selectedWallIds.clear();
    selectedInstanceIds.clear();
    if (groupId) {
      for (const inst of instances) {
        if (inst.kitchenGroupId !== groupId) continue;
        selectedInstanceIds.add(inst.id);
      }
    }
    setInstanceSelected(null);
    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    showWallSnapMarkersFor(null);
    syncSelectionState();
    updateSelectionHighlights();
    updateAllSectionVisuals();
    mountProps();
  }

  function setSelectedModule(id: string | null) {
    if (kitchenMode) id = kitchenMode.filterSelectableInstanceId(id);
    if (layoutTool !== "wall") layoutTool = "select";
    if (id && pinnedInstanceIds.has(id)) id = null;
    selectedKind = id ? "module" : null;
    selectedSectionId = null;
    selectedKitchenGroupId = null;
    selectedFloorId = null;
    selectedInstanceId = id;
    selectedInstanceIds.clear();
    if (id) selectedInstanceIds.add(id);
    selectedWallId = null;
    selectedWallIds.clear();
    setInstanceSelected(id);
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    syncSelectionState();
    updateSelectionHighlights();
    updateAllSectionVisuals();
    mountProps();
  }

  function setSelectedWindow() {
    if (layoutTool !== "wall") layoutTool = "select";
    selectedKind = "window";
    selectedSectionId = null;
    selectedKitchenGroupId = null;
    selectedFloorId = null;
    selectedWallId = null;
    setInstanceSelected(null);
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    syncSelectionState();
    updateAllSectionVisuals();
    mountProps();
  }

  function setSelectedUnderlay() {
    if (layoutTool !== "wall") layoutTool = "select";
    if (!underlayMesh.visible || underlayState.pinned) return;
    selectedKind = "underlay";
    selectedSectionId = null;
    selectedKitchenGroupId = null;
    selectedFloorId = null;
    selectedWallId = null;
    selectedWallIds.clear();
    selectedInstanceId = null;
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    selectedUnderlayBox = new THREE.BoxHelper(underlayMesh, 0x5c8cff);
    selectedUnderlayBox.name = "underlaySelectionBox";
    scene.add(selectedUnderlayBox);
    syncSelectionState();
    updateAllSectionVisuals();
    mountProps();
  }

  function setSelectedSection(id: string | null) {
    if (layoutTool !== "wall") layoutTool = "select";
    selectedKind = id ? "section" : null;
    selectedSectionId = id;
    selectedKitchenGroupId = null;
    selectedFloorId = null;
    selectedWallId = null;
    selectedWallIds.clear();
    selectedInstanceId = null;
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    showWallSnapMarkersFor(null);
    syncSelectionState();
    updateSelectionHighlights();
    updateAllSectionVisuals();
    mountProps();
  }

  function setSelectedWall(id: string | null) {
    if (layoutTool !== "wall") layoutTool = "select";
    if (id && pinnedWallIds.has(id)) id = null;
    selectedKind = id ? "wall" : null;
    selectedSectionId = null;
    selectedKitchenGroupId = null;
    selectedFloorId = null;
    selectedWallId = id;
    selectedWallIds.clear();
    if (id) selectedWallIds.add(id);
    setInstanceSelected(null);
    selectedInstanceIds.clear();
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }

    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }

    const w = id ? walls.find((x) => x.id === id) ?? null : null;
    if (!w) {
      showWallSnapMarkersFor(null);
      syncSelectionState();
      updateSelectionHighlights();
      updateAllSectionVisuals();
      mountProps();
      return;
    }

    selectedWallBox = new THREE.BoxHelper(w.root, 0x3ddc97);
    selectedWallBox.name = "wallSelectionBox";
    scene.add(selectedWallBox);
    showWallSnapMarkersFor(id);
    syncSelectionState();
    updateSelectionHighlights();
    updateAllSectionVisuals();
    mountProps();
  }

  function setSelectedFloor(id: string | null) {
    if (layoutTool !== "wall") layoutTool = "select";
    selectedKind = id ? "floor" : null;
    selectedSectionId = null;
    selectedKitchenGroupId = null;
    selectedFloorId = id;
    selectedWallId = null;
    selectedWallIds.clear();
    selectedInstanceId = null;
    selectedInstanceIds.clear();
    setInstanceSelected(null);
    if (selectedWallBox) {
      scene.remove(selectedWallBox);
      selectedWallBox.geometry.dispose();
      (selectedWallBox.material as THREE.Material).dispose();
      selectedWallBox = null;
    }
    if (selectedUnderlayBox) {
      scene.remove(selectedUnderlayBox);
      selectedUnderlayBox.geometry.dispose();
      (selectedUnderlayBox.material as THREE.Material).dispose();
      selectedUnderlayBox = null;
    }
    showWallSnapMarkersFor(null);
    syncSelectionState();
    updateSelectionHighlights();
    updateAllSectionVisuals();
    mountProps();
  }

  function deleteWall(id: string) {
    const idx = walls.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const w = walls[idx];
    removeWall(w);

    if (selectedWallId === id) {
      setSelectedWall(null);
    }

    // keep properties in sync
    mountProps();
    commitHistory(S);
  }

  function createWindow(defaultWall: WallId = "back") {
    const params: WindowParams = {
      wall: defaultWall,
      widthMm: 900,
      heightMm: 900,
      sillHeightMm: 900,
      centerMm: 0
    };

    const root = new THREE.Group();
    root.name = "windowRoot";

    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    pick.name = "windowPick";
    pick.userData.kind = "window";
    root.add(pick);

    const outline = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false })
    );
    outline.name = "windowOutline";
    outline.renderOrder = 57;
    root.add(outline);

    const inst: WindowInstance = { params, root, pick, outline };
    updateWindowTransform(inst);
    return inst;
  }

  function clampWindowParams(p: WindowParams) {
    const widthMm = Math.max(200, Math.min(4800, Math.round(p.widthMm)));
    const heightMm = Math.max(200, Math.min(2600, Math.round(p.heightMm)));
    const maxSill = Math.max(0, Math.round(roomBounds.h * 1000 - heightMm));
    const sillHeightMm = Math.max(0, Math.min(Math.round(p.sillHeightMm), maxSill));

    const axisHalfMm = wallDefs[p.wall].axisHalf * 1000;
    const maxCenter = Math.max(0, axisHalfMm - widthMm / 2);
    const centerMm = Math.max(-maxCenter, Math.min(Math.round(p.centerMm), maxCenter));

    return { ...p, widthMm, heightMm, sillHeightMm, centerMm };
  }

  function updateWindowTransform(inst: WindowInstance) {
    inst.params = clampWindowParams(inst.params);
    const def = wallDefs[inst.params.wall];

    const widthM = inst.params.widthMm / 1000;
    const heightM = inst.params.heightMm / 1000;
    const centerAxisM = inst.params.centerMm / 1000;

    const y = inst.params.sillHeightMm / 1000 + heightM / 2;
    const pos = def.fixedPos.clone();
    pos.y = y;
    if (def.axis === "x") pos.x = centerAxisM;
    else pos.z = centerAxisM;

    inst.root.position.copy(pos);

    if (inst.params.wall === "back") inst.root.rotation.set(0, 0, 0);
    if (inst.params.wall === "left") inst.root.rotation.set(0, Math.PI / 2, 0);
    if (inst.params.wall === "right") inst.root.rotation.set(0, -Math.PI / 2, 0);

    inst.pick.geometry.dispose();
    inst.pick.geometry = new THREE.BoxGeometry(Math.max(0.05, widthM), Math.max(0.05, heightM), 0.03);
    inst.pick.position.set(0, 0, 0);

    const pts = [
      new THREE.Vector3(-widthM / 2, -heightM / 2, 0.006),
      new THREE.Vector3(widthM / 2, -heightM / 2, 0.006),
      new THREE.Vector3(widthM / 2, heightM / 2, 0.006),
      new THREE.Vector3(-widthM / 2, heightM / 2, 0.006),
      new THREE.Vector3(-widthM / 2, -heightM / 2, 0.006)
    ];
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    inst.outline.geometry.dispose();
    inst.outline.geometry = g;

    const centerWorld = inst.root.getWorldPosition(new THREE.Vector3());
    setWindowOpening({
      center: centerWorld,
      inwardNormal: def.inwardNormal,
      width: widthM,
      height: heightM
    });

    setWindowCutout({
      wall: inst.params.wall,
      centerAxisM: centerAxisM,
      sillM: inst.params.sillHeightMm / 1000,
      widthM,
      heightM
    });
  }

  function addOrSelectWindow() {
    if (mode !== "layout") return;
    if (!windowInst) {
      windowInst = createWindow("back");
      scene.add(windowInst.root);
    }
    setSelectedWindow();
  }

  function mountWindowControls() {
    windowEditorHost.innerHTML = "";
    if (!windowInst) return;

    const title = document.createElement("div");
    title.textContent = "Window";
    title.style.margin = "8px 0";
    title.style.fontWeight = "600";
    windowEditorHost.appendChild(title);

    const row = (label: string, el: HTMLElement) => {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gridTemplateColumns = "140px 1fr";
      wrap.style.gap = "8px";
      wrap.style.alignItems = "center";
      const l = document.createElement("div");
      l.textContent = label;
      wrap.appendChild(l);
      wrap.appendChild(el);
      windowEditorHost.appendChild(wrap);
    };

    const wallSel = document.createElement("select");
    wallSel.innerHTML = `<option value="back">back</option><option value="left">left</option><option value="right">right</option>`;
    wallSel.value = windowInst.params.wall;
    wallSel.addEventListener("change", () => {
      if (!windowInst) return;
      windowInst.params.wall = wallSel.value as WallId;
      updateWindowTransform(windowInst);
      mountWindowControls();
    });
    row("Wall", wallSel);

    const mkNum = (v: number) => {
      const i = document.createElement("input");
      i.type = "number";
      i.value = String(v);
      i.step = "1";
      return i;
    };

    const width = mkNum(windowInst.params.widthMm);
    width.addEventListener("input", () => {
      if (!windowInst) return;
      windowInst.params.widthMm = Number(width.value);
      updateWindowTransform(windowInst);
    });
    row("Width (mm)", width);

    const height = mkNum(windowInst.params.heightMm);
    height.addEventListener("input", () => {
      if (!windowInst) return;
      windowInst.params.heightMm = Number(height.value);
      updateWindowTransform(windowInst);
    });
    row("Height (mm)", height);

    const sill = mkNum(windowInst.params.sillHeightMm);
    sill.addEventListener("input", () => {
      if (!windowInst) return;
      windowInst.params.sillHeightMm = Number(sill.value);
      updateWindowTransform(windowInst);
    });
    row("Sill (mm)", sill);

    const center = mkNum(windowInst.params.centerMm);
    center.addEventListener("input", () => {
      if (!windowInst) return;
      windowInst.params.centerMm = Number(center.value);
      updateWindowTransform(windowInst);
    });
    row(windowInst.params.wall === "back" ? "Center X (mm)" : "Center Z (mm)", center);
  }

  function clearWindowLightIfMissing() {
    if (!windowInst) setWindowOpening(null);
    if (!windowInst) setWindowCutout(null);
  }

  function mountInstanceControls(inst: LayoutInstance) {
    instanceEditorHost.innerHTML = "";

    const worktopArgs = { getWorktopThicknessMm: () => 0 };

    getModuleDescriptorOrThrow(inst.params.type).createControls(instanceEditorHost, inst.params, {
      ...worktopArgs,
      onChange: (previousParams?: Record<string, unknown>, sourceKey?: string) =>
        rebuildInstance(inst, {
          preserveBackAnchor: true,
          previousParams: previousParams as ModuleParams | undefined,
          sourceKey
        })
    });
  }

  function rebuildInstance(
    inst: LayoutInstance,
    opts?: { skipLayoutValidation?: boolean; preserveBackAnchor?: boolean; previousParams?: ModuleParams; sourceKey?: string }
  ) {
    lastRebuildDebug = null;
    const normalizedParams = normalizeModuleParamsForSource(structuredClone(inst.params), opts?.sourceKey);
    const errors = validateModule(normalizedParams);
    renderErrors(args.errorsEl, errors);
    if (errors.length > 0) {
      lastRebuildDebug = { ok: false, stage: "validate", errors: structuredClone(errors) };
      return false;
    }

    const previousParams = structuredClone(opts?.previousParams ?? inst.params);
    inst.params = previousParams;
    const prevWorldBox = instanceWorldBox(inst);
    const prevAdjacencyInfos = collectAdjacentModuleInfos(inst, prevWorldBox);
    const resizeAnchorSide = chooseResizeAnchorSide(inst, prevAdjacencyInfos) ?? inferTallResizeAnchorSide(inst);
    const prevPos = inst.root.position.clone();
    const prevKitchenPlacement = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;
    const prevLocalAnchor = getModuleLocalKitchenAnchor(inst).clone();
    const prevWorldAnchor = prevLocalAnchor.clone().applyMatrix4(inst.root.matrixWorld);
    const prevModule = inst.module;
    const prevBox = inst.localBox.clone();
    const prevNeighborPositions = new Map<string, THREE.Vector3>();
    const prevWorldBoxesById = new Map<string, THREE.Box3>();
    for (const other of instances) {
      if (other.id === inst.id) continue;
      prevNeighborPositions.set(other.id, other.root.position.clone());
      prevWorldBoxesById.set(other.id, instanceWorldBox(other).clone());
    }
    prevWorldBoxesById.set(inst.id, prevWorldBox.clone());

    inst.params = normalizedParams;

    const next = buildModule(inst.params);
    next.name = `moduleGeom_${inst.id}`;
    tagModuleGeometry(next, inst.id);

    inst.root.remove(prevModule);
    inst.module = next;
    inst.root.add(inst.module);
    inst.localBox = moduleRootLocalBox(inst.root, inst.module);
    if (opts?.preserveBackAnchor) {
      const nextLocalAnchor = getModuleLocalKitchenAnchor(inst);
      const delta = prevLocalAnchor.clone().sub(nextLocalAnchor);
      inst.module.position.add(delta);
      inst.localBox = moduleRootLocalBox(inst.root, inst.module);
    }
    ensurePickAndOutline(inst);
    const keepRootPositionStable = footprintExtentsMatchXZ(prevWorldBox, instanceWorldBox(inst));
    if (!opts?.skipLayoutValidation && !keepRootPositionStable) preserveAnchoredResizeSide(inst, prevWorldBox, resizeAnchorSide);
    if (opts?.preserveBackAnchor) {
      preserveWorldKitchenAnchor(inst, prevWorldAnchor);
    } else if (keepRootPositionStable) {
      inst.root.position.copy(prevPos);
      inst.root.updateMatrixWorld(true);
    }

    if (!opts?.skipLayoutValidation && !opts?.preserveBackAnchor) {
      const clamped = applyWallConstraints(inst, inst.root.position.clone());
      inst.root.position.copy(clamped);
    }
    const propagated = opts?.skipLayoutValidation
      ? { ok: true, movedIds: [] as string[] }
      : isCornerKitchenModule(inst)
        ? propagateCornerResizeToPinnedNeighbors(inst, previousParams)
        : propagateModuleResizeToPinnedNeighbors(inst, prevWorldBox, prevWorldBoxesById);

    const inRoom = opts?.skipLayoutValidation ? true : instanceFitsLayoutBounds(inst);
    const overlapsModules = opts?.skipLayoutValidation ? false : anyOverlap(inst, null);
    const overlapsWalls = opts?.skipLayoutValidation ? false : moduleOverlapsWalls(inst);
    const overlapsWorktops = opts?.skipLayoutValidation ? false : moduleOverlapsKitchenWorktops(inst);
    const overlaps = overlapsModules || overlapsWalls || overlapsWorktops;
    const movedNeighborInvalid =
      !opts?.skipLayoutValidation &&
      propagated.movedIds.some((id) => {
        const other = findInstance(id);
        return !!other &&
          (!instanceFitsLayoutBounds(other) ||
            anyOverlap(other, null) ||
            moduleOverlapsWalls(other) ||
            moduleOverlapsKitchenWorktops(other));
      });
    lastRebuildDebug = {
      ok: inRoom && !overlaps && !movedNeighborInvalid,
      stage: inRoom && !overlaps && !movedNeighborInvalid ? "success" : "layoutValidation",
      keepRootPositionStable,
      resizeAnchorSide,
      prevWorldBox: {
        min: { x: prevWorldBox.min.x, y: prevWorldBox.min.y, z: prevWorldBox.min.z },
        max: { x: prevWorldBox.max.x, y: prevWorldBox.max.y, z: prevWorldBox.max.z }
      },
      nextWorldBox: (() => {
        const nextWorldBox = instanceWorldBox(inst);
        return {
          min: { x: nextWorldBox.min.x, y: nextWorldBox.min.y, z: nextWorldBox.min.z },
          max: { x: nextWorldBox.max.x, y: nextWorldBox.max.y, z: nextWorldBox.max.z }
        };
      })(),
      inRoom,
      overlapsModules,
      overlapsWalls,
      overlapsWorktops,
      movedNeighborInvalid,
      propagatedMovedIds: [...propagated.movedIds]
    };
    if (!inRoom || overlaps || movedNeighborInvalid) {
      // Revert (layout must never allow overlaps)
      inst.params = previousParams;
      inst.root.remove(inst.module);
      disposeObject3D(inst.module);
      inst.module = prevModule;
      tagModuleGeometry(inst.module, inst.id);
      inst.localBox = prevBox;
      inst.root.position.copy(prevPos);
      inst.kitchenPlacement = prevKitchenPlacement ? structuredClone(prevKitchenPlacement) : null;
      inst.root.add(inst.module);
      for (const other of instances) {
        if (other.id === inst.id) continue;
        const prev = prevNeighborPositions.get(other.id);
        if (prev) other.root.position.copy(prev);
      }
      ensurePickAndOutline(inst);
      renderErrors(args.errorsEl, [
        !inRoom
          ? "Module doesn't fit inside the room bounds in layout mode."
          : overlaps || movedNeighborInvalid
            ? "Module overlaps wall/another module in layout mode."
            : "Module invalid in layout mode."
      ]);
      return false;
    }

    disposeObject3D(prevModule);
    if (inst.kitchenGroupId) {
      const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
      inst.kitchenPlacement = inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
    }
    for (const neighborId of propagated.movedIds) {
      const neighbor = findInstance(neighborId);
      if (!neighbor?.kitchenGroupId) continue;
      const group = S.kitchenGroups.find((item) => item.id === neighbor.kitchenGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
      neighbor.kitchenPlacement = inferKitchenPlacementBinding(neighbor, neighbor.kitchenGroupId, backOffsetMm);
    }
    updateLayoutPanel();
    return true;
  }

  function beginModuleSelection(selectableId: string, ev: PointerEvent) {
    const inst = findInstance(selectableId);
    if (!inst) return false;
    if (marquee.pending && marquee.pointerId === ev.pointerId) {
      marquee.hitSomething = true;
      marquee.pending = false;
      marquee.active = false;
      marqueeEl.style.display = "none";
    }
    if (!S.kitchenEditMode && inst.kitchenGroupId) {
      const group = kitchenMode?.findKitchenGroup(inst.kitchenGroupId) ?? null;
      if (group) {
        setSelectedKitchenGroup(group.id);
        return true;
      }
    }
    setSelectedModule(selectableId);

    if (viewMode !== "2d") return true;
    if (pinnedInstanceIds.has(selectableId)) return true;

    const hitPoint = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return true;
    dragState.active = true;
    dragState.id = selectableId;
    dragState.offset.set(hitPoint.x - inst.root.position.x, 0, hitPoint.z - inst.root.position.z);
    dragState.lastValid.copy(inst.root.position);
    renderer.domElement.setPointerCapture(ev.pointerId);
    return true;
  }

  function findSelectableFloorplanModuleAtPoint(
    pointMm: { x: number; z: number },
    mousePx: { x: number; y: number },
    rect: DOMRect
  ) {
    const pointWorld = { x: pointMm.x / 1000, z: pointMm.z / 1000 };
    let best: { id: string; score: number } | null = null;

    for (const inst of instances) {
      const selectableId = kitchenMode ? kitchenMode.filterSelectableInstanceId(inst.id) : inst.id;
      if (!selectableId) continue;
      const poly = getModulePlanPolygon(inst, getModuleLocalBackCenter).map((p) => ({ x: p.x, z: p.z }));
      if (poly.length < 3) continue;
      if (!pointInPolygonXZ(pointWorld, poly)) continue;
      const center = worldToScreen(inst.root.position.clone(), cam(), rect);
      const score = Math.hypot(center.x - mousePx.x, center.y - mousePx.y);
      if (!best || score < best.score) best = { id: selectableId, score };
    }

    return best?.id ?? null;
  }

  function selectInstanceById(id: string) {
    if (mode !== "layout") return;
    const inst = findInstance(id);
    if (!inst) return;
    if (!S.kitchenEditMode && inst.kitchenGroupId) {
      setSelectedKitchenGroup(inst.kitchenGroupId);
      return;
    }
    setSelectedModule(id);
  }

  function duplicateInstance(id: string) {
    if (mode !== "layout") return;
    const inst = findInstance(id);
    if (!inst) return;
    const clonedParams = structuredClone(inst.params) as ModuleParams;
    const next = createInstance(clonedParams);
    next.kitchenGroupId = S.kitchenEditMode ? S.activeKitchenGroupId : null;
    next.root.position.copy(inst.root.position).add(new THREE.Vector3(0.2, 0, 0.2));
    layoutRoot.add(next.root);
    instances.push(next);
    placeWithoutOverlap(next);
    if (next.kitchenGroupId) {
      const group = S.kitchenGroups.find((item) => item.id === next.kitchenGroupId) ?? null;
      next.kitchenPlacement = inferKitchenPlacementBinding(
        next,
        next.kitchenGroupId,
        group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm
      );
    }
    setSelectedModule(next.id);
    updateLayoutPanel();
  }

  function deleteInstance(id: string) {
    if (mode !== "layout") return;
    const idx = instances.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const inst = instances[idx];
    if (selectedInstanceId === id) setSelectedModule(null);
    layoutRoot.remove(inst.root);
    disposeObject3D(inst.root);
    instances.splice(idx, 1);
    updateLayoutPanel();
  }

  function placeWithoutOverlap(inst: LayoutInstance) {
    const step = 0.25;
    const maxR = 40;
    const origin = applyWallConstraints(inst, inst.root.position.clone());
    for (let r = 0; r < maxR; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const desired = new THREE.Vector3(origin.x + dx * step, origin.y, origin.z + dz * step);
          const clamped = applyWallConstraints(inst, desired);
          inst.root.position.copy(clamped);
          if (!instanceFitsRoom(inst)) continue;
          if (!anyOverlap(inst, null) && !moduleOverlapsWalls(inst) && !moduleOverlapsKitchenWorktops(inst)) return;
        }
      }
    }
  }

  function aabbOverlapXZ(a: THREE.Box3, b: THREE.Box3, eps = 0.0005) {
    const ax0 = a.min.x;
    const ax1 = a.max.x;
    const az0 = a.min.z;
    const az1 = a.max.z;
    const bx0 = b.min.x;
    const bx1 = b.max.x;
    const bz0 = b.min.z;
    const bz1 = b.max.z;
    return ax0 < bx1 - eps && ax1 > bx0 + eps && az0 < bz1 - eps && az1 > bz0 + eps;
  }

  function aabbOverlapY(a: THREE.Box3, b: THREE.Box3, eps = 0.0005) {
    return a.min.y < b.max.y - eps && a.max.y > b.min.y + eps;
  }

  function anyOverlap(moving: LayoutInstance, ignoreId: string | null) {
    const a = instanceLayoutWorldBox(moving);
    const movingRing = moduleWorldRing(moving);
    const movingMp = movingRing.length >= 4 ? [[movingRing]] : null;
    for (const other of instances) {
      if (other.id === moving.id) continue;
      if (ignoreId && other.id === ignoreId) continue;
      const b = instanceLayoutWorldBox(other);
      if (!aabbOverlapXZ(a, b)) continue;
      if (!aabbOverlapY(a, b)) continue;
      const otherRing = moduleWorldRing(other);
      if (!movingMp || otherRing.length < 4) return true;
      try {
        const inter = (polygonClipping as any).intersection(movingMp, [[otherRing]]);
        if (multiPolyArea(inter) > 1e-6) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  function anyOverlapIgnoring(moving: LayoutInstance, ignoreIds: Set<string>) {
    const a = instanceLayoutWorldBox(moving);
    const movingRing = moduleWorldRing(moving);
    const movingMp = movingRing.length >= 4 ? [[movingRing]] : null;
    for (const other of instances) {
      if (other.id === moving.id) continue;
      if (ignoreIds.has(other.id)) continue;
      const b = instanceLayoutWorldBox(other);
      if (!aabbOverlapXZ(a, b)) continue;
      if (!aabbOverlapY(a, b)) continue;
      const otherRing = moduleWorldRing(other);
      if (!movingMp || otherRing.length < 4) return true;
      try {
        const inter = (polygonClipping as any).intersection(movingMp, [[otherRing]]);
        if (multiPolyArea(inter) > 1e-6) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  function polyArea(ring: Array<[number, number]>) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      a += x0 * y1 - x1 * y0;
    }
    return a / 2;
  }

  function multiPolyArea(mp: any) {
    if (!mp || !Array.isArray(mp)) return 0;
    let sum = 0;
    for (const poly of mp as any[]) {
      if (!poly || poly.length === 0) continue;
      const rings = poly as any[];
      const outer = rings[0] as Array<[number, number]>;
      if (!outer || outer.length < 4) continue;
      let a = Math.abs(polyArea(outer));
      for (let i = 1; i < rings.length; i++) {
        const hole = rings[i] as Array<[number, number]>;
        if (!hole || hole.length < 4) continue;
        a -= Math.abs(polyArea(hole));
      }
      sum += Math.max(0, a);
    }
    return sum;
  }

  function moduleWorldRing(inst: LayoutInstance) {
    const polygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
    const ring: Array<[number, number]> = polygon.map((point) => [point.x, point.z]);
    if (ring.length > 0) ring.push(ring[0]);
    return ring;
  }

  function worktopWorldRing(worktop: KitchenWorktopInstance) {
    const polygon = getKitchenWorktopPolygon(worktop.params);
    const ring: Array<[number, number]> = polygon.map((point) => [point.x, point.z]);
    if (ring.length > 0) ring.push(ring[0]);
    return ring;
  }

  function moduleOverlapsKitchenWorktops(inst: LayoutInstance) {
    if (!moduleStaysOutsideKitchenWorktop(inst)) return false;
    if (!inst.kitchenGroupId) return false;
    const relatedWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === inst.kitchenGroupId);
    if (relatedWorktops.length === 0) return false;

    const moduleMp = [[moduleWorldRing(inst)]];
    for (const worktop of relatedWorktops) {
      const ring = worktopWorldRing(worktop);
      if (ring.length < 4) continue;
      try {
        const inter = (polygonClipping as any).intersection([[ring]], moduleMp);
        if (multiPolyArea(inter) > 1e-6) return true;
      } catch {
        // ignore broken clipping input and keep fallback-free behavior
      }
    }
    return false;
  }

  function moduleOverlapsWalls(inst: LayoutInstance) {
    if (walls.length === 0) return false;
    const ring = moduleWorldRing(inst);
    const moduleMp = [[ring]];

    const wallMp = wallUnionPolys;
    if (wallMp) {
      try {
        const inter = (polygonClipping as any).intersection(wallMp, moduleMp);
        const area = multiPolyArea(inter);
        return area > 1e-6; // ~1mm^2 in m^2
      } catch {
        // fall through
      }
    }

    // Fallback: test against individual outlines + join polys (less robust but still blocks wall embedding).
    const toRing = (poly: Array<{ x: number; z: number }>) => {
      const r: Array<[number, number]> = poly.map((p) => [p.x, p.z]);
      if (r.length > 0) r.push(r[0]);
      return r;
    };
    const polys: any[] = [];
    for (const poly of wallSolvedOutlines.values()) if (poly.length >= 3) polys.push([[toRing(poly)]]);
    for (const poly of wallSolvedJoinPolys) if (poly.length >= 3) polys.push([[toRing(poly)]]);
    for (const wmp of polys) {
      try {
        const inter = (polygonClipping as any).intersection(wmp, moduleMp);
        const area = multiPolyArea(inter);
        if (area > 1e-6) return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function snapPositionDetailed(
    moving: LayoutInstance,
    desired: THREE.Vector3,
    opts?: {
      stickyNeighborId?: string | null;
      ignoreIds?: Set<string>;
      snapDistanceM?: number;
      enforceWallConstraints?: boolean;
      enforceWallOverlap?: boolean;
    }
  ) {
    if (isCornerKitchenModule(moving)) {
      return { position: desired.clone(), link: null };
    }
    const currentPos = moving.root.position.clone();
    moving.root.position.copy(desired);
    const a = instanceWorldBox(moving);
    moving.root.position.copy(currentPos);
    const others = instances
      .filter((other) => other.id !== moving.id && !(opts?.ignoreIds?.has(other.id)))
      .filter((other) => !moving.kitchenGroupId || other.kitchenGroupId === moving.kitchenGroupId)
      .map((other) => ({ id: other.id, box: instanceWorldBox(other) }));
    const adjacencyCandidates = buildModuleSnapCandidates({
      movingId: moving.id,
      movingBox: a,
      desired,
      others,
      stickyNeighborId: opts?.stickyNeighborId ?? null,
      snapDistanceM: opts?.snapDistanceM
    });

    const candidates: Array<{ pos: THREE.Vector3; score: number; link: ModuleAdjacencyLink | null }> = [];
    candidates.push({ pos: desired.clone(), score: 0, link: null });
    for (const candidate of adjacencyCandidates) candidates.push(candidate);

    let best = desired.clone();
    let bestScore = Infinity;
    let bestLink: ModuleAdjacencyLink | null = null;
    const enforceWallConstraints = opts?.enforceWallConstraints ?? true;
    const enforceWallOverlap = opts?.enforceWallOverlap ?? true;
    for (const c of candidates) {
      const clamped = enforceWallConstraints ? applyWallConstraints(moving, c.pos) : c.pos.clone();
      const prev = moving.root.position.clone();
      moving.root.position.copy(clamped);
      const overlaps =
        (opts?.ignoreIds ? anyOverlapIgnoring(moving, opts.ignoreIds) : anyOverlap(moving, null)) ||
        (enforceWallOverlap ? moduleOverlapsWalls(moving) : false);
      moving.root.position.copy(prev);
      if (overlaps) continue;
      if (c.score < bestScore) {
        bestScore = c.score;
        best = clamped;
        bestLink = c.link ?? null;
      }
    }

    return { position: best, link: bestLink };
  }

  function collectPinnedPushChain(startId: string, side: "left" | "right" | "front" | "back") {
    const queue = [startId];
    const visited = new Set<string>([startId]);
    const result: string[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = findInstance(currentId);
      if (!current) continue;
      const currentBox = instanceWorldBox(current);

      for (const other of instances) {
        if (other.id === currentId || visited.has(other.id)) continue;
        if (current.kitchenGroupId && other.kitchenGroupId !== current.kitchenGroupId) continue;
        const info = detectModuleAdjacencyInfo(currentBox, instanceWorldBox(other), other.id);
        if (!info || info.side !== side) continue;
        visited.add(other.id);
        result.push(other.id);
        queue.push(other.id);
      }
    }

    return result;
  }

  function collectPinnedPushChainFromBoxes(
    startId: string,
    side: "left" | "right" | "front" | "back",
    boxesById: Map<string, THREE.Box3>,
    kitchenGroupId: string | null
  ) {
    const queue = [startId];
    const visited = new Set<string>([startId]);
    const result: string[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentBox = boxesById.get(currentId);
      if (!currentBox) continue;

      for (const other of instances) {
        if (other.id === currentId || visited.has(other.id)) continue;
        if (kitchenGroupId && other.kitchenGroupId !== kitchenGroupId) continue;
        const otherBox = boxesById.get(other.id);
        if (!otherBox) continue;
        const info = detectModuleAdjacencyInfo(currentBox, otherBox, other.id);
        if (!info || info.side !== side) continue;
        visited.add(other.id);
        result.push(other.id);
        queue.push(other.id);
      }
    }

    return result;
  }

  function collectAdjacentModuleInfos(inst: LayoutInstance, referenceBox = instanceWorldBox(inst)) {
    const infos: Array<ReturnType<typeof detectModuleAdjacencyInfo> & { other: LayoutInstance }> = [];
    for (const other of instances) {
      if (other.id === inst.id) continue;
      if (inst.kitchenGroupId && other.kitchenGroupId !== inst.kitchenGroupId) continue;
      const info = detectModuleAdjacencyInfo(referenceBox, instanceWorldBox(other), other.id);
      if (!info) continue;
      infos.push({ ...info, other });
    }
    return infos;
  }

  function chooseResizeAnchorSide(_inst: LayoutInstance, infos: Array<ReturnType<typeof detectModuleAdjacencyInfo> & { other: LayoutInstance }>) {
    if (infos.length === 0) return null;

    const bySide = new Map<"left" | "right" | "front" | "back", Array<(typeof infos)[number]>>();
    for (const info of infos) {
      const list = bySide.get(info.side) ?? [];
      list.push(info);
      bySide.set(info.side, list);
    }

    const choosePreferredCornerSide = (
      primary: "left" | "right" | "front" | "back",
      secondary: "left" | "right" | "front" | "back"
    ) => {
      const primaryInfos = bySide.get(primary) ?? [];
      const secondaryInfos = bySide.get(secondary) ?? [];
      if (primaryInfos.length === 0 && secondaryInfos.length === 0) return null;
      const primaryHasCorner = primaryInfos.some((item) => item.other.params.type === "corner_shelf_lower");
      const secondaryHasCorner = secondaryInfos.some((item) => item.other.params.type === "corner_shelf_lower");
      if (primaryHasCorner && secondaryInfos.length === 0) return primary;
      if (secondaryHasCorner && primaryInfos.length === 0) return secondary;
      if (primaryHasCorner !== secondaryHasCorner) return primaryHasCorner ? primary : secondary;
      if (primaryInfos.length > 0 && secondaryInfos.length === 0) return primary;
      if (secondaryInfos.length > 0 && primaryInfos.length === 0) return secondary;
      return null;
    };

    return choosePreferredCornerSide("left", "right") ?? choosePreferredCornerSide("back", "front");
  }

  function worldDirectionToBoxSide(dir: THREE.Vector3) {
    if (Math.abs(dir.x) >= Math.abs(dir.z)) return dir.x >= 0 ? "right" : "left";
    return dir.z >= 0 ? "front" : "back";
  }

  function inferTallResizeAnchorSide(inst: LayoutInstance) {
    if (!inst.kitchenGroupId || !moduleStaysOutsideKitchenWorktop(inst)) return null;
    const relatedWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === inst.kitchenGroupId);
    if (relatedWorktops.length === 0) return null;

    const widthMm = Number((inst.params as Record<string, unknown>).width);
    const halfModuleWidthM =
      Number.isFinite(widthMm) && widthMm > 0 ? widthMm / 2000 : Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
    const backCenterWorld = getModuleLocalBackCenter(inst).clone().applyMatrix4(inst.root.matrixWorld);
    const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
    const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;

    let best:
      | {
          distanceSq: number;
          anchorSide: "left" | "right" | "front" | "back";
        }
      | null = null;

    for (const worktop of relatedWorktops) {
      const firstInfo = getKitchenGuideSegmentInfo(worktop, 0, backOffsetMm);
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      const lastInfo = guidePath.length >= 2 ? getKitchenGuideSegmentInfo(worktop, guidePath.length - 2, backOffsetMm) : null;
      const candidates = [
        firstInfo
          ? {
              point: firstInfo.start.clone().addScaledVector(firstInfo.dir, -halfModuleWidthM),
              anchorSide: worldDirectionToBoxSide(firstInfo.dir)
            }
          : null,
        lastInfo
          ? {
              point: lastInfo.start.clone().addScaledVector(lastInfo.dir, lastInfo.length + halfModuleWidthM),
              anchorSide: worldDirectionToBoxSide(lastInfo.dir.clone().multiplyScalar(-1))
            }
          : null
      ].filter((candidate): candidate is { point: THREE.Vector3; anchorSide: "left" | "right" | "front" | "back" } => candidate != null);

      for (const candidate of candidates) {
        const distanceSq = candidate.point.distanceToSquared(backCenterWorld);
        if (!best || distanceSq < best.distanceSq) {
          best = { distanceSq, anchorSide: candidate.anchorSide };
        }
      }
    }

    return best?.anchorSide ?? null;
  }

  function preserveAnchoredResizeSide(
    inst: LayoutInstance,
    prevWorldBox: THREE.Box3,
    anchorSide: "left" | "right" | "front" | "back" | null
  ) {
    if (!anchorSide) return;
    const nextWorldBox = instanceWorldBox(inst);
    switch (anchorSide) {
      case "left":
        inst.root.position.x += prevWorldBox.min.x - nextWorldBox.min.x;
        break;
      case "right":
        inst.root.position.x += prevWorldBox.max.x - nextWorldBox.max.x;
        break;
      case "back":
        inst.root.position.z += prevWorldBox.min.z - nextWorldBox.min.z;
        break;
      case "front":
        inst.root.position.z += prevWorldBox.max.z - nextWorldBox.max.z;
        break;
    }
    inst.root.updateMatrixWorld(true);
  }

  function nudgePinnedModuleChain(inst: LayoutInstance, delta: THREE.Vector3) {
    const moved: Array<{ id: string; prev: THREE.Vector3 }> = [];
    if (!inst.kitchenGroupId) return moved;
    const absX = Math.abs(delta.x);
    const absZ = Math.abs(delta.z);
    if (absX < 1e-9 && absZ < 1e-9) return moved;
    const side =
      absX >= absZ
        ? delta.x >= 0
          ? "right"
          : "left"
        : delta.z >= 0
          ? "front"
          : "back";
    const chain = collectPinnedPushChain(inst.id, side);
    for (const neighborId of chain) {
      const neighbor = findInstance(neighborId);
      if (!neighbor) continue;
      moved.push({ id: neighbor.id, prev: neighbor.root.position.clone() });
      neighbor.root.position.add(delta);
      neighbor.root.updateMatrixWorld(true);
    }
    return moved;
  }

  function propagateCornerResizeToPinnedNeighbors(inst: LayoutInstance, previousParams: ModuleParams) {
    if (!inst.kitchenGroupId || !isCornerKitchenModule(inst)) return { ok: true, movedIds: [] as string[] };
    const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
    if (!group) return { ok: true, movedIds: [] as string[] };
    void previousParams;

    const armInfo = getKitchenCornerArmBindingInfo(inst, group.ctx.worktopBackOffsetMm);
    if (!armInfo) return { ok: true, movedIds: [] as string[] };
    const touchedSegments = new Set([armInfo.xSegmentIndex, armInfo.zSegmentIndex].filter((value): value is number => value != null));
    if (touchedSegments.size === 0) return { ok: true, movedIds: [] as string[] };

    const movedIds = new Set<string>();
    for (const other of instances) {
      if (other.id === inst.id || other.kitchenGroupId !== inst.kitchenGroupId) continue;
      const otherBinding = other.kitchenPlacement;
      if (!otherBinding || otherBinding.worktopId !== armInfo.worktopId) continue;
      if ((otherBinding.kind ?? "segment") === "corner") continue;
      if (!touchedSegments.has(otherBinding.segmentIndex)) continue;
      const before = other.root.position.clone();
      if (!applyKitchenPlacementBinding(other, structuredClone(otherBinding), group.ctx.worktopBackOffsetMm)) continue;
      if (before.distanceToSquared(other.root.position) > 1e-10) movedIds.add(other.id);
    }

    return { ok: true, movedIds: Array.from(movedIds) };
  }

  function propagateModuleResizeToPinnedNeighbors(
    inst: LayoutInstance,
    prevWorldBox: THREE.Box3,
    prevBoxesById?: Map<string, THREE.Box3>
  ) {
    if (!inst.kitchenGroupId) return { ok: true, movedIds: [] as string[] };

    const nextWorldBox = instanceWorldBox(inst);
    const moves: Array<{ side: "left" | "right" | "front" | "back"; delta: THREE.Vector3 }> = [];
    const rightDelta = nextWorldBox.max.x - prevWorldBox.max.x;
    const leftDelta = nextWorldBox.min.x - prevWorldBox.min.x;
    const frontDelta = nextWorldBox.max.z - prevWorldBox.max.z;
    const backDelta = nextWorldBox.min.z - prevWorldBox.min.z;

    if (Math.abs(rightDelta) > 1e-6) moves.push({ side: "right", delta: new THREE.Vector3(rightDelta, 0, 0) });
    if (Math.abs(leftDelta) > 1e-6) moves.push({ side: "left", delta: new THREE.Vector3(leftDelta, 0, 0) });
    if (Math.abs(frontDelta) > 1e-6) moves.push({ side: "front", delta: new THREE.Vector3(0, 0, frontDelta) });
    if (Math.abs(backDelta) > 1e-6) moves.push({ side: "back", delta: new THREE.Vector3(0, 0, backDelta) });

    const movedIds = new Set<string>();
    for (const move of moves) {
      const chain = prevBoxesById
        ? collectPinnedPushChainFromBoxes(inst.id, move.side, prevBoxesById, inst.kitchenGroupId)
        : collectPinnedPushChain(inst.id, move.side);
      for (const neighborId of chain) {
        const neighbor = findInstance(neighborId);
        if (!neighbor) continue;
        neighbor.root.position.add(move.delta);
        neighbor.root.updateMatrixWorld(true);
        movedIds.add(neighborId);
      }
    }

    return { ok: true, movedIds: Array.from(movedIds) };
  }

  function snapPosition(moving: LayoutInstance, desired: THREE.Vector3) {
    return snapPositionDetailed(moving, desired).position;
  }

  function setPlacementAdjacencyPreview(link: ModuleAdjacencyLink | null) {
    if (!link) {
      placementAdjacencyPreview.visible = false;
      return;
    }
    placementAdjacencyPreview.geometry.dispose();
    placementAdjacencyPreview.geometry = new THREE.BufferGeometry().setFromPoints([link.lineStart, link.lineEnd]);
    placementAdjacencyPreview.visible = true;
  }

  function updateModuleAdjacencyVisuals() {
    for (const child of [...moduleAdjacencyGroup.children]) {
      if (child === placementAdjacencyPreview) continue;
      moduleAdjacencyGroup.remove(child);
      const line = child as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }

    if (viewMode !== "2d" || activeViewerTab !== "floorplan") {
      moduleAdjacencyGroup.visible = placementAdjacencyPreview.visible;
      return;
    }

    const done = new Set<string>();
    for (const inst of instances) {
      const box = instanceWorldBox(inst);
      for (const other of instances) {
        if (other.id === inst.id) continue;
        const key = [inst.id, other.id].sort().join("|");
        if (done.has(key)) continue;
        done.add(key);
        const info = detectModuleAdjacencyInfo(box, instanceWorldBox(other), other.id);
        if (!info) continue;
        const linePoints =
          info.axis === "x"
            ? [
                new THREE.Vector3(info.seam, 0.014, info.overlapMin),
                new THREE.Vector3(info.seam, 0.014, info.overlapMax)
              ]
            : [
                new THREE.Vector3(info.overlapMin, 0.014, info.seam),
                new THREE.Vector3(info.overlapMax, 0.014, info.seam)
              ];
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(linePoints),
          new THREE.LineBasicMaterial({ color: 0x384253, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
        );
        line.renderOrder = 59;
        moduleAdjacencyGroup.add(line);
      }
    }

    moduleAdjacencyGroup.visible = moduleAdjacencyGroup.children.length > 0;
  }

  function applyWallConstraints(moving: LayoutInstance, desired: THREE.Vector3) {
    const snapDist = 0.03; // 30mm

    const currentPos = moving.root.position.clone();
    moving.root.position.copy(desired);
    const a = instanceLayoutWorldBox(moving);
    moving.root.position.copy(currentPos);

    const next = desired.clone();

    // Hard clamp inside room bounds.
    if (a.min.x < -roomBounds.halfW) next.x += -roomBounds.halfW - a.min.x;
    if (a.max.x > roomBounds.halfW) next.x -= a.max.x - roomBounds.halfW;
    if (a.min.z < -roomBounds.halfD) next.z += -roomBounds.halfD - a.min.z;
    if (a.max.z > roomBounds.halfD) next.z -= a.max.z - roomBounds.halfD;

    // Soft snap to walls when close.
    const trySnap = (delta: THREE.Vector3) => {
      const prev = moving.root.position.clone();
      moving.root.position.copy(next.clone().add(delta));
      const ok = !anyOverlap(moving, null) && !moduleOverlapsWalls(moving);
      moving.root.position.copy(prev);
      if (ok) next.add(delta);
    };

    const currentPos2 = moving.root.position.clone();
    moving.root.position.copy(next);
    const b = instanceLayoutWorldBox(moving);
    moving.root.position.copy(currentPos2);

    const dxL = -roomBounds.halfW - b.min.x;
    const dxR = roomBounds.halfW - b.max.x;
    const dzB = -roomBounds.halfD - b.min.z; // back wall (-Z)
    const dzF = roomBounds.halfD - b.max.z; // front wall (+Z)

    if (Math.abs(dxL) <= snapDist) trySnap(new THREE.Vector3(dxL, 0, 0));
    if (Math.abs(dxR) <= snapDist) trySnap(new THREE.Vector3(dxR, 0, 0));
    if (Math.abs(dzB) <= snapDist) trySnap(new THREE.Vector3(0, 0, dzB));
    if (Math.abs(dzF) <= snapDist) trySnap(new THREE.Vector3(0, 0, dzF));

    return next;
  }

  function autoOrientModuleToRoomWallIfSnapped(inst: LayoutInstance, ignoreIds?: Set<string>) {
    const snapDist = 0.03; // 30mm
    const box = instanceLayoutWorldBox(inst);
    const dxL = -roomBounds.halfW - box.min.x;
    const dxR = roomBounds.halfW - box.max.x;
    const dzB = -roomBounds.halfD - box.min.z; // back (-Z)
    const dzF = roomBounds.halfD - box.max.z; // front (+Z)

    const candidates: Array<{ dist: number; rotY: number }> = [];
    if (Math.abs(dxL) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dxL), rotY: Math.PI / 2 }); // back = -X
    if (Math.abs(dxR) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dxR), rotY: -Math.PI / 2 }); // back = +X
    if (Math.abs(dzB) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dzB), rotY: 0 }); // back = -Z
    if (Math.abs(dzF) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dzF), rotY: Math.PI }); // back = +Z
    if (candidates.length === 0) return;

    candidates.sort((a, b) => a.dist - b.dist);
    const targetRot = candidates[0].rotY;

    const prevPos = inst.root.position.clone();
    const prevRot = inst.root.rotation.y;

    inst.root.rotation.y = targetRot;
    inst.root.position.copy(applyWallConstraints(inst, inst.root.position.clone()));
    const inRoom = instanceFitsRoom(inst);
    const overlaps = ignoreIds ? anyOverlapIgnoring(inst, ignoreIds) : anyOverlap(inst, null);
    if (!inRoom || overlaps || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst)) {
      inst.root.rotation.y = prevRot;
      inst.root.position.copy(prevPos);
      inst.root.updateMatrixWorld(true);
      return;
    }
    inst.root.updateMatrixWorld(true);
  }

  function setView2d(enabled: boolean) {
    if (!enabled && S.kitchenEditMode && kitchenWorktopDraw.active) {
      handleKitchenWorktopEscape();
    }
    viewMode = enabled ? "2d" : "3d";
    S.viewMode = viewMode;
    setViewMode(viewMode);
    if (!enabled) activeViewerTab = "3d";
    if (enabled && activeViewerTab === "3d") activeViewerTab = "floorplan";
    syncViewerTabs(activeViewerTab);
    const isFloorplanView = enabled && activeViewerTab === "floorplan";
    const isDetailOrthoView = enabled && activeViewerTab !== "floorplan";
    setPlanPresentation(isFloorplanView);
    viewNavigation.syncControls();
    if (!isDetailOrthoView) {
      activeDetailClipPlanes = [];
    }

    for (const inst of instances) {
      ensurePickAndOutline(inst, isFloorplanView);
      inst.module.visible = !enabled || isDetailOrthoView;
      const outlineMaterial = inst.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.95 : 0.98;
      outlineMaterial.depthTest = !enabled;
      inst.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }

    if (windowInst) {
      const outlineMaterial = windowInst.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.98 : 0.75;
      outlineMaterial.depthTest = !enabled;
      windowInst.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }

    for (const floor of floors) {
      floor.mesh.visible = !enabled || isFloorplanView;
      (floor.outline.material as THREE.LineBasicMaterial).depthTest = !enabled;
      floor.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }

    for (const worktop of kitchenWorktops) {
      worktop.outline.geometry.dispose();
      worktop.outline.geometry = makeKitchenWorktopOutlineGeometry(worktop.params, isFloorplanView);
      worktop.outline.position.set(0, worktop.params.heightMm / 1000 + (isFloorplanView ? 0.0015 : 0), 0);
      worktop.mesh.visible = !enabled || isFloorplanView || isDetailOrthoView;
      worktop.outline.visible = isFloorplanView || isDetailOrthoView;
      const outlineMaterial = worktop.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.98 : 0.94;
    }

    wallSnapMarkers.visible = isFloorplanView && !!selectedWallId;
    if (!isFloorplanView) {
      drawSnapOverlay.hide();
      hideHoverCursor();
    }
    updateSelectionHighlights();
    updateAllSectionVisuals();
    updateDetailSliceOverlay();

    wallPlanGroup.visible = isFloorplanView;
    rebuildWallPlanMesh();
    for (const w of walls) {
      w.mesh.visible = !enabled || isFloorplanView || isDetailOrthoView;
      w.outline.visible = !enabled || isDetailOrthoView;
      const outlineMaterial = w.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0 : 0.94;
      outlineMaterial.depthTest = !(isFloorplanView || isDetailOrthoView);
    }
    syncDetailClippingAndMaterials();
  }

  function setMode(next: AppMode) {
    if (next !== "layout") return;
    mode = next;
    S.mode = mode;

    const isLayout = mode === "layout";
    if (!isLayout && placement.active) cancelPlacement(S, placementHelpers);
    buildUi.style.display = isLayout ? "none" : "";
    layoutUi.style.display = isLayout ? "" : "none";
    partsBuildHost.style.display = isLayout ? "none" : "";
    partsLayoutHost.style.display = isLayout ? "" : "none";

    args.propertiesEl.hidden = !isLayout;
    if (drawOrthoToggleEl) drawOrthoToggleEl.style.display = isLayout ? "" : "none";
    if (!isLayout) {
      layoutTool = "select";
      clearWallDrawState();
    }

    if (!isLayout) {
      measureState.enabled = false;
      args.measureBtn.textContent = "Measure: Off";
      clearAllMeasurements();
      hideHoverCursor();
      args.measureReadoutEl.textContent = "";
    }

    layoutRoot.visible = isLayout;

    if (cabinetGroup) cabinetGroup.visible = !isLayout;
    clearOverlapHighlight();
    selectMesh(null);

    if (isLayout) {
      setView2d(view2d.checked);
      updateLayoutPanel();
      if (selectedKind === "window") setSelectedWindow();
      else if (selectedKind === "section") setSelectedSection(selectedSectionId);
      else if (selectedKind === "wall") setSelectedWall(selectedWallId);
      else if (selectedKind === "floor") setSelectedFloor(selectedFloorId);
      else setSelectedModule(selectedInstanceId);

      // Hide selection editors in right panel (use properties panel on the left).
      windowEditorHost.style.display = "none";
      instanceEditorHost.style.display = "none";
      mountProps();
    } else {
      setView2d(false);
      selectedKind = null;
      selectedWallId = null;
      windowEditorHost.style.display = "none";
      instanceEditorHost.style.display = "";
      setInstanceSelected(null);
      mountControls();
      rebuild();
      showNoProps();
    }
  }

  function buildLayoutExportPayload() {
    return {
      mode: "layout" as const,
      units: "mm" as const,
      generatedAt: new Date().toISOString(),
      window: windowInst ? windowInst.params : null,
      floors: floors.map((floor) => ({
        id: floor.id,
        params: floor.params
      })),
      sections: sections.map((section) => ({
        id: section.id,
        params: section.params
      })),
      modules: instances.map((i) => ({
        id: i.id,
        type: i.params.type,
        positionMm: {
          x: Math.round(i.root.position.x * 1000),
          y: Math.round(i.root.position.y * 1000),
          z: Math.round(i.root.position.z * 1000)
        },
        params: i.params
      }))
    };
  }

  const selectMesh = (mesh: THREE.Mesh | null) => {
    selectedMesh = mesh;

    if (selectedBox) {
      scene.remove(selectedBox);
      selectedBox.geometry.dispose();
      (selectedBox.material as THREE.Material).dispose();
      selectedBox = null;
    }

    if (grainArrow) {
      scene.remove(grainArrow);
      (grainArrow.line.material as THREE.Material).dispose();
      (grainArrow.cone.material as THREE.Material).dispose();
      grainArrow = null;
    }

    if (!mesh) {
      activeBuildControls?.clearHighlights?.();
      partPanel.setSelected(null);
      return;
    }

    partPanel.setSelected(mesh.name);
    activeBuildControls?.highlightParamKeys?.(((mesh as any).userData?.paramKeys as string[] | undefined) ?? []);

    selectedBox = new THREE.BoxHelper(mesh, 0xffe066);
    selectedBox.name = "selectionBox";
    scene.add(selectedBox);

    const grain = computeGrainArrow(mesh);
    if (grain) {
      grainArrow = new THREE.ArrowHelper(grain.dir, grain.origin, grain.length, 0x3ddc97, grain.length * 0.22, grain.length * 0.12);
      grainArrow.name = "grainArrow";
      grainArrow.visible = false;
    }
  };

  window.addEventListener("keydown", (ev) => {
    if (S.kitchenEditMode) return;
    if (!selectedMesh) return;
    const k = ev.key.toLowerCase();
    if (k === "p") toggleSelectedPbr(selectedMesh, "all");
    if (k === "n") toggleSelectedPbr(selectedMesh, "normal");
    if (k === "r") toggleSelectedPbr(selectedMesh, "roughness");
  });

  const selectByName = (name: string) => {
    const mesh = cabinetGroup ? findSelectableMeshByName(cabinetGroup, name) : null;
    if (!mesh || !mesh.visible) {
      selectMesh(null);
      return;
    }
    selectMesh(mesh);
  };

  const setVisibleByName = (name: string, visible: boolean) => {
    if (visible) hiddenParts.delete(name);
    else hiddenParts.add(name);

    const mesh = cabinetGroup ? findSelectableMeshByName(cabinetGroup, name) : null;
    if (mesh) mesh.visible = visible;

    partPanel.updateVisibility(name, visible);

    if (selectedMesh?.name === name && !visible) selectMesh(null);
  };

  const clearOverlapHighlight = () => {
    for (const o of overlapBoxes) {
      scene.remove(o.helper);
      o.helper.geometry.dispose();
      (o.helper.material as THREE.Material).dispose();
    }
    overlapBoxes = [];
  };

  const showForHighlight = (name: string) => {
    if (hiddenParts.has(name)) {
      hiddenParts.delete(name);
      const mesh = cabinetGroup ? findSelectableMeshByName(cabinetGroup, name) : null;
      if (mesh) mesh.visible = true;
      partPanel.updateVisibility(name, true);
    }
  };

  const highlightOverlap = (a: string, b: string) => {
    if (!cabinetGroup) return;

    showForHighlight(a);
    showForHighlight(b);

    const ma = findSelectableMeshByName(cabinetGroup, a);
    const mb = findSelectableMeshByName(cabinetGroup, b);
    if (!ma || !mb) return;

    clearOverlapHighlight();

    const ha = new THREE.BoxHelper(ma, 0xff6b6b);
    const hb = new THREE.BoxHelper(mb, 0xffd166);
    scene.add(ha);
    scene.add(hb);
    overlapBoxes = [
      { mesh: ma, helper: ha },
      { mesh: mb, helper: hb }
    ];
  };

  const mountControls = () => {
    editorHost.innerHTML = "";
    activeBuildControls = null;

    if (!hasImportedModules) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = noModulesMessage;
      editorHost.appendChild(empty);
      renderErrors(args.errorsEl, [noModulesMessage]);
      return;
    }

    const worktopArgs = { getWorktopThicknessMm: () => 0 };

    activeBuildControls = getModuleDescriptorOrThrow(params.type).createControls(editorHost, params, {
      ...worktopArgs,
      onChange: () => afterParamsChanged()
    });
  };

  const afterParamsChanged = () => {
    rebuild();
    args.exportOutEl.value = "";
  };

  const rebuild = () => {
    if (!hasImportedModules) {
      renderErrors(args.errorsEl, [noModulesMessage]);
      if (cabinetGroup) {
        scene.remove(cabinetGroup);
        disposeObject3D(cabinetGroup);
        cabinetGroup = null;
      }
      args.exportOutEl.value = "";
      return;
    }

    const errors = validateModule(params);
    renderErrors(args.errorsEl, errors);
    if (errors.length > 0) return;

    const next = buildModule(params);

    if (cabinetGroup) {
      scene.remove(cabinetGroup);
      disposeObject3D(cabinetGroup);
    }
    cabinetGroup = next;
    scene.add(cabinetGroup);

    const parts = getSelectableMeshes(cabinetGroup).map((m) => {
      m.visible = !hiddenParts.has(m.name);
      return {
        name: m.name,
        visible: m.visible,
        dimensionsMm: readDimensionsMm(m),
        grainAlong: readGrainAlong(m)
      };
    });
    partPanel.setRows(parts);

    partPanel.setOverlaps(computeOverlaps(cabinetGroup));
    clearOverlapHighlight();

    if (selectedMesh) {
      const keepName = selectedMesh.name;
      const nextSelected = findSelectableMeshByName(cabinetGroup, keepName);
      selectMesh(nextSelected && nextSelected.visible ? nextSelected : null);
    } else {
      partPanel.setSelected(null);
    }

    // Frame a bit better after rebuild.
    const box = new THREE.Box3().setFromObject(cabinetGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const controls = ctl();
    const camera = cam() as THREE.PerspectiveCamera;
    controls.target.copy(center);
    camera.position.set(center.x + maxDim * 0.9, center.y + maxDim * 0.6, center.z + maxDim * 1.2);
    camera.near = Math.max(0.001, maxDim / 1000);
    camera.far = Math.max(50, maxDim * 20);
    camera.updateProjectionMatrix();
    controls.update();
  };

  args.resetBtn.addEventListener("click", () => {
    if (!selectedInstanceId) return;
    const inst = findInstance(selectedInstanceId);
    if (!inst) return;

    inst.params = getModuleDescriptorOrThrow(inst.params.type).defaultParams();
    mountInstanceControls(inst);
    rebuildInstance(inst);
  });

  exportActions = createExportActions({
    appArgs: args,
    fileTab: tb.getTab("file"),
    renderer,
    scene,
    getCamera: cam,
    getCameraTarget: () => {
      const target = (ctl() as any)?.target;
      return target instanceof THREE.Vector3 ? target : undefined;
    },
    getHdriSettings,
    getWindowOpening,
    getDaylightIntensity,
    buildLayoutExportPayload,
    onLanguageChange: () => window.location.reload()
  });

  const ro = new ResizeObserver(() => {
    const w = args.viewerEl.clientWidth;
    const h = args.viewerEl.clientHeight;
    setSize(w, h);
    dimensionOverlay.setSize(w, h);
    ssgi?.setSize(w, h);
    photo?.setSize(w, h);
  });
  ro.observe(args.viewerEl);

  // Prevent browser context menu so right-drag marquee works.
  renderer.domElement.addEventListener("contextmenu", (ev) => {
    if (mode === "layout" && viewMode === "2d" && layoutTool === "select") {
      ev.preventDefault();
    }
  });

  // Quick edit dimension value (double click)
  renderer.domElement.addEventListener("dblclick", (ev) => {
    if (mode !== "layout") return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    pointerNdc.set(x, y);
    raycaster.setFromCamera(pointerNdc, cam());

    const moduleHit = raycaster.intersectObjects(getAllInstanceGeometryMeshes(), false)[0]?.object as THREE.Mesh | undefined;
    const instanceId = getInstanceIdFromObject(moduleHit);
    const inst = instanceId ? findInstance(instanceId) : null;
    if (inst?.kitchenGroupId && !S.kitchenEditMode) {
      kitchenMode?.enterExisting(inst.kitchenGroupId);
      return;
    }

    const worktopHit = raycaster.intersectObjects(getKitchenWorktopGeometryMeshes(), false)[0]?.object as THREE.Mesh | undefined;
    const worktopId = getWorktopIdFromObject(worktopHit);
    const worktop = worktopId ? findKitchenWorktop(worktopId) : null;
    if (worktop?.kitchenGroupId && !S.kitchenEditMode) {
      kitchenMode?.enterExisting(worktop.kitchenGroupId);
      return;
    }

    const floorHit = raycaster.intersectObjects(floors.flatMap((floor) => [floor.mesh, floor.outline]), false)[0]?.object as THREE.Object3D | undefined;
    const floorId = (floorHit?.userData?.floorId as string | undefined) ?? null;
    if (floorId && !floorEdit.active) {
      enterFloorBoundaryEdit(floorId);
      return;
    }
  });

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (viewNavigation.handlePointerDown(ev)) {
      return;
    }

    // Marquee selection in 2D layout select tool (left button) - start pending, activate on drag.
    if (
      mode === "layout" &&
      viewMode === "2d" &&
      activeViewerTab === "floorplan" &&
      layoutTool === "select" &&
      !floorEdit.active &&
      !transformState.kind &&
      !placement.active &&
      ev.button === 0 &&
      !measureState.enabled
    ) {
      const rect = renderer.domElement.getBoundingClientRect();
      marquee.pending = true;
      marquee.active = false;
      marquee.pointerId = ev.pointerId;
      marquee.hitSomething = false;
      marquee.startX = ev.clientX - rect.left;
      marquee.startY = ev.clientY - rect.top;
      marquee.mode = "contain";
      marqueeEl.style.display = "none";
      try {
        renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      // do not return; we still want click selection / dragging to work
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    pointerNdc.set(x, y);

    raycaster.setFromCamera(pointerNdc, cam());

    if (mode === "layout") {
      if (floorEdit.active) {
        if (ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        const point = worldToFloorPoint(hitPoint);
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const pickedEdit = pickFloorEditElement(mouse, rect);

        if (pickedEdit) {
          floorEdit.first = null;
          floorEdit.hover = null;
          floorEdit.error = "";
          if (pickedEdit.kind === "vertex") {
            const startPoint = { ...floorEdit.segments[pickedEdit.ref.segmentIndex][pickedEdit.ref.endpoint] };
            floorEdit.selectedVertex = pickedEdit.ref;
            floorEdit.selectedSegmentIndex = null;
            floorEdit.drag = { pointerId: ev.pointerId, kind: "vertex", startPoint, startSegments: cloneFloorSegments(floorEdit.segments) };
          } else {
            floorEdit.selectedSegmentIndex = pickedEdit.segmentIndex;
            floorEdit.selectedVertex = null;
            floorEdit.drag = {
              pointerId: ev.pointerId,
              kind: "segment",
              segmentIndex: pickedEdit.segmentIndex,
              startWorld: point,
              startSegments: cloneFloorSegments(floorEdit.segments)
            };
          }
          renderFloorBoundaryEdit();
          renderer.domElement.setPointerCapture(ev.pointerId);
          mountProps();
          return;
        }

        floorEdit.selectedSegmentIndex = null;
        floorEdit.selectedVertex = null;

        if (floorEdit.tool === "pickLines") {
          const picked = pickWallLine2D(hitPoint, rect, cam(), 14);
          const alignPicked = pickAlignLineAt(hitPoint, mouse, rect);
          const a = picked?.a ?? alignPicked?.segA ?? null;
          const b = picked?.b ?? alignPicked?.segB ?? null;
          if (!a || !b) {
            setUnderlayStatus("Floor boundary: nebola nájdená hrana.");
            return;
          }
          addFloorEditSegment(worldToFloorPoint(a), worldToFloorPoint(b));
          setUnderlayStatus("Floor boundary: hrana pridaná.");
          return;
        }

        if (!floorEdit.first) {
          floorEdit.first = point;
          floorEdit.hover = point;
          renderFloorBoundaryEdit();
          return;
        }

        if (floorEdit.tool === "rectangle") {
          const a = floorEdit.first;
          const b = floorEdit.ortho ? floorOrthoPoint(a, point) : point;
          const p1 = { x: a.x, z: a.z };
          const p2 = { x: b.x, z: a.z };
          const p3 = { x: b.x, z: b.z };
          const p4 = { x: a.x, z: b.z };
          floorEdit.segments.push({ a: p1, b: p2 }, { a: p2, b: p3 }, { a: p3, b: p4 }, { a: p4, b: p1 });
          floorEdit.first = null;
          floorEdit.hover = null;
          renderFloorBoundaryEdit();
          return;
        }

        if (floorEdit.tool === "circle") {
          const points = makeFloorCirclePoints(floorEdit.first, point);
          for (let i = 0; i < points.length; i++) floorEdit.segments.push({ a: points[i], b: points[(i + 1) % points.length] });
          floorEdit.first = null;
          floorEdit.hover = null;
          renderFloorBoundaryEdit();
          return;
        }

        const start = floorEdit.first;
        const rawEnd = floorEdit.ortho ? floorOrthoPoint(start, point) : point;
        const end = floorEdit.segments.length >= 2 && floorEdit.segments[0] && floorPointEq(rawEnd, floorEdit.segments[0].a, 12) ? floorEdit.segments[0].a : rawEnd;
        addFloorEditSegment(start, end);
        floorEdit.first = floorPointEq(end, floorEdit.segments[0]?.a ?? end, 3) ? null : end;
        floorEdit.hover = floorEdit.first;
        renderFloorBoundaryEdit();
        return;
      }

      if (underlayCal.active) {
        if (!underlayMesh.visible || underlayState.pinned) {
          underlayCal.active = false;
          underlayCal.first = null;
          setUnderlayStatus("Underlay not available.");
          return;
        }

        const hit = raycaster.intersectObject(underlayMesh, false)[0];
        if (!hit) {
          setUnderlayStatus("Click on underlay.");
          return;
        }
        const hitPoint = hit.point.clone();
        if (!underlayCal.first) {
          underlayCal.first = hitPoint.clone();
          setUnderlayStatus(underlayCal.mode === "reference" ? "Referenčná škála: klikni druhý bod..." : "Kalibrácia: klikni druhý bod...");
          return;
        }

        const a = underlayCal.first;
        const b = hitPoint;
        const distM = Math.hypot(b.x - a.x, b.z - a.z);
        if (distM <= 1e-6) {
          setUnderlayStatus("Reference scale failed (zero distance).");
          underlayCal.active = false;
          underlayCal.first = null;
          return;
        }

        let desiredMm = Math.max(1, underlayCal.knownMm);
        if (underlayCal.mode === "reference") {
          const measuredMm = Math.round(distM * 1000);
          const s = window.prompt("Reálna vzdialenosť (mm)", String(measuredMm));
          const n = s === null ? null : Number(s.trim().replace(",", "."));
          if (!n || !Number.isFinite(n) || n <= 0) {
            setUnderlayStatus("Reference scale canceled.");
            underlayCal.active = false;
            underlayCal.first = null;
            return;
          }
          desiredMm = n;
        }

        const desiredM = desiredMm / 1000;
        if (distM > 1e-6 && underlayMesh.visible) {
          const factor = desiredM / distM;
          underlayState.scale *= factor;
          updateUnderlayTransform();
          if (underlayScaleEl) underlayScaleEl.value = String(underlayState.scale);
          setUnderlayStatus(underlayCal.mode === "reference" ? `Reference scale OK: ${Math.round(desiredMm)} mm` : `Kalibrácia OK: ${Math.round(desiredMm)} mm`);
        } else {
          setUnderlayStatus("Kalibrácia zlyhala (nulová vzdialenosť).");
        }

        underlayCal.active = false;
        underlayCal.first = null;
        return;
      }

      if (placement.active && viewMode === "2d" && activeViewerTab === "floorplan" && layoutTool === "select") {
        if (ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        rebuildGhost(S, placementHelpers, hitPoint);
        commitPlacement(S, placementHelpers);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (layoutTool === "select" && viewMode === "2d" && activeViewerTab === "floorplan" && transformState.kind) {
        if (ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        const snapped = snapPoint2D(hitPoint, rect, cam(), 24);
        const p = snapped.kind !== "none" ? snapped.point : hitPoint;

        if (transformState.kind === "move") {
          if (transformState.step === "pickBase") {
            transformState.base = p.clone();
            transformState.step = "pickTarget";
            transformState.lastValidDelta.set(0, 0, 0);
            setUnderlayStatus("Move: click target point...");
            return;
          }
          if (transformState.step === "pickTarget" && transformState.base) {
            const delta = p.clone().sub(transformState.base);
            applyMoveDelta(delta);
            commitHistory(S);
            clearTransform({ status: "Move: done." });
            mountProps();
            return;
          }
        }

        if (transformState.kind === "rotate") {
          if (transformState.step === "pickPivot") {
            transformState.pivot = p.clone();
            transformState.step = "rotating";
            transformState.typed = "";
            transformState.lastValidAngle = 0;
            transformState.startPointerAngle = Math.atan2(hitPoint.z - p.z, hitPoint.x - p.x);
            setUnderlayStatus("Rotate: move mouse to rotate (type degrees + Enter). Click to finish.");
            return;
          }
          if (transformState.step === "rotating") {
            commitHistory(S);
            clearTransform({ status: "Rotate: done." });
            mountProps();
            return;
          }
        }
      }

      if (layoutTool === "dimension") {
        if (viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

        const rect2 = renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };
        const picked = pickAlignLineAt(hitPoint, mouse, rect2);

        if (picked) {
          if (dimensionState.picked.length > 0 && !areAlignLinesParallel(dimensionState.picked[0]!, picked)) {
            setUnderlayStatus("Kóta: ďalšia čiara musí byť rovnobežná s prvou.");
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          if (technicalDimensions.isLinePicked(picked)) {
            setUnderlayStatus("Kóta: táto čiara už je vybraná.");
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          dimensionState.picked.push(picked);
          dimensionState.preview = [];
          setUnderlayStatus(
            dimensionState.picked.length === 1
              ? "Kóta: vyber ďalšiu rovnobežnú čiaru."
              : `Kóta: vybrané ${dimensionState.picked.length} čiary. Pridaj ďalšiu alebo klikni do voľného miesta.`
          );
          mountProps();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        if (dimensionState.picked.length < 2) {
          setUnderlayStatus("Kóta: najprv vyber aspoň dve rovnobežné čiary.");
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        const dims = technicalDimensions.buildFromPickedLines(dimensionState.picked, hitPoint, "dimension");
        technicalDimensions.commitDimensions(dims);
        technicalDimensions.resetDraft();
        setUnderlayStatus(dims.length > 0 ? `Kóta: vložené ${dims.length}. Vyber ďalšiu prvú čiaru.` : "Kóta: nepodarilo sa vložiť.");
        mountProps();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (layoutTool === "align") {
        if (viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

        const rect2 = renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };
        const picked = pickAlignLineAt(hitPoint, mouse, rect2);

        if (!picked) {
          setUnderlayStatus("Align: click a wall/module/worktop line.");
          return;
        }

        if (!alignState.ref) {
          alignState.ref = picked;
          alignState.lastA = null;
          alignState.lastB = null;
          alignState.lastUntilMs = 0;
          setUnderlayStatus("Align: click second parallel line...");
          mountProps();
          return;
        }

        const ref = alignState.ref;
        const result = applyAlignBetweenPickedLines(ref, picked);
        if (!result.ok) {
          setUnderlayStatus(result.reason);
          alignState.ref = null;
          mountProps();
          return;
        }
        updateSelectionHighlights();
        commitHistory(S);

        alignState.lastA = ref;
        alignState.lastB = picked;
        alignState.lastUntilMs = performance.now() + 2500;
        alignState.ref = null;
        setUnderlayStatus(result.reason);
        mountProps();
        return;
      }

      if (layoutTool === "trim") {
        if (viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

        const rect2 = renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };
        const picked = pickAlignLineAt(hitPoint, mouse, rect2);
        if (!picked) {
          setUnderlayStatus(trimState.step === "pickTarget" ? "Trim: click target wall line." : "Trim: click cutter line.");
          return;
        }

        if (trimState.step === "pickTarget") {
          if (!picked.wallId) return;
          trimState.targetWallId = picked.wallId;
          trimState.targetPick = picked;
          trimState.targetClick = hitPoint.clone();
          trimState.step = "pickCutter";
          trimState.lastTarget = null;
          trimState.lastCutter = null;
          trimState.lastUntilMs = 0;
          setUnderlayStatus("Trim: click cutter line...");
          mountProps();
          return;
        }

        const cutterClick = hitPoint.clone();

        const wallId = trimState.targetWallId;
        const w = wallId ? (walls.find((x) => x.id === wallId) ?? null) : null;
        if (!w) {
          trimState.step = "pickTarget";
          trimState.targetWallId = null;
          trimState.targetPick = null;
          setUnderlayStatus("Trim: target missing. Click target wall...");
          mountProps();
          return;
        }
        if (pinnedWallIds.has(w.id)) {
          trimState.step = "pickTarget";
          trimState.targetWallId = null;
          trimState.targetPick = null;
          trimState.targetClick = null;
          setUnderlayStatus("Trim: target is pinned.");
          mountProps();
          return;
        }

        // Wall-to-wall Trim/Extend to Corner: if second click hits another wall line, extend/trim both walls to their intersection.
        if (picked.wallId !== w.id && trimState.targetPick && trimState.targetClick) {
          const w2 = walls.find((x) => x.id === picked.wallId) ?? null;
          if (w2 && !pinnedWallIds.has(w2.id)) {
            const I = lineLineIntersectionXZ(trimState.targetPick.p, trimState.targetPick.dir, picked.p, picked.dir);
            if (!I) {
              setUnderlayStatus("Trim: walls must not be parallel.");
              return;
            }

            const chooseEnd = (wall: WallInstance, click: THREE.Vector3) => {
              const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
              const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
              return click.distanceTo(a) <= click.distanceTo(b) ? ("a" as const) : ("b" as const);
            };

            const iMm = toMmPoint(I);
            const end1 = chooseEnd(w, trimState.targetClick);
            const end2 = chooseEnd(w2, cutterClick);

            const old1 = end1 === "a" ? w.params.aMm : w.params.bMm;
            const old2 = end2 === "a" ? w2.params.aMm : w2.params.bMm;

            const dx1 = iMm.x - old1.x;
            const dz1 = iMm.z - old1.z;
            const dx2 = iMm.x - old2.x;
            const dz2 = iMm.z - old2.z;

            if (dx1 !== 0 || dz1 !== 0) moveWallEndpointAndConnected(w, end1, dx1, dz1);
            if (dx2 !== 0 || dz2 !== 0) moveWallEndpointAndConnected(w2, end2, dx2, dz2);
            commitHistory(S);

            trimState.lastTarget = trimState.targetPick;
            trimState.lastCutter = picked;
            trimState.lastUntilMs = performance.now() + 2500;
            trimState.step = "pickTarget";
            trimState.targetWallId = null;
            trimState.targetPick = null;
            trimState.targetClick = null;
            setUnderlayStatus("Trim: corner done. Click target wall...");
            mountProps();
            return;
          }
        }

        const aW = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
        const bW = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
        const ab = bW.clone().sub(aW);
        const len2 = ab.lengthSq();
        if (len2 < 1e-10) {
          setUnderlayStatus("Trim: wall too small.");
          return;
        }
        const dW = ab.clone().normalize();
        const dC = picked.dir.clone().normalize();
        const I = lineLineIntersectionXZ(aW, dW, picked.p, dC);
        if (!I) {
          setUnderlayStatus("Trim: cutter must not be parallel.");
          return;
        }

        const t = I.clone().sub(aW).dot(ab) / len2;
        if (t < -1e-5 || t > 1 + 1e-5) {
          setUnderlayStatus("Trim: cutter must cross the wall segment.");
          return;
        }

        const nC = new THREE.Vector3(-dC.z, 0, dC.x);
        const sign = (v: number) => (v > 1e-7 ? 1 : v < -1e-7 ? -1 : 0);
        let sClick = sign(nC.dot(hitPoint.clone().sub(picked.p)));
        const sA = sign(nC.dot(aW.clone().sub(picked.p)));
        const sB = sign(nC.dot(bW.clone().sub(picked.p)));
        if (sClick === 0) sClick = sA !== 0 ? sA : sB;

        let moveWhich: "a" | "b" = "a";
        if (sClick !== 0) {
          if (sA === sClick && sB !== sClick) moveWhich = "a";
          else if (sB === sClick && sA !== sClick) moveWhich = "b";
          else {
            // ambiguous: choose closer endpoint to the click point
            moveWhich = cutterClick.distanceTo(aW) <= cutterClick.distanceTo(bW) ? "a" : "b";
          }
        } else {
          moveWhich = cutterClick.distanceTo(aW) <= cutterClick.distanceTo(bW) ? "a" : "b";
        }

        const iMm = toMmPoint(I);
        const old = moveWhich === "a" ? w.params.aMm : w.params.bMm;
        const dxMm = iMm.x - old.x;
        const dzMm = iMm.z - old.z;

        if (dxMm === 0 && dzMm === 0) {
          setUnderlayStatus("Trim: no change.");
          trimState.step = "pickTarget";
          trimState.targetWallId = null;
          trimState.targetPick = null;
          trimState.targetClick = null;
          mountProps();
          return;
        }

        moveWallEndpointAndConnected(w, moveWhich, dxMm, dzMm);
        commitHistory(S);

        trimState.lastTarget = trimState.targetPick ?? picked;
        trimState.lastCutter = picked;
        trimState.lastUntilMs = performance.now() + 2500;
        trimState.step = "pickTarget";
        trimState.targetWallId = null;
        trimState.targetPick = null;
        trimState.targetClick = null;
        setUnderlayStatus("Trim: done. Click target wall...");
        mountProps();
        return;
      }

      if (layoutTool === "measure") {
        if (ev.button !== 0) return;
        let kind: string = "none";
        let point: THREE.Vector3 | null = null;
        let binding: PlanSnapBinding | null = null;
        const normalMode = viewMode === "2d" && ev.shiftKey;

        if (viewMode === "2d") {
          const hitPoint = new THREE.Vector3();
          if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
          const snapped = resolveMeasurePlanSnap(hitPoint, rect, normalMode);
          kind = snapped.kind;
          point = snapped.kind !== "none" ? snapped.point : hitPoint;
          binding = bindingFromPlanSnap(snapped, point);
          if (!measureState.axisLock && (snapped.kind === "none" || snapped.kind === "axis")) {
            const axisAssist = applyMeasureAxisAssist(measureState.firstPoint, point, cam(), rect, 12);
            if (axisAssist) {
              point = axisAssist.point;
              kind = "axis";
              binding = toFreePlanBinding(point);
            }
          }
        } else {
          const hit = pickSurfacePoint(raycaster, getLayoutMeasureMeshes3d());
          if (!hit) return;
          const snapTarget = getMeasure3DSnapTargetObject(hit.object);
          const snapped = snapPoint3D(hit.point, snapTarget ?? hit.object, cam(), rect, 32);
          kind = snapped.kind;
          point = snapped.point;
          binding = toFreePlanBinding(point);
          if (!measureState.axisLock && snapped.kind === "free") {
            const axisAssist = applyMeasureAxisAssist3D(measureState.firstPoint, point, cam(), rect, 12);
            if (axisAssist) {
              point = axisAssist.point;
              kind = "axis";
              binding = toFreePlanBinding(point);
            }
          }
        }
        if (!point) return;

        if (!measureState.firstPoint) {
          measureState.firstPoint = point.clone();
          measureState.firstBinding = binding ?? toFreePlanBinding(point);
          setFirstPointMarker(measureState.firstPoint);
          args.measureReadoutEl.textContent =
            normalMode
              ? `Normála (${kind}): ${formatMm(point)} — klikni druhý bod smernice.`
              : `Prvý bod (${kind}): ${formatMm(point)} — klikni druhý bod.`;
          setUnderlayStatus(normalMode ? "Measure: klikni druhý bod smernice pre normálu." : "Measure: klikni druhý bod.");
          mountProps();
          return;
        }

        let a = measureState.firstPoint.clone();
        let b = point.clone();
        if (measureState.axisLock) b = viewMode === "2d" ? axisLockXZ(a, b) : axisLockPoint3D(a, b);
        const aBinding = measureState.firstBinding ?? toFreePlanBinding(a);
        const bBinding = binding ?? toFreePlanBinding(b);
        if (normalMode) {
          const baseDir = b.clone().sub(a).setY(0);
          if (baseDir.lengthSq() > 1e-10) {
            baseDir.normalize();
            const normalDir = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
            const spanM = Math.max(4, Math.min(30, a.distanceTo(b) * 6));
            addMeasurement(
              a.clone().addScaledVector(normalDir, -spanM / 2),
              a.clone().addScaledVector(normalDir, spanM / 2),
              aBinding,
              bBinding,
              { kind: "normalGuide" }
            );
          }
        } else {
          addMeasurement(a, b, aBinding, bBinding, {
            kind: "distance",
            distanceMm: viewMode === "2d" ? planarDistanceMm(a, b) : distance3dMm(a, b)
          });
        }
        measureState.firstPoint = null;
        measureState.firstBinding = null;
        setFirstPointMarker(null);
        clearPreview();
        clearToolHud();
        return;
      }

      if (layoutTool === "section") {
        if (viewMode !== "2d" || activeViewerTab !== "floorplan" || ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        const resolved = resolveSectionDrawPoint(hitPoint, rect, !ev.shiftKey);
        sectionDraw.axisLocked = resolved.axisLocked;
        const point = { x: Math.round(resolved.point.x * 1000), z: Math.round(resolved.point.z * 1000) };

        if (!sectionDraw.a) {
          sectionDraw.a = point;
          sectionDraw.hoverPoint = point;
          updateSectionDrawPreview();
          setUnderlayStatus("Section: klikni druhý bod. Ortho = rovno, Shift = bez axis snap, Space = zrkadliť smer.");
          mountProps();
          return;
        }

        if (commitSectionDraw(point)) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        return;
      }

      if (S.kitchenEditMode && kitchenWorktopDraw.active) {
        if (viewMode !== "2d" || ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        const rect2 = renderer.domElement.getBoundingClientRect();
        const activeSnap = resolveKitchenWorktopDrawSnap(hitPoint, rect2);
        const source = activeSnap ? activeSnap.point : hitPoint.clone();
        const rawPoint = { x: Math.round(source.x * 1000), z: Math.round(source.z * 1000) };
        const basePoint = kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1] ?? null;
        const point = basePoint ? floorOrthoPoint(basePoint, rawPoint) : rawPoint;
        appendKitchenWorktopPoint(point);
        return;
      }

      if (layoutTool === "wall") {
        if (ev.button !== 0) return;
        // Place wall by 2 clicks on ground (XZ).
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        const rect2 = renderer.domElement.getBoundingClientRect();
        const snapped = snapPoint2D(hitPoint, rect2, cam());
        const shouldAxisSnap = drawOrthoEnabled && !ev.shiftKey && snapped.kind === "none";

      if (!wallDraw.active) {
        wallDraw.active = true;
        wallDraw.segments = wallDraw.segments || 0;
        const start = snapped.kind !== "none" ? snapped.point : hitPoint.clone();
        const startMm = { x: Math.round(start.x * 1000), z: Math.round(start.z * 1000) };
        wallDraw.a = new THREE.Vector3(startMm.x / 1000, 0, startMm.z / 1000);
        if (!wallDraw.chainStart) wallDraw.chainStart = wallDraw.a.clone();
        wallDraw.hoverB = wallDraw.a.clone();
        wallDraw.typedMm = "";
        wallTypedHud.style.display = "none";
        if (!wallDraw.preview) {
          wallDraw.preview = makeWallPreviewMesh(wallDraw.a, wallDraw.a, wallDefault.thicknessMm);
          wallDraw.preview.name = "wallPreview";
          layoutRoot.add(wallDraw.preview);
        }
        updateWallMeshWithJustification(
          wallDraw.preview,
          wallDraw.a,
          wallDraw.a,
          wallDefault.thicknessMm,
          wallDefault.justification,
          wallDefault.exteriorSign
        );
        setUnderlayStatus("Stena: druhý bod... (píš mm + Enter, Shift = bez axis snap, Esc = stop)");
        return;
      }

        const a = wallDraw.a;
        if (!a) return;
        const b0 = snapped.kind !== "none" ? snapped.point : hitPoint.clone();
        const b = shouldAxisSnap ? snapAxisXZ(a, b0, true) : b0;
        const bMm = { x: Math.round(b.x * 1000), z: Math.round(b.z * 1000) };
        const bExact = new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000);

        // Snap to chain start when closing loop.
        const closeTolM = 0.03;
        const cs = wallDraw.chainStart;
        const closes =
          !!cs && wallDraw.segments >= 2 && Math.hypot(bExact.x - cs.x, bExact.z - cs.z) <= closeTolM;
        const end = closes && cs ? cs.clone() : bExact;

        // Finish wall
        const w = addWall(a, end, wallDefault.thicknessMm);
        if (!w) return;
        autoJoinAtMmPoint(w.params.aMm);
        autoJoinAtMmPoint(w.params.bMm);
        wallDraw.segments += 1;

        if (closes) {
          clearWallDrawState();
          setUnderlayStatus("Wall: chain closed.");
          return;
        }

        // Continue chain from end point.
        wallDraw.active = true;
        wallDraw.a = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
        wallDraw.hoverB = wallDraw.a.clone();
        wallDraw.typedMm = "";
        wallTypedHud.style.display = "none";
        updateWallMeshWithJustification(
          wallDraw.preview!,
          wallDraw.a,
          wallDraw.a,
          wallDefault.thicknessMm,
          wallDefault.justification,
          wallDefault.exteriorSign
        );
        setUnderlayStatus("Stena: ďalší bod... (píš mm + Enter, Shift = bez axis snap, Esc = stop)");
        // Keep wall tool active; just show properties for the placed wall.
        selectedKind = "wall";
        selectedWallId = w.id;
        mountProps();
        return;
      }

      if (measureState.enabled) return;

      // 2D wall selection without raycasting (walls are hidden in 2D; plan mesh is merged).
      if (viewMode === "2d" && activeViewerTab === "floorplan" && layoutTool === "select" && ev.button === 0) {
        const hitPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        const pMm = toMmPoint(hitPoint);
        const rect2 = renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };

        const sectionHit = raycaster.intersectObjects(getSectionPickMeshes(), false)[0]?.object;
        const sectionId = getSectionIdFromObject(sectionHit);
        if (sectionId) {
          if (marquee.pending && marquee.pointerId === ev.pointerId) {
            marquee.hitSomething = true;
            marquee.pending = false;
            marquee.active = false;
            marqueeEl.style.display = "none";
          }
          setSelectedSection(sectionId);
          return;
        }

        const moduleHit = raycaster.intersectObjects(getAllInstanceGeometryMeshes(), false)[0]?.object;
        const moduleId = getInstanceIdFromObject(moduleHit);
        const selectableModuleId = moduleId && kitchenMode ? kitchenMode.filterSelectableInstanceId(moduleId) : moduleId;
        if (selectableModuleId && beginModuleSelection(selectableModuleId, ev)) return;

        const fallbackModuleId = findSelectableFloorplanModuleAtPoint(pMm, mouse, rect2);
        if (fallbackModuleId && beginModuleSelection(fallbackModuleId, ev)) return;

        const worktopHit = raycaster.intersectObjects(getKitchenWorktopGeometryMeshes(), false)[0]?.object;
        const worktopId = getWorktopIdFromObject(worktopHit);
        if (worktopId && beginKitchenWorktopSelection(worktopId, ev)) return;

        let bestFloor: { id: string; px: number } | null = null;
        for (const floor of floors) {
          const boundary = floor.params.boundary;
          for (let i = 0; i < boundary.length; i++) {
            const a = boundary[i];
            const b = boundary[(i + 1) % boundary.length];
            const sa = worldToScreen(floorPointToWorld(a), cam(), rect2);
            const sb = worldToScreen(floorPointToWorld(b), cam(), rect2);
            const edgePx = distPxPointToSeg(mouse.x, mouse.y, sa.x, sa.y, sb.x, sb.y);
            const cornerPx = Math.min(Math.hypot(mouse.x - sa.x, mouse.y - sa.y), Math.hypot(mouse.x - sb.x, mouse.y - sb.y));
            const px = Math.min(edgePx, cornerPx);
            if (px <= 12 && (!bestFloor || px < bestFloor.px)) bestFloor = { id: floor.id, px };
          }
        }
        if (bestFloor) {
          if (marquee.pending && marquee.pointerId === ev.pointerId) {
            marquee.hitSomething = true;
            marquee.pending = false;
            marquee.active = false;
            marqueeEl.style.display = "none";
          }
          setSelectedFloor(bestFloor.id);
          return;
        }

        // Prefer polygon hit-testing when available.
        let bestPoly: { id: string; px: number } | null = null;
        const pW = { x: pMm.x / 1000, z: pMm.z / 1000 };
        for (const [id, poly] of wallSolvedOutlines) {
          if (poly.length < 3) continue;
          if (!pointInPolygonXZ(pW, poly)) continue;
          // score by distance to mouse from wall midpoint (stable pick)
          const w = walls.find((x) => x.id === id) ?? null;
          const mid = w ? new THREE.Vector3((w.params.aMm.x + w.params.bMm.x) / 2000, 0, (w.params.aMm.z + w.params.bMm.z) / 2000) : new THREE.Vector3(pW.x, 0, pW.z);
          const s = worldToScreen(mid, cam(), rect2);
          const px = Math.hypot(s.x - mouse.x, s.y - mouse.y);
          if (!bestPoly || px < bestPoly.px) bestPoly = { id, px };
        }
        if (bestPoly) {
          if (marquee.pending && marquee.pointerId === ev.pointerId) {
            marquee.hitSomething = true;
            marquee.pending = false;
            marquee.active = false;
            marqueeEl.style.display = "none";
          }
          setSelectedWall(bestPoly.id);
          return;
        }

        let best: { id: string; px: number } | null = null;
        for (const w of walls) {
          const closest = pointOnWallAxisMm(w, pMm);
          if (!Number.isFinite(closest.distMm)) continue;
          const cp = new THREE.Vector3(closest.closest.x / 1000, 0, closest.closest.z / 1000);
          const s = worldToScreen(cp, cam(), rect2);
          const px = Math.hypot(s.x - mouse.x, s.y - mouse.y);
          if (!best || px < best.px) best = { id: w.id, px };
        }

        if (best && best.px <= 10) {
          if (marquee.pending && marquee.pointerId === ev.pointerId) {
            marquee.hitSomething = true;
            marquee.pending = false;
            marquee.active = false;
            marqueeEl.style.display = "none";
          }
          setSelectedWall(best.id);
          return;
        }
      }

      const picks: THREE.Object3D[] = getAllInstanceGeometryMeshes();
      if (windowInst) picks.push(windowInst.pick);
      for (const w of walls) picks.push(w.mesh);
      for (const floor of floors) picks.push(floor.mesh, floor.outline as any);
      const hits = raycaster.intersectObjects(picks, false);
      const first = hits[0]?.object as THREE.Mesh | undefined;
      const worktopHit3d = raycaster.intersectObjects(getKitchenWorktopGeometryMeshes(), false)[0]?.object as THREE.Mesh | undefined;
      const kind = (first?.userData?.kind as string | undefined) ?? "module";

      if (kind === "window") {
        if (!windowInst) return;
        if (marquee.pending && marquee.pointerId === ev.pointerId) {
          marquee.hitSomething = true;
          marquee.pending = false;
          marquee.active = false;
          marqueeEl.style.display = "none";
        }
        setSelectedWindow();

        windowDragState.active = true;
        windowDragState.wall = windowInst.params.wall;

        const def = wallDefs[windowInst.params.wall];
        const hitPoint = new THREE.Vector3();
        const okWall = raycaster.ray.intersectPlane(def.plane, hitPoint);
        if (!okWall) {
          if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
        }
        const axis = def.axis === "x" ? hitPoint.x : hitPoint.z;
        windowDragState.offsetMm = windowInst.params.centerMm - axis * 1000;
        renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }

      const id = getInstanceIdFromObject(first);
      const wallId = (first?.userData?.wallId as string | undefined) ?? null;
      const floorId = (first?.userData?.floorId as string | undefined) ?? null;
      if (kind === "floor") {
        if (viewMode === "2d" && activeViewerTab !== "floorplan") {
          selectedKind = null;
          selectedSectionId = null;
          selectedKitchenGroupId = null;
          selectedFloorId = null;
          selectedWallId = null;
          selectedWallIds.clear();
          selectedInstanceId = null;
          selectedInstanceIds.clear();
          setInstanceSelected(null);
          showWallSnapMarkersFor(null);
          syncSelectionState();
          updateSelectionHighlights();
          updateAllSectionVisuals();
          mountProps();
          return;
        }
        if (!floorId) {
          setSelectedFloor(null);
          return;
        }
        if (marquee.pending && marquee.pointerId === ev.pointerId) {
          marquee.hitSomething = true;
          marquee.pending = false;
          marquee.active = false;
          marqueeEl.style.display = "none";
        }
        setSelectedFloor(floorId);
        return;
      }
      if (kind === "wall") {
        if (!wallId) {
          setSelectedWall(null);
          return;
        }
        if (marquee.pending && marquee.pointerId === ev.pointerId) {
          marquee.hitSomething = true;
          marquee.pending = false;
          marquee.active = false;
          marqueeEl.style.display = "none";
        }
        setSelectedWall(wallId);
        return;
      }

      if (!id) {
        const worktopId = getWorktopIdFromObject(first) ?? getWorktopIdFromObject(worktopHit3d);
        if (worktopId && beginKitchenWorktopSelection(worktopId, ev)) return;
        if (viewMode === "2d" && layoutTool === "select" && ev.button === 0 && underlayMesh.visible && !underlayState.pinned) {
          const underlayHit = raycaster.intersectObject(underlayMesh, false)[0];
          if (underlayHit) {
            if (marquee.pending && marquee.pointerId === ev.pointerId) {
              marquee.hitSomething = true;
              marquee.pending = false;
              marquee.active = false;
              marqueeEl.style.display = "none";
            }
            setSelectedUnderlay();
            const hitPoint = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
            underlayDragState.active = true;
            underlayDragState.pointerId = ev.pointerId;
            underlayDragState.startWorld.copy(hitPoint);
            underlayDragState.startOffsetMm = { x: underlayState.offsetMm.x, z: underlayState.offsetMm.z };
            renderer.domElement.setPointerCapture(ev.pointerId);
            setUnderlayStatus("Drag underlay... (Pin when ready)");
            return;
          }
        }
        if (marquee.pending && marquee.pointerId === ev.pointerId) {
          // don't clear selection yet; if it becomes a drag we want marquee selection
          return;
        }
        setSelectedFloor(null);
        setSelectedWall(null);
        setSelectedModule(null);
        clearWindowLightIfMissing();
        return;
      }

      const selectableId = kitchenMode ? kitchenMode.filterSelectableInstanceId(id) : id;
      if (!selectableId) {
        const worktopId = getWorktopIdFromObject(first) ?? getWorktopIdFromObject(worktopHit3d);
        if (worktopId && beginKitchenWorktopSelection(worktopId, ev)) return;
        setSelectedModule(null);
        clearWindowLightIfMissing();
        return;
      }

      beginModuleSelection(selectableId, ev);
      return;
    }

    if (!cabinetGroup) return;

    const meshes = getSelectableMeshes(cabinetGroup).filter((m) => m.visible);

    if (measureState.enabled) {
      const hit = pickSurfacePoint(raycaster, meshes);
      if (!hit) return;

      const snapped = snapPointXZ(hit.point, hit.object);
      if (!measureState.firstPoint) {
        measureState.firstPoint = snapped.point;
        measureState.firstBinding = toFreePlanBinding(snapped.point);
        args.measureReadoutEl.textContent = `First point (${snapped.kind}): ${formatMm(snapped.point)} â€” pick second pointâ€¦`;
        return;
      }

      let a = measureState.firstPoint;
      let b = snapped.point;
      if (measureState.axisLock) b = axisLockXZ(a, b);

      addMeasurement(a, b, measureState.firstBinding ?? toFreePlanBinding(a), toFreePlanBinding(b), {
        kind: "distance",
        distanceMm: planarDistanceMm(a, b)
      });
      measureState.firstPoint = null;
      measureState.firstBinding = null;
      clearPreview();
      return;
    }

    const hits = raycaster.intersectObjects(meshes, false);
    const first = hits[0]?.object as THREE.Mesh | undefined;
    selectMesh(first ?? null);
  });

  // Live hover + preview (SketchUp-like)
  renderer.domElement.addEventListener("pointermove", (ev) => {
    if (viewNavigation.handlePointerMove(ev)) {
      return;
    }

    if (mode === "layout" && viewMode === "2d" && floorEdit.active) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const floorPoint = worldToFloorPoint(hitPoint);

      const activeFloorDrag = floorEdit.drag;
      if (activeFloorDrag && activeFloorDrag.pointerId === ev.pointerId) {
        if (activeFloorDrag.kind === "vertex") {
          moveFloorEditVertex(activeFloorDrag.startSegments, activeFloorDrag.startPoint, floorPoint);
        } else {
          moveFloorEditSegment(activeFloorDrag.startSegments, activeFloorDrag.segmentIndex, activeFloorDrag.startWorld, floorPoint);
        }
        floorEdit.error = "";
        renderFloorBoundaryEdit();
        return;
      }

      if (floorEdit.tool === "pickLines") {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = pickWallLine2D(hitPoint, rect, cam(), 14);
        const alignPicked = pickAlignLineAt(hitPoint, mouse, rect);
        const a = picked?.a ?? alignPicked?.segA ?? null;
        const b = picked?.b ?? alignPicked?.segB ?? null;
        if (a && b) updateHudLine(hudHoverLine, a, b, hudLineThicknessM(rect));
        else hudHoverLine.visible = false;
      } else {
        hudHoverLine.visible = false;
      }

      if (floorEdit.first) {
        floorEdit.hover = floorEdit.ortho ? floorOrthoPoint(floorEdit.first, floorPoint) : floorPoint;
        renderFloorBoundaryEdit();
      }
      return;
    }

    if (mode === "layout" && viewMode === "2d" && layoutTool === "select" && placement.active) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      rebuildGhost(S, placementHelpers, hitPoint);
      return;
    }

    // Wall edit drag (2D, select tool)
    if (mode === "layout" && viewMode === "2d" && layoutTool === "select" && wallEditHud.drag) {
      const d = wallEditHud.drag;
      const w = walls.find((x) => x.id === d.wallId) ?? null;
      if (!w) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

      if (d.kind === "move") {
        const dx = hitPoint.x - d.startWorld.x;
        const dz = hitPoint.z - d.startWorld.z;
        const nextA = { x: Math.round(d.startA.x + dx * 1000), z: Math.round(d.startA.z + dz * 1000) };
        const nextB = { x: Math.round(d.startB.x + dx * 1000), z: Math.round(d.startB.z + dz * 1000) };
        w.params.aMm = nextA;
        w.params.bMm = nextB;

        const touched = new Set<string>();
        touched.add(w.id);
        for (const c of d.connectedA) {
          const ow = walls.find((x) => x.id === c.wallId) ?? null;
          if (!ow) continue;
          if (c.which === "a") ow.params.aMm = nextA;
          else ow.params.bMm = nextA;
          touched.add(ow.id);
        }
        for (const c of d.connectedB) {
          const ow = walls.find((x) => x.id === c.wallId) ?? null;
          if (!ow) continue;
          if (c.which === "a") ow.params.aMm = nextB;
          else ow.params.bMm = nextB;
          touched.add(ow.id);
        }

        for (const id of touched) {
          const ww = walls.find((x) => x.id === id) ?? null;
          if (ww) rebuildWall(ww);
        }
        rebuildWallPlanMesh();

        // Block moving walls into modules.
        if (instances.some((i) => moduleOverlapsWalls(i))) {
          w.params.aMm = { x: d.startA.x, z: d.startA.z };
          w.params.bMm = { x: d.startB.x, z: d.startB.z };
          for (const c of d.connectedA) {
            const ow = walls.find((x) => x.id === c.wallId) ?? null;
            if (!ow) continue;
            if (c.which === "a") ow.params.aMm = { x: d.startA.x, z: d.startA.z };
            else ow.params.bMm = { x: d.startA.x, z: d.startA.z };
          }
          for (const c of d.connectedB) {
            const ow = walls.find((x) => x.id === c.wallId) ?? null;
            if (!ow) continue;
            if (c.which === "a") ow.params.aMm = { x: d.startB.x, z: d.startB.z };
            else ow.params.bMm = { x: d.startB.x, z: d.startB.z };
          }
          for (const ww of walls) rebuildWall(ww);
          rebuildWallPlanMesh();
        }
        return;
      }

      const which = d.kind;
      const other = which === "a" ? fromMmPoint(d.startB) : fromMmPoint(d.startA);
      const snapped = snapPoint2D(hitPoint, rect, cam());
      const shouldAxisSnap = !ev.shiftKey && snapped.kind === "none";
      const p0 = snapped.kind !== "none" ? snapped.point : hitPoint;
      const p = shouldAxisSnap ? snapAxisXZ(other, p0, true) : p0;
      const pMm = toMmPoint(p);

      if (which === "a") w.params.aMm = pMm;
      else w.params.bMm = pMm;

      const touched = new Set<string>();
      touched.add(w.id);
      const connected = which === "a" ? d.connectedA : d.connectedB;
      for (const c of connected) {
        const ow = walls.find((x) => x.id === c.wallId) ?? null;
        if (!ow) continue;
        if (c.which === "a") ow.params.aMm = pMm;
        else ow.params.bMm = pMm;
        touched.add(ow.id);
      }
      for (const id of touched) {
        const ww = walls.find((x) => x.id === id) ?? null;
        if (ww) rebuildWall(ww);
      }
      rebuildWallPlanMesh();

      // Block moving walls into modules.
      if (instances.some((i) => moduleOverlapsWalls(i))) {
        // Restore endpoints from drag start snapshot.
        if (which === "a") w.params.aMm = { x: d.startA.x, z: d.startA.z };
        else w.params.bMm = { x: d.startB.x, z: d.startB.z };
        for (const c of connected) {
          const ow = walls.find((x) => x.id === c.wallId) ?? null;
          if (!ow) continue;
          const src = which === "a" ? d.startA : d.startB;
          if (c.which === "a") ow.params.aMm = { x: src.x, z: src.z };
          else ow.params.bMm = { x: src.x, z: src.z };
        }
        for (const ww of walls) rebuildWall(ww);
        rebuildWallPlanMesh();
      }
      return;
    }

    if (mode === "layout" && viewMode === "2d" && layoutTool === "select" && transformState.kind) {
      const rect = renderer.domElement.getBoundingClientRect();
      transformState.lastPointerPx.x = ev.clientX - rect.left;
      transformState.lastPointerPx.y = ev.clientY - rect.top;

      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

      const snapped = snapPoint2D(hitPoint, rect, cam(), 24, {
        sticky: selectPlanSnap
      });
      selectPlanSnap = snapped.kind !== "none" ? snapped : null;
      const p = snapped.kind !== "none" ? snapped.point : hitPoint;
      if (snapped.kind !== "none") {
        updateHoverCursor(worldToScreen(p, cam(), rect), snapped.kind);
      } else {
        hideHoverCursor();
      }

      if (transformState.kind === "move" && transformState.step === "pickTarget" && transformState.base) {
        const delta = p.clone().sub(transformState.base);
        applyMoveDelta(delta);
        setUnderlayStatus(`Posun: Δ ${Math.round(delta.x * 1000)}×${Math.round(delta.z * 1000)} mm (klikni pre dokončenie)`);
        return;
      }

      if (transformState.kind === "rotate" && transformState.step === "rotating" && transformState.pivot) {
        const pivot = transformState.pivot;
        const a0 = transformState.startPointerAngle;
        const a1 = Math.atan2(hitPoint.z - pivot.z, hitPoint.x - pivot.x);
        let d = a1 - a0;
        // normalize
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        transformState.lastAngleSign = d < 0 ? -1 : 1;
        applyRotateAngle(d);
        setUnderlayStatus(`Rotácia: ${Math.round((d * 180) / Math.PI)}° (klikni pre dokončenie)`);
        return;
      }
    }


    if (marquee.active) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      marquee.mode = x >= marquee.startX ? "contain" : "touch";
      if (marquee.mode === "contain") {
        marqueeEl.style.border = "1px solid rgba(92, 140, 255, 0.95)";
        marqueeEl.style.background = "rgba(92, 140, 255, 0.10)";
      } else {
        marqueeEl.style.border = "1px solid rgba(61, 220, 151, 0.95)";
        marqueeEl.style.background = "rgba(61, 220, 151, 0.10)";
      }
      const x0 = Math.min(marquee.startX, x);
      const y0 = Math.min(marquee.startY, y);
      const x1 = Math.max(marquee.startX, x);
      const y1 = Math.max(marquee.startY, y);
      marqueeEl.style.left = `${x0}px`;
      marqueeEl.style.top = `${y0}px`;
      marqueeEl.style.width = `${Math.max(0, x1 - x0)}px`;
      marqueeEl.style.height = `${Math.max(0, y1 - y0)}px`;
    }

    if (marquee.pending && !marquee.active && marquee.pointerId === ev.pointerId) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const w = Math.abs(x - marquee.startX);
      const h = Math.abs(y - marquee.startY);
      if (w >= 6 || h >= 6) {
        marquee.active = true;
        marqueeEl.style.border = "1px solid rgba(92, 140, 255, 0.95)";
        marqueeEl.style.background = "rgba(92, 140, 255, 0.10)";
        marqueeEl.style.left = `${marquee.startX}px`;
        marqueeEl.style.top = `${marquee.startY}px`;
        marqueeEl.style.width = "0px";
        marqueeEl.style.height = "0px";
        marqueeEl.style.display = "block";
      }
    }

    if (mode === "layout" && viewMode === "2d" && layoutTool === "select" && underlayDragState.active && underlayDragState.pointerId === ev.pointerId) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const dxMm = Math.round((hitPoint.x - underlayDragState.startWorld.x) * 1000);
      const dzMm = Math.round((hitPoint.z - underlayDragState.startWorld.z) * 1000);
      underlayState.offsetMm.x = underlayDragState.startOffsetMm.x + dxMm;
      underlayState.offsetMm.z = underlayDragState.startOffsetMm.z + dzMm;
      updateUnderlayTransform();
      if (underlayOffXEl) underlayOffXEl.value = String(underlayState.offsetMm.x);
      if (underlayOffZEl) underlayOffZEl.value = String(underlayState.offsetMm.z);
      if (selectedUnderlayBox) (selectedUnderlayBox as any).update?.();
      return;
    }

    if (mode === "layout" && viewMode === "2d" && layoutTool === "dimension") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        dimensionState.hover = null;
        dimensionState.preview = [];
        clearToolHud();
      } else {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = pickAlignLineAt(hitPoint, mouse, rect);
        const canPick = !picked || dimensionState.picked.length === 0 || areAlignLinesParallel(dimensionState.picked[0]!, picked);
        const thick = hudLineThicknessM(rect);
        dimensionState.hover = canPick ? picked : null;
        if (dimensionState.hover) updateHudLine(hudHoverLine, dimensionState.hover.segA, dimensionState.hover.segB, thick);
        else hudHoverLine.visible = false;

        if (dimensionState.picked[0]) updateHudLine(hudPickLine1, dimensionState.picked[0].segA, dimensionState.picked[0].segB, thick);
        else hudPickLine1.visible = false;

        const lastPicked = dimensionState.picked.length > 1 ? dimensionState.picked[dimensionState.picked.length - 1] : null;
        if (lastPicked) updateHudLine(hudPickLine2, lastPicked.segA, lastPicked.segB, thick);
        else hudPickLine2.visible = false;

        dimensionState.preview =
          !picked && dimensionState.picked.length >= 2
            ? technicalDimensions.buildFromPickedLines(dimensionState.picked, hitPoint, "preview")
            : [];
      }
    }

    if (mode === "layout" && viewMode === "2d" && (layoutTool === "align" || layoutTool === "trim")) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        clearToolHud();
      } else {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = pickAlignLineAt(hitPoint, mouse, rect);
        const thick = hudLineThicknessM(rect);

        const now = performance.now();
        if (layoutTool === "align") {
          alignState.hover = picked;
          if (picked) updateHudLine(hudHoverLine, picked.segA, picked.segB, thick);
          else hudHoverLine.visible = false;

          if (alignState.ref) {
            updateHudLine(hudPickLine1, alignState.ref.segA, alignState.ref.segB, thick);
            hudPickLine2.visible = false;
          } else if (alignState.lastA && alignState.lastB && alignState.lastUntilMs > now) {
            updateHudLine(hudPickLine1, alignState.lastA.segA, alignState.lastA.segB, thick);
            updateHudLine(hudPickLine2, alignState.lastB.segA, alignState.lastB.segB, thick);
          } else {
            alignState.lastA = null;
            alignState.lastB = null;
            alignState.lastUntilMs = 0;
            hudPickLine1.visible = false;
            hudPickLine2.visible = false;
          }
        } else {
          trimState.hover = picked;
          if (picked) updateHudLine(hudHoverLine, picked.segA, picked.segB, thick);
          else hudHoverLine.visible = false;

          if (trimState.targetPick) updateHudLine(hudPickLine1, trimState.targetPick.segA, trimState.targetPick.segB, thick);
          else hudPickLine1.visible = false;

          if (trimState.lastTarget && trimState.lastCutter && trimState.lastUntilMs > now) {
            updateHudLine(hudPickLine1, trimState.lastTarget.segA, trimState.lastTarget.segB, thick);
            updateHudLine(hudPickLine2, trimState.lastCutter.segA, trimState.lastCutter.segB, thick);
          } else if (trimState.step === "pickCutter" && trimState.targetPick) {
            hudPickLine2.visible = false;
          } else {
            if (trimState.lastUntilMs <= now) {
              trimState.lastTarget = null;
              trimState.lastCutter = null;
              trimState.lastUntilMs = 0;
              if (!trimState.targetPick) {
                hudPickLine1.visible = false;
                hudPickLine2.visible = false;
              }
            }
          }
        }
      }
      // no return; other pointermove handling can still run (e.g. marquee box)
    }

    if (mode === "layout" && viewMode === "2d" && layoutTool === "measure") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        hideHoverCursor();
        clearToolHud();
        clearPreview();
        return;
      }

      const normalMode = ev.shiftKey;
      updateMeasureHoverFromPlanPoint(hitPoint, rect, normalMode);
      return;
    }

    if (mode === "layout" && viewMode === "3d" && layoutTool === "measure") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());

      const hit = pickSurfacePoint(raycaster, getLayoutMeasureMeshes3d());
      if (!hit) {
        measureState.hoverPoint = null;
        measureState.hoverSnap = "none";
        hideHoverCursor();
        clearToolHud();
        clearPreview();
        args.measureReadoutEl.textContent = measureState.firstPoint
          ? "Measure 3D: pick second point."
          : "Measure 3D: click first point.";
        return;
      }

      const snapTarget = getMeasure3DSnapTargetObject(hit.object);
      const snapped = snapPoint3D(hit.point, snapTarget ?? hit.object, cam(), rect, 32);
      let kind: typeof measureState.hoverSnap = snapped.kind;
      let point = snapped.point.clone();
      if (!measureState.axisLock && snapped.kind === "free") {
        const axisAssist = applyMeasureAxisAssist3D(measureState.firstPoint, point, cam(), rect, 12);
        if (axisAssist) {
          point = axisAssist.point;
          kind = "axis";
        }
      }

      measureState.hoverPoint = point.clone();
      measureState.hoverSnap = kind;
      updateHoverCursor(worldToScreen(point, cam(), rect), kind);

      const thick = hudLineThicknessM(rect);
      if (kind === "axis" && measureState.firstPoint) {
        updateHudLine(hudHoverLine, measureState.firstPoint, point, thick * 1.75);
      } else {
        hudHoverLine.visible = false;
      }

      if (measureState.firstPoint) {
        const a = measureState.firstPoint.clone();
        let b = point.clone();
        if (measureState.axisLock) b = axisLockPoint3D(a, b);
        updatePreview(a, b, rect, distance3dMm(a, b));
        args.measureReadoutEl.textContent = `Measure 3D (${kind}): ${Math.round(distance3dMm(a, b))} mm`;
      } else {
        clearPreview();
        args.measureReadoutEl.textContent = `Measure 3D hover (${kind}): ${Math.round(point.x * 1000)}, ${Math.round(point.y * 1000)}, ${Math.round(point.z * 1000)}`;
      }
      setFirstPointMarker(measureState.firstPoint);
      return;
    }

    if (mode === "layout" && layoutTool === "section" && viewMode === "2d" && activeViewerTab === "floorplan") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        hideHoverCursor();
        drawSnapOverlay.hide();
        return;
      }
      const resolved = resolveSectionDrawPoint(hitPoint, rect, !ev.shiftKey);
      sectionDraw.axisLocked = resolved.axisLocked;
      if (resolved.kind !== "none") {
        updateHoverCursor(worldToScreen(resolved.point, cam(), rect), resolved.kind);
        drawSnapOverlay.showWorld(resolved.point, cam(), rect, resolved.kind);
      } else {
        hideHoverCursor();
        drawSnapOverlay.hide();
      }
      sectionDraw.hoverPoint = { x: Math.round(resolved.point.x * 1000), z: Math.round(resolved.point.z * 1000) };
      updateSectionDrawPreview();
      return;
    }

    if (mode === "layout" && S.kitchenEditMode && kitchenWorktopDraw.active && viewMode === "2d") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      kitchenWorktopDraw.lastPointerPx.x = ev.clientX - rect.left;
      kitchenWorktopDraw.lastPointerPx.y = ev.clientY - rect.top;
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const activeSnap = resolveKitchenWorktopDrawSnap(hitPoint, rect);
      if (activeSnap) {
        updateHoverCursor(worldToScreen(activeSnap.point, cam(), rect), activeSnap.kind);
      } else {
        hideHoverCursor();
      }
      const source = activeSnap ? activeSnap.point : hitPoint;
      const rawPoint = { x: Math.round(source.x * 1000), z: Math.round(source.z * 1000) };
      const basePoint = kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1] ?? null;
      kitchenWorktopDraw.hoverPoint = basePoint ? floorOrthoPoint(basePoint, rawPoint) : rawPoint;
      if (kitchenWorktopDraw.typedMm.trim().length > 0) {
        wallTypedHud.textContent = `${kitchenWorktopDraw.typedMm} mm`;
        wallTypedHud.style.left = `${ev.clientX - rect.left}px`;
        wallTypedHud.style.top = `${ev.clientY - rect.top}px`;
        wallTypedHud.style.display = "block";
      } else {
        wallTypedHud.style.display = "none";
      }
      if (kitchenWorktopDraw.points.length > 0) scheduleKitchenWorktopPreviewUpdate();
      return;
    }

    if (mode === "layout" && layoutTool === "wall" && wallDraw.active && wallDraw.a && wallDraw.preview) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      wallDraw.lastPointerPx.x = ev.clientX - rect.left;
      wallDraw.lastPointerPx.y = ev.clientY - rect.top;
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const snapped = snapPoint2D(hitPoint, rect, cam(), 14, {
        sticky: wallDrawSnap
      });
      const activeSnap = snapped.kind !== "none" ? snapped : keepStickyPlanSnap(hitPoint, wallDrawSnap, cam(), rect, 18);
      wallDrawSnap = activeSnap;
      if (activeSnap) {
        updateHoverCursor(worldToScreen(activeSnap.point, cam(), rect), activeSnap.kind);
      } else {
        hideHoverCursor();
      }

      const shouldAxisSnap = drawOrthoEnabled && !ev.shiftKey && !activeSnap;
      const b0 = activeSnap ? activeSnap.point : hitPoint;
      const b = shouldAxisSnap ? snapAxisXZ(wallDraw.a, b0, true) : b0;
      wallDraw.hoverB = b.clone();
      updateWallMeshWithJustification(
        wallDraw.preview,
        wallDraw.a,
        b,
        wallDefault.thicknessMm,
        wallDefault.justification,
        wallDefault.exteriorSign
      );

      if (wallDraw.typedMm.trim().length > 0) {
        wallTypedHud.textContent = `${wallDraw.typedMm} mm`;
        wallTypedHud.style.left = `${ev.clientX - rect.left}px`;
        wallTypedHud.style.top = `${ev.clientY - rect.top}px`;
        wallTypedHud.style.display = "block";
      } else {
        wallTypedHud.style.display = "none";
      }
      return;
    }

    if (mode === "layout" && layoutTool === "wall" && viewMode === "2d") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      wallDraw.lastPointerPx.x = ev.clientX - rect.left;
      wallDraw.lastPointerPx.y = ev.clientY - rect.top;
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const snapped = snapPoint2D(hitPoint, rect, cam(), 14, {
        sticky: wallDrawSnap
      });
      const activeSnap = snapped.kind !== "none" ? snapped : keepStickyPlanSnap(hitPoint, wallDrawSnap, cam(), rect, 18);
      wallDrawSnap = activeSnap;
      if (activeSnap) {
        updateHoverCursor(worldToScreen(activeSnap.point, cam(), rect), activeSnap.kind);
      } else {
        hideHoverCursor();
      }
    }

    if (mode === "layout" && viewMode === "2d" && activeViewerTab === "floorplan" && layoutTool === "select" && !dragState.active && !windowDragState.active && !wallEditHud.drag && !marquee.active) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const snapped = snapPoint2D(hitPoint, rect, cam(), 12, {
        sticky: selectPlanSnap
      });
      const activeSnap = snapped.kind !== "none" ? snapped : keepStickyPlanSnap(hitPoint, selectPlanSnap, cam(), rect, 16);
      selectPlanSnap = activeSnap;
      if (activeSnap) {
        drawSnapOverlay.showWorld(activeSnap.point, cam(), rect, activeSnap.kind);
      } else {
        drawSnapOverlay.hide();
      }
    }

    if (mode === "layout" && windowDragState.active && windowInst && windowDragState.wall) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());

      const def = wallDefs[windowDragState.wall];
      const hitPoint = new THREE.Vector3();
      const okWall = raycaster.ray.intersectPlane(def.plane, hitPoint);
      if (!okWall) {
        if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      }

      const axis = def.axis === "x" ? hitPoint.x : hitPoint.z;
      windowInst.params.centerMm = axis * 1000 + windowDragState.offsetMm;
      updateWindowTransform(windowInst);
      mountWindowControls();
      return;
    }

    if (mode === "layout" && dragState.active && dragState.id) {
      const inst = findInstance(dragState.id);
      if (!inst) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());

      const hitPoint = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;

      const desired = new THREE.Vector3(hitPoint.x - dragState.offset.x, inst.root.position.y, hitPoint.z - dragState.offset.z);
      const desiredInRoom = applyWallConstraints(inst, desired);
      const snapped = snapPosition(inst, desiredInRoom);
      const finalPos = applyWallConstraints(inst, snapped);

      const prevPos = inst.root.position.clone();
      inst.root.position.copy(finalPos);
      autoOrientModuleToRoomWallIfSnapped(inst);
      const pushed = nudgePinnedModuleChain(inst, inst.root.position.clone().sub(prevPos));
      if (anyOverlap(inst, null) || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst)) {
        inst.root.position.copy(dragState.lastValid);
        for (const item of pushed) {
          const neighbor = findInstance(item.id);
          if (!neighbor) continue;
          neighbor.root.position.copy(item.prev);
        }
      } else {
        if (inst.kitchenGroupId) {
          const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
          const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
          inst.kitchenPlacement = inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
        }
        for (const item of pushed) {
          const neighbor = findInstance(item.id);
          if (!neighbor?.kitchenGroupId) continue;
          const group = S.kitchenGroups.find((entry) => entry.id === neighbor.kitchenGroupId) ?? null;
          const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
          neighbor.kitchenPlacement = inferKitchenPlacementBinding(neighbor, neighbor.kitchenGroupId, backOffsetMm);
        }
        dragState.lastValid.copy(inst.root.position);
        updateLayoutPanel();
      }
      return;
    }

    if (!measureState.enabled || !cabinetGroup) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    pointerNdc.set(x, y);
    raycaster.setFromCamera(pointerNdc, cam());

    const meshes = getSelectableMeshes(cabinetGroup).filter((m) => m.visible);
    const hit = pickSurfacePoint(raycaster, meshes);
    if (!hit) {
      measureState.hoverPoint = null;
      measureState.hoverSnap = "none";
      hideHoverCursor();
      args.measureReadoutEl.textContent = measureState.firstPoint
        ? "Pick second pointâ€¦ (no surface)"
        : "Click 2 points to measure (planar X/Z).";
      clearPreview();
      return;
    }

    const snapped = snapPointXZ(hit.point, hit.object);
    measureState.hoverPoint = snapped.point;
    measureState.hoverSnap = snapped.kind;

    updateHoverCursor(worldToScreen(snapped.point, cam(), rect), snapped.kind as any);

    // Preview line after first click
    if (measureState.firstPoint) {
      let a = measureState.firstPoint;
      let b = snapped.point;
      if (measureState.axisLock) b = axisLockXZ(a, b);
      updatePreview(a, b, rect);
      args.measureReadoutEl.textContent = `Measuring (${snapped.kind}) â€” ${Math.round(planarDistanceMm(a, b))} mm`;
    } else {
      args.measureReadoutEl.textContent = `Hover (${snapped.kind}): ${formatMm(snapped.point)} â€” click first point`;
      clearPreview();
    }
  });

  renderer.domElement.addEventListener("pointerup", (ev) => {
    if (viewNavigation.handlePointerUp(ev)) {
      return;
    }

    if (mode !== "layout") return;

    if (floorEdit.drag && floorEdit.drag.pointerId === ev.pointerId) {
      floorEdit.drag = null;
      renderFloorBoundaryEdit();
      mountProps();
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (wallEditHud.drag && wallEditHud.drag.pointerId === ev.pointerId) {
      const d = wallEditHud.drag;
      wallEditHud.drag = null;
      const w = walls.find((x) => x.id === d.wallId) ?? null;
      if (w) {
        autoJoinAtMmPoint(w.params.aMm);
        autoJoinAtMmPoint(w.params.bMm);
      }
      rebuildWallPlanMesh();
      mountProps();
      commitHistory(S);
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (underlayDragState.active && underlayDragState.pointerId === ev.pointerId) {
      underlayDragState.active = false;
      underlayDragState.pointerId = null;
      setUnderlayStatus("Underlay moved.");
      commitHistory(S);
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (marquee.pending && marquee.pointerId === ev.pointerId && !marquee.active) {
      marquee.pending = false;
      marquee.pointerId = null;
      if (!marquee.hitSomething && viewMode === "2d" && layoutTool === "select") {
        setSelectedWall(null);
        setSelectedModule(null);
      }
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (marquee.active) {
      marquee.active = false;
      marquee.pending = false;
      marquee.pointerId = null;
      marqueeEl.style.display = "none";

      const rect = renderer.domElement.getBoundingClientRect();
      const endX = ev.clientX - rect.left;
      const endY = ev.clientY - rect.top;
      const x0 = Math.min(marquee.startX, endX);
      const y0 = Math.min(marquee.startY, endY);
      const x1 = Math.max(marquee.startX, endX);
      const y1 = Math.max(marquee.startY, endY);
      const w = x1 - x0;
      const h = y1 - y0;

      // If it's a click-sized drag, let normal click selection handle it.
      if (w >= 6 && h >= 6 && viewMode === "2d" && layoutTool === "select") {
        const rectSel = { x0, y0, x1, y1 };
        const contains = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
          b.minX >= rectSel.x0 && b.maxX <= rectSel.x1 && b.minY >= rectSel.y0 && b.maxY <= rectSel.y1;
        const overlaps = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
          b.maxX >= rectSel.x0 && b.minX <= rectSel.x1 && b.maxY >= rectSel.y0 && b.minY <= rectSel.y1;

        const wallBounds = (w: WallInstance) => {
          const a = fromMmPoint(w.params.aMm);
          const b = fromMmPoint(w.params.bMm);
          const d = b.clone().sub(a);
          const len = d.length();
          if (len < 1e-8) {
            const s = worldToScreen(a, cam(), rect);
            return { minX: s.x, maxX: s.x, minY: s.y, maxY: s.y };
          }
          d.multiplyScalar(1 / len);
          const n = new THREE.Vector3(-d.z, 0, d.x);
          const h = Math.max(1, w.params.thicknessMm / 2) / 1000;
          const p1 = a.clone().addScaledVector(n, h);
          const p2 = a.clone().addScaledVector(n, -h);
          const p3 = b.clone().addScaledVector(n, -h);
          const p4 = b.clone().addScaledVector(n, h);
          const s1 = worldToScreen(p1, cam(), rect);
          const s2 = worldToScreen(p2, cam(), rect);
          const s3 = worldToScreen(p3, cam(), rect);
          const s4 = worldToScreen(p4, cam(), rect);
          const xs = [s1.x, s2.x, s3.x, s4.x];
          const ys = [s1.y, s2.y, s3.y, s4.y];
          return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys)
          };
        };

        const instBounds = (id: string) => {
          const inst = findInstance(id);
          if (!inst) return null;
          const meshes = getInstanceGeometryMeshes(inst);
          if (meshes.length === 0) return null;
          const box = new THREE.Box3();
          for (const mesh of meshes) box.expandByObject(mesh);
          const pts = [
            new THREE.Vector3(box.min.x, 0, box.min.z),
            new THREE.Vector3(box.min.x, 0, box.max.z),
            new THREE.Vector3(box.max.x, 0, box.min.z),
            new THREE.Vector3(box.max.x, 0, box.max.z)
          ];
          const ss = pts.map((p) => worldToScreen(p, cam(), rect));
          const xs = ss.map((p) => p.x);
          const ys = ss.map((p) => p.y);
          return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
        };

        const hitWalls: string[] = [];
        for (const ww of walls) {
          if (pinnedWallIds.has(ww.id)) continue;
          const b = wallBounds(ww);
          const ok = marquee.mode === "contain" ? contains(b) : overlaps(b);
          if (ok) hitWalls.push(ww.id);
        }

        const hitMods: string[] = [];
        for (const inst of instances) {
          if (pinnedInstanceIds.has(inst.id)) continue;
          if (kitchenMode && !kitchenMode.filterSelectableInstanceId(inst.id)) continue;
          const b = instBounds(inst.id);
          if (!b) continue;
          const ok = marquee.mode === "contain" ? contains(b) : overlaps(b);
          if (ok) hitMods.push(inst.id);
        }

        // Apply multi-selection (Shift = add).
        const nextWalls = new Set<string>(ev.shiftKey ? Array.from(selectedWallIds) : []);
        const nextMods = new Set<string>(ev.shiftKey ? Array.from(selectedInstanceIds) : []);
        for (const id of hitWalls) nextWalls.add(id);
        for (const id of hitMods) nextMods.add(id);

        // Pick primary (keep current if still selected when shift-adding).
        let primaryWall = selectedWallId && nextWalls.has(selectedWallId) ? selectedWallId : null;
        let primaryMod = selectedInstanceId && nextMods.has(selectedInstanceId) ? selectedInstanceId : null;
        if (!primaryWall && !primaryMod) {
          primaryWall = hitWalls[0] ?? null;
          primaryMod = primaryWall ? null : hitMods[0] ?? null;
        }

        // Set primary selection for handles/props, then populate sets.
        if (primaryWall) setSelectedWall(primaryWall);
        else if (primaryMod) setSelectedModule(primaryMod);
        else {
          setSelectedWall(null);
          setSelectedModule(null);
        }

        selectedWallIds.clear();
        for (const id of nextWalls) selectedWallIds.add(id);
        selectedInstanceIds.clear();
        for (const id of nextMods) selectedInstanceIds.add(id);
        updateSelectionHighlights();
        mountProps();
      }

      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (windowDragState.active) {
      windowDragState.active = false;
      windowDragState.wall = null;
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }
    if (!dragState.active) return;
    dragState.active = false;
    dragState.id = null;
    try {
      renderer.domElement.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  });

  setMode("layout");
  history.current = captureLayoutSnapshot(S);
  history.past = [];
  history.future = [];
  updateUndoRedoUi(S);

  const updateWallEditHud = () => {
    if (mode !== "layout" || viewMode !== "2d" || layoutTool !== "select") {
      hideWallEditHud();
      return;
    }
    if (measureState.enabled) {
      hideWallEditHud();
      return;
    }
    if (wallEditHud.drag) {
      // keep HUD visible during drag
    }

    if (selectedKind !== "wall" || !selectedWallId) {
      hideWallEditHud();
      return;
    }
    const w = walls.find((x) => x.id === selectedWallId) ?? null;
    if (!w) {
      hideWallEditHud();
      return;
    }

    const a = fromMmPoint(w.params.aMm);
    const b = fromMmPoint(w.params.bMm);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const rect = renderer.domElement.getBoundingClientRect();
    const sa = worldToScreen(a, cam(), rect);
    const sb = worldToScreen(b, cam(), rect);
    const sm = worldToScreen(mid, cam(), rect);

    const setLine = (el: HTMLDivElement, p0: { x: number; y: number }, p1: { x: number; y: number }) => {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      el.style.left = `${p0.x}px`;
      el.style.top = `${p0.y}px`;
      el.style.width = `${len}px`;
      el.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      el.style.display = "block";
    };

    wallEditHud.handleA.style.left = `${sa.x}px`;
    wallEditHud.handleA.style.top = `${sa.y}px`;
    wallEditHud.handleA.style.display = "block";

    wallEditHud.handleB.style.left = `${sb.x}px`;
    wallEditHud.handleB.style.top = `${sb.y}px`;
    wallEditHud.handleB.style.display = "block";

    wallEditHud.handleMid.style.left = `${sm.x}px`;
    wallEditHud.handleMid.style.top = `${sm.y}px`;
    wallEditHud.handleMid.style.display = "block";

    const lenMm = Math.round(mmDist(w.params.aMm, w.params.bMm));
    wallEditHud.label.textContent = `${lenMm} mm`;

    // offset dimension line + label a bit perpendicular to wall direction in screen space
    const dir = b.clone().sub(a);
    const n = new THREE.Vector2(-dir.z, dir.x);
    if (n.lengthSq() > 1e-8) n.normalize();

    const off = { x: n.x * 18, y: n.y * 18 };
    const da = { x: sa.x + off.x, y: sa.y + off.y };
    const db = { x: sb.x + off.x, y: sb.y + off.y };
    const dm = { x: sm.x + off.x, y: sm.y + off.y };

    setLine(wallEditHud.lenLine, da, db);
    setLine(wallEditHud.lenExtA, sa, da);
    setLine(wallEditHud.lenExtB, sb, db);

    wallEditHud.label.style.left = `${dm.x}px`;
    wallEditHud.label.style.top = `${dm.y}px`;
    if (wallEditHud.input.style.display !== "block") {
      wallEditHud.label.style.display = "block";
    } else {
      wallEditHud.label.style.display = "none";
    }

    // Auto-dimension to nearest parallel wall (face-to-face)
    wallEditHud.offsetRefWallId = null;
    wallEditHud.offsetLine.style.display = "none";
    wallEditHud.offsetTickA.style.display = "none";
    wallEditHud.offsetTickB.style.display = "none";
    wallEditHud.offsetLabel.style.display = "none";

    const selDir = b.clone().sub(a);
    if (selDir.lengthSq() > 1e-8) {
      selDir.normalize();
      const selN = new THREE.Vector3(-selDir.z, 0, selDir.x).normalize();
      const tA = a.dot(selDir);
      const tB = b.dot(selDir);
      const minSel = Math.min(tA, tB);
      const maxSel = Math.max(tA, tB);

      let best: { w: WallInstance; dist: number; signed: number; overlapMin: number; overlapMax: number } | null = null;
      for (const other of walls) {
        if (other.id === w.id) continue;
        const oa = fromMmPoint(other.params.aMm);
        const ob = fromMmPoint(other.params.bMm);
        const od = ob.clone().sub(oa);
        if (od.lengthSq() < 1e-8) continue;
        od.normalize();
        const parallel = Math.abs(od.dot(selDir)) > 0.985;
        if (!parallel) continue;

        const toA = oa.dot(selDir);
        const toB = ob.dot(selDir);
        const minO = Math.min(toA, toB);
        const maxO = Math.max(toA, toB);
        const overlapMin = Math.max(minSel, minO);
        const overlapMax = Math.min(maxSel, maxO);
        if (overlapMax - overlapMin < 0.08) continue;

        const oMid = oa.clone().add(ob).multiplyScalar(0.5);
        const signed = oMid.clone().sub(mid).dot(selN);
        const dist = Math.abs(signed);
        if (!best || dist < best.dist) best = { w: other, dist, signed, overlapMin, overlapMax };
      }

      if (best) {
        const ref = best.w;
        wallEditHud.offsetRefWallId = ref.id;

        const sign = best.signed >= 0 ? 1 : -1;
        const refA = fromMmPoint(ref.params.aMm);
        const refB = fromMmPoint(ref.params.bMm);
        const tRefA = refA.dot(selDir);
        const tRefB = refB.dot(selDir);
        const overlapT = (best.overlapMin + best.overlapMax) / 2;

        const selDen = tB - tA;
        const refDen = tRefB - tRefA;
        const uSel = Math.abs(selDen) < 1e-8 ? 0.5 : clamp((overlapT - tA) / selDen, 0, 1);
        const uRef = Math.abs(refDen) < 1e-8 ? 0.5 : clamp((overlapT - tRefA) / refDen, 0, 1);

        const pSel = a.clone().lerp(b, uSel);
        const pRef = refA.clone().lerp(refB, uRef);

        const tSel = w.params.thicknessMm / 1000;
        const tRef = ref.params.thicknessMm / 1000;
        const faceOffsetM = (tSel + tRef) / 2;
        const faceDistM = Math.max(0, best.dist - faceOffsetM);
        const faceDistMm = Math.round(faceDistM * 1000);

        const p0 = pSel.clone().addScaledVector(selN, (tSel / 2) * sign);
        const p1 = pRef.clone().addScaledVector(selN, (-tRef / 2) * sign);

        const s0 = worldToScreen(p0, cam(), rect);
        const s1 = worldToScreen(p1, cam(), rect);
        setLine(wallEditHud.offsetLine, s0, s1);

        const ddx = s1.x - s0.x;
        const ddy = s1.y - s0.y;
        const dlen = Math.max(0.001, Math.hypot(ddx, ddy));
        const ux = ddx / dlen;
        const uy = ddy / dlen;
        const vx = -uy;
        const vy = ux;
        const tick = 6;
        setLine(
          wallEditHud.offsetTickA,
          { x: s0.x - vx * tick, y: s0.y - vy * tick },
          { x: s0.x + vx * tick, y: s0.y + vy * tick }
        );
        setLine(
          wallEditHud.offsetTickB,
          { x: s1.x - vx * tick, y: s1.y - vy * tick },
          { x: s1.x + vx * tick, y: s1.y + vy * tick }
        );

        wallEditHud.offsetLabel.textContent = `${faceDistMm} mm`;
        wallEditHud.offsetLabel.style.left = `${(s0.x + s1.x) / 2 + vx * 16}px`;
        wallEditHud.offsetLabel.style.top = `${(s0.y + s1.y) / 2 + vy * 16}px`;
        if (wallEditHud.offsetInput.style.display !== "block") {
          wallEditHud.offsetLabel.style.display = "block";
        } else {
          wallEditHud.offsetLabel.style.display = "none";
        }
      }
    }
  };

  const updateModuleEditHud = () => {
    hideModuleEditHud();
  };

  const refreshAssociativeMeasures = () => {
    if (measureState.measures.length === 0) return;
    const ctx = getAssociativeMeasureContext();
    for (const item of measureState.measures) {
      const resolved = resolveAssociativeMeasureWorld(
        {
          id: item.id,
          kind: item.kind,
          aBinding: item.aBinding,
          bBinding: item.bBinding
        },
        ctx
      );
      if (!resolved) continue;
      const distanceMm =
        item.kind === "normalGuide"
          ? 0
          : Math.abs(resolved.a.y - resolved.b.y) > 1e-6
            ? distance3dMm(resolved.a, resolved.b)
            : planarDistanceMm(resolved.a, resolved.b);
      updateMeasurementGeometry(item, resolved.a, resolved.b, distanceMm);
    }
  };

  type MeasureSelectionTarget =
    | { kind: "wall"; wallId: string }
    | { kind: "module"; instanceId: string }
    | { kind: "floor"; floorId: string }
    | { kind: "kitchenGroup"; groupId: string; instanceIds: Set<string>; worktopIds: Set<string> };

  const getCurrentMeasureSelectionTarget = (): MeasureSelectionTarget | null => {
    if (selectedKind === "wall" && selectedWallId) return { kind: "wall", wallId: selectedWallId };
    if (selectedKind === "module" && selectedInstanceId) return { kind: "module", instanceId: selectedInstanceId };
    if (selectedKind === "floor" && selectedFloorId) return { kind: "floor", floorId: selectedFloorId };
    if (selectedKind === "kitchenGroup" && selectedKitchenGroupId) {
      const instanceIds = new Set(instances.filter((inst) => inst.kitchenGroupId === selectedKitchenGroupId).map((inst) => inst.id));
      const worktopIds = new Set(
        kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === selectedKitchenGroupId).map((worktop) => worktop.id)
      );
      return { kind: "kitchenGroup", groupId: selectedKitchenGroupId, instanceIds, worktopIds };
    }
    return null;
  };

  const translateWallByMeasure = (wallId: string, dxMm: number, dzMm: number) => {
    const wall = walls.find((item) => item.id === wallId) ?? null;
    if (!wall) return false;
    const oldA = { ...wall.params.aMm };
    const oldB = { ...wall.params.bMm };
    wall.params.aMm = { x: wall.params.aMm.x + dxMm, z: wall.params.aMm.z + dzMm };
    wall.params.bMm = { x: wall.params.bMm.x + dxMm, z: wall.params.bMm.z + dzMm };

    for (const otherWall of walls) {
      if (otherWall.id === wall.id) continue;
      const wa = wallEndpointWhich(otherWall, oldA, wallJoinTolMm);
      if (wa) setWallEndpointMm(otherWall, wa, wall.params.aMm);
      const wb = wallEndpointWhich(otherWall, oldB, wallJoinTolMm);
      if (wb) setWallEndpointMm(otherWall, wb, wall.params.bMm);
    }

    rebuildWall(wall);
    autoJoinAtMmPoint(wall.params.aMm);
    autoJoinAtMmPoint(wall.params.bMm);
    rebuildWallPlanMesh();
    return true;
  };

  const translateModuleByMeasure = (instanceId: string, dxMm: number, dzMm: number) => {
    const inst = findInstance(instanceId);
    if (!inst) return false;
    const prevPos = inst.root.position.clone();
    inst.root.position.x += dxMm / 1000;
    inst.root.position.z += dzMm / 1000;
    const valid =
      instanceFitsRoom(inst) &&
      !anyOverlap(inst, null) &&
      !moduleOverlapsWalls(inst) &&
      !moduleOverlapsKitchenWorktops(inst);
    if (!valid) {
      inst.root.position.copy(prevPos);
      return false;
    }
    if (inst.kitchenGroupId) {
      const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
      inst.kitchenPlacement = inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
    }
    return true;
  };

  const translateFloorByMeasure = (floorId: string, dxMm: number, dzMm: number) => {
    const floor = floors.find((item) => item.id === floorId) ?? null;
    if (!floor) return false;
    floor.params.boundary = floor.params.boundary.map((point) => ({ x: point.x + dxMm, z: point.z + dzMm }));
    rebuildFloor(floor);
    updateSelectionHighlights();
    return true;
  };

  const translateKitchenGroupByMeasure = (groupId: string, dxMm: number, dzMm: number) => {
    const groupInstances = instances.filter((inst) => inst.kitchenGroupId === groupId);
    const groupWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === groupId);
    if (groupInstances.length === 0 && groupWorktops.length === 0) return false;

    for (const inst of groupInstances) {
      inst.root.position.x += dxMm / 1000;
      inst.root.position.z += dzMm / 1000;
    }
    for (const worktop of groupWorktops) {
      worktop.params.path = worktop.params.path.map((point) => ({ x: point.x + dxMm, z: point.z + dzMm }));
      rebuildKitchenWorktop(worktop);
    }

    return true;
  };

  const reapplyKitchenGroupPlacementBindings = (groupId: string) => {
    const group = S.kitchenGroups.find((item) => item.id === groupId) ?? null;
    const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = inst.kitchenPlacement ?? inferKitchenPlacementBinding(inst, groupId, backOffsetMm);
      if (binding && applyKitchenPlacementBinding(inst, binding, backOffsetMm)) continue;
      inst.kitchenPlacement = inferKitchenPlacementBinding(inst, groupId, backOffsetMm);
    }
  };

  const alignKitchenWorktopLine = (picked: AlignPickedLine, dxMm: number, dzMm: number) => {
    if (picked.targetKind !== "worktop" || !picked.worktopId || picked.segmentIndex == null) return false;
    const worktop = findKitchenWorktop(picked.worktopId);
    if (!worktop) return false;
    const prevPath = structuredClone(worktop.params.path);
    const groupId = worktop.kitchenGroupId;
    const pointIndex = picked.lineRole === "endB" ? picked.segmentIndex + 1 : picked.segmentIndex;
    worktop.params.path =
      picked.lineRole === "endA" || picked.lineRole === "endB"
        ? shiftPolylinePoint(worktop.params.path, pointIndex, dxMm, dzMm)
        : shiftPolylineSegment(worktop.params.path, picked.segmentIndex, dxMm, dzMm);
    worktop.params.path = sanitizeKitchenWorktopPath(worktop.params.path);
    if (worktop.params.path.length < 2) {
      worktop.params.path = prevPath;
      return false;
    }
    rebuildKitchenWorktop(worktop);
    reapplyKitchenGroupPlacementBindings(groupId);
    updateSelectionHighlights();
    updateLayoutPanel();
    return true;
  };

  function resolveModuleAdjacencySnap(
    moving: LayoutInstance,
    desired: THREE.Vector3,
    opts?: { stickyNeighborId?: string | null; preferredKitchenPlacement?: KitchenPlacementBinding | null }
  ) {
    if (isCornerKitchenModule(moving)) return null;
    const prevGroupId = moving.kitchenGroupId;
    if (!moving.kitchenGroupId && S.kitchenEditMode && S.activeKitchenGroupId) moving.kitchenGroupId = S.activeKitchenGroupId;
    const effectiveGroupId = moving.kitchenGroupId ?? (S.kitchenEditMode ? S.activeKitchenGroupId : null);
    const result = snapPositionDetailed(moving, desired, {
      stickyNeighborId: opts?.stickyNeighborId ?? null,
      snapDistanceM: effectiveGroupId ? 2.4 : undefined,
      enforceWallConstraints: !effectiveGroupId,
      enforceWallOverlap: !effectiveGroupId
    });
    moving.kitchenGroupId = prevGroupId;
    let kitchenPlacement: KitchenPlacementBinding | null = null;
    let snappedPosition = result.position.clone();
    let snappedRotationY = moving.root.rotation.y;
    if (effectiveGroupId) {
      const group = S.kitchenGroups.find((item) => item.id === effectiveGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
      const prevPos = moving.root.position.clone();
      const prevRot = moving.root.rotation.y;
      const prevKitchenPlacement = moving.kitchenPlacement ? structuredClone(moving.kitchenPlacement) : null;
      const projectedBinding = opts?.preferredKitchenPlacement ?? null;
      if (projectedBinding) {
        moving.kitchenPlacement = structuredClone(projectedBinding);
        if (applyKitchenPlacementBinding(moving, projectedBinding, backOffsetMm)) {
          const desiredBackCenter = getModuleLocalBackCenter(moving).clone().applyMatrix4(
            new THREE.Matrix4().makeRotationY(moving.root.rotation.y).setPosition(result.position)
          );
          const worktop = kitchenWorktops.find((item) => item.id === projectedBinding.worktopId) ?? null;
          const segmentInfo =
            worktop && (projectedBinding.kind ?? "segment") !== "corner"
              ? getKitchenGuideSegmentInfo(worktop, projectedBinding.segmentIndex, backOffsetMm)
              : null;
          if (segmentInfo) {
            const halfModuleWidthM = Math.max(0.001, (moving.localBox.max.x - moving.localBox.min.x) * 0.5);
            const projected = desiredBackCenter.clone().sub(segmentInfo.start).dot(segmentInfo.dir);
            const usableLength = segmentInfo.length - halfModuleWidthM * 2;
            const clampedAlong =
              usableLength >= 0
                ? clampNumber(projected, halfModuleWidthM, segmentInfo.length - halfModuleWidthM)
                : segmentInfo.length * 0.5;
            kitchenPlacement = {
              worktopId: projectedBinding.worktopId,
              segmentIndex: projectedBinding.segmentIndex,
              offsetAlongM: clampedAlong
            };
            if (applyKitchenPlacementBinding(moving, kitchenPlacement, backOffsetMm)) {
              snappedPosition = moving.root.position.clone();
              snappedRotationY = moving.root.rotation.y;
            }
          } else {
            kitchenPlacement = moving.kitchenPlacement ? structuredClone(moving.kitchenPlacement) : null;
            snappedPosition = moving.root.position.clone();
            snappedRotationY = moving.root.rotation.y;
          }
        }
      }
      if (!kitchenPlacement) {
        moving.root.position.copy(result.position);
        moving.root.rotation.y = prevRot;
        moving.root.updateMatrixWorld(true);
        kitchenPlacement = inferKitchenPlacementBinding(moving, effectiveGroupId, backOffsetMm);
        if (kitchenPlacement && applyKitchenPlacementBinding(moving, kitchenPlacement, backOffsetMm)) {
          snappedPosition = moving.root.position.clone();
          snappedRotationY = moving.root.rotation.y;
        }
      }
      moving.root.position.copy(prevPos);
      moving.root.rotation.y = prevRot;
      moving.kitchenPlacement = prevKitchenPlacement;
      moving.root.updateMatrixWorld(true);
    }
    return {
      position: snappedPosition,
      rotationY: snappedRotationY,
      link: result.link,
      kitchenPlacement
    };
  }

  function finalizePlacedInstance(inst: LayoutInstance) {
    if (!inst.kitchenGroupId) return;
    const group = S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
    const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
    const binding = inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm) ?? inst.kitchenPlacement;
    if (!binding) return;
    inst.kitchenPlacement = binding;
    applyKitchenPlacementBinding(inst, binding, backOffsetMm);
  }

  function syncPlacedInstancePresentation(inst: LayoutInstance) {
    const isFloorplanView = viewMode === "2d" && activeViewerTab === "floorplan";
    const isDetailOrthoView = viewMode === "2d" && activeViewerTab !== "floorplan";
    ensurePickAndOutline(inst, isFloorplanView);
    inst.module.visible = viewMode !== "2d" || isDetailOrthoView;
    inst.outline.visible = viewMode === "2d" ? isFloorplanView || isDetailOrthoView : true;
    const outlineMaterial = inst.outline.material as THREE.LineBasicMaterial;
    outlineMaterial.opacity = isFloorplanView ? 0.95 : 0.98;
    outlineMaterial.depthTest = viewMode !== "2d";
  }

  const commitSelectedMeasureValueMm = (measureId: string, raw: string, forcedTarget?: MeasureSelectionTarget | null) => {
    const target = forcedTarget ?? getCurrentMeasureSelectionTarget();
    const measure = measureState.measures.find((item) => item.id === measureId && item.kind === "distance") ?? null;
    if (!target || !measure) return;

    const nextMm = Number(String(raw).trim().replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(nextMm)) return;
    const desiredMm = Math.max(0, Math.round(nextMm));
    const bindings = getSelectionMeasureBindings(measure, target);
    if (!bindings) return;

    const ctx = getAssociativeMeasureContext();
    const attachedPoint = resolvePlanBinding(bindings.attachedBinding, ctx);
    const otherPoint = resolvePlanBinding(bindings.otherBinding, ctx);
    if (!attachedPoint || !otherPoint) return;

    const delta = attachedPoint.clone().sub(otherPoint);
    if (delta.lengthSq() < 1e-10) return;
    const currentDistanceMm = Math.round(delta.length() * 1000);
    if (currentDistanceMm === desiredMm) return;
    delta.normalize().multiplyScalar((desiredMm - currentDistanceMm) / 1000);
    const dxMm = Math.round(delta.x * 1000);
    const dzMm = Math.round(delta.z * 1000);
    if (dxMm === 0 && dzMm === 0) return;

    let applied = false;
    switch (target.kind) {
      case "wall":
        applied = translateWallByMeasure(target.wallId, dxMm, dzMm);
        break;
      case "module":
        applied = translateModuleByMeasure(target.instanceId, dxMm, dzMm);
        break;
      case "floor":
        applied = translateFloorByMeasure(target.floorId, dxMm, dzMm);
        break;
      case "kitchenGroup":
        applied = translateKitchenGroupByMeasure(target.groupId, dxMm, dzMm);
        break;
    }

    if (!applied) return;
    refreshAssociativeMeasures();
    updateMeasureLabelInteractivity();
    updateLayoutPanel();
    commitHistory(S);
    mountProps();
  };

  const measureInlineEditor = createMeasureInlineEditor({
    viewerEl: args.viewerEl,
    measureOverlay,
    measureState,
    getCurrentSelectionTarget: getCurrentMeasureSelectionTarget,
    onCommitMeasure: (measureId, raw, target) => commitSelectedMeasureValueMm(measureId, raw, target),
    propsRow: (section, label, inputEl) => {
      props.row(section, label, inputEl);
    }
  });

  const appendLinkedMeasureInputs = (section: HTMLElement, target: MeasureSelectionTarget | null) => {
    measureInlineEditor.appendLinkedMeasureInputs(section, target);
  };

  const updateMeasureLabelInteractivity = () => {
    measureInlineEditor.updateMeasureLabelInteractivity();
  };

  const commitWallMeasureValueMm = (measureId: string, raw: string) => {
    commitSelectedMeasureValueMm(measureId, raw);
  };

  const enforceWallDrawInvariant = () => {
    const wallToolInactive = mode !== "layout" || viewMode !== "2d" || layoutTool !== "wall";
    const wallDrawStale =
      !wallDraw.active ||
      !wallDraw.a ||
      !wallDraw.preview;

    if (wallToolInactive || wallDrawStale) {
      if (
        wallDraw.active ||
        wallDraw.a ||
        wallDraw.chainStart ||
        wallDraw.hoverB ||
        wallDraw.typedMm.trim().length > 0 ||
        wallDraw.preview ||
        drawSnapOverlay.isVisible() ||
        wallTypedHud.style.display !== "none"
      ) {
        clearWallDrawState();
      }
    }
  };

  const enforceKitchenWorktopDrawInvariant = () => {
    const inactive = mode !== "layout" || !S.kitchenEditMode || viewMode !== "2d" || !kitchenWorktopDraw.active;
    if (!inactive) return;
    if (
      kitchenWorktopDraw.points.length > 0 ||
      kitchenWorktopDraw.hoverPoint ||
      kitchenWorktopDraw.previewRoot
    ) {
      cancelKitchenWorktopDraw({ silent: true });
    }
  };

  const enforceSectionDrawInvariant = () => {
    const inactive = mode !== "layout" || viewMode !== "2d" || activeViewerTab !== "floorplan" || layoutTool !== "section";
    if (!inactive) return;
    if (sectionDraw.active || sectionDraw.a || sectionDraw.hoverPoint || sectionDraw.previewRoot) {
      cancelSectionDraw({ silent: true });
    }
  };

  const getDebugModuleSnapshot = (inst: LayoutInstance) => {
    const box = instanceVisualWorldBox(inst);
    const planPolygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
    const structuralMeshes: THREE.Object3D[] = [];
    const partSnapshots: Array<{
      name: string;
      positionM: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
      dimensionsMm: Record<string, unknown> | null;
      colorHex: string | null;
    }> = [];
    inst.module.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name || "";
      if (
        name.startsWith("handle_") ||
        name.startsWith("gola_") ||
        name.startsWith("plinth-clip") ||
        name.includes("_screw_")
      ) {
        return;
      }
      structuralMeshes.push(child);
      const material = Array.isArray(child.material) ? child.material[0] : child.material;
      const colorHex =
        material && "color" in material && (material as { color?: THREE.Color }).color
          ? `#${(material as { color: THREE.Color }).color.getHexString()}`
          : null;
      partSnapshots.push({
        name,
        positionM: {
          x: child.position.x,
          y: child.position.y,
          z: child.position.z
        },
        scale: {
          x: child.scale.x,
          y: child.scale.y,
          z: child.scale.z
        },
        dimensionsMm:
          child.userData?.dimensionsMm && typeof child.userData.dimensionsMm === "object"
            ? structuredClone(child.userData.dimensionsMm as Record<string, unknown>)
            : null,
        colorHex
      });
    });
    const structuralBox = new THREE.Box3();
    for (const mesh of structuralMeshes) structuralBox.expandByObject(mesh);
    const localBackCenter = getModuleLocalBackCenter(inst);
    const worldKitchenAnchor = getModuleWorldKitchenAnchor(inst);
    const localFrontCenter = new THREE.Vector3((inst.localBox.min.x + inst.localBox.max.x) * 0.5, 0, inst.localBox.max.z);
    const worldBackCenter = localBackCenter.clone().applyMatrix4(inst.root.matrixWorld);
    const worldFrontCenter = localFrontCenter.clone().applyMatrix4(inst.root.matrixWorld);
    const worldFrontDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, inst.root.rotation.y, 0)).normalize();
    return {
      id: inst.id,
      kitchenGroupId: inst.kitchenGroupId,
      kitchenPlacement: inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null,
      moduleVisible: inst.module.visible,
      outlineVisible: inst.outline.visible,
      pickVisible: inst.pick.visible,
      params: structuredClone(inst.params),
      positionM: {
        x: inst.root.position.x,
        y: inst.root.position.y,
        z: inst.root.position.z
      },
      rotationYRad: inst.root.rotation.y,
      localBoxM: {
        min: { x: inst.localBox.min.x, y: inst.localBox.min.y, z: inst.localBox.min.z },
        max: { x: inst.localBox.max.x, y: inst.localBox.max.y, z: inst.localBox.max.z }
      },
      worldBoxM: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z }
      },
      structuralWorldBoxM: {
        min: { x: structuralBox.min.x, y: structuralBox.min.y, z: structuralBox.min.z },
        max: { x: structuralBox.max.x, y: structuralBox.max.y, z: structuralBox.max.z }
      },
      worldKitchenAnchorM: {
        x: worldKitchenAnchor.x,
        y: worldKitchenAnchor.y,
        z: worldKitchenAnchor.z
      },
      worldBackCenterM: { x: worldBackCenter.x, y: worldBackCenter.y, z: worldBackCenter.z },
      worldFrontCenterM: { x: worldFrontCenter.x, y: worldFrontCenter.y, z: worldFrontCenter.z },
      frontVectorM: { x: worldFrontDir.x, y: worldFrontDir.y, z: worldFrontDir.z },
      planPolygonM: planPolygon.map((point) => ({ x: point.x, y: point.y, z: point.z })),
      parts: partSnapshots,
      realizedDepthMm: Math.round(worldFrontCenter.clone().sub(worldBackCenter).dot(worldFrontDir) * 1000),
      structuralDepthMm: Math.round(
        Math.abs(
          new THREE.Vector3(
            structuralBox.max.x - structuralBox.min.x,
            structuralBox.max.y - structuralBox.min.y,
            structuralBox.max.z - structuralBox.min.z
          ).dot(new THREE.Vector3(Math.abs(worldFrontDir.x), Math.abs(worldFrontDir.y), Math.abs(worldFrontDir.z)))
        ) * 1000
      )
    };
  };

  const getDebugKitchenSnapshot = (groupId: string | null) => {
    const group = groupId ? S.kitchenGroups.find((item) => item.id === groupId) ?? null : null;
    const groupWorktops = groupId ? kitchenWorktops.filter((item) => item.kitchenGroupId === groupId) : [];
    const groupInstances = groupId ? instances.filter((item) => item.kitchenGroupId === groupId) : [];
    return {
      selectedKitchenGroupId,
      activeKitchenGroupId: S.activeKitchenGroupId,
      kitchenCtx: structuredClone(S.kitchenCtx),
      group: group
        ? {
            id: group.id,
            name: group.name,
            ctx: structuredClone(group.ctx),
            instanceIds: [...group.instanceIds]
          }
        : null,
      worktops: groupWorktops.map((worktop) => ({
        id: worktop.id,
        params: structuredClone(worktop.params),
        guidePathM: getKitchenWorktopBackGuidePath(worktop.params, group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm).map(
          (point) => ({ x: point.x, y: point.y, z: point.z })
        )
      })),
      instances: groupInstances.map((inst) => getDebugModuleSnapshot(inst))
    };
  };

  const debugResetKitchenScenario = () => {
    if (S.kitchenEditMode) kitchenMode?.exitDiscard();
    cancelKitchenWorktopDraw({ silent: true });
    if (placement.active) cancelPlacement(S, placementHelpers);

    for (let index = kitchenWorktops.length - 1; index >= 0; index -= 1) {
      removeKitchenWorktop(kitchenWorktops[index]!.id, { skipHistory: true });
    }
    for (let index = instances.length - 1; index >= 0; index -= 1) {
      deleteInstance(instances[index]!.id);
    }

    S.kitchenGroups.splice(0, S.kitchenGroups.length);
    S.kitchenCtx = resolveContext(makeDefaultKitchenContext());
    setSelectedKitchenGroup(null);
    setSelectedModule(null);
    mountProps();
    updateLayoutPanel();
    return getDebugKitchenSnapshot(null);
  };

  const debugSelectKitchenGroup = (groupId: string | null) => {
    setSelectedKitchenGroup(groupId);
    mountProps();
    return getDebugKitchenSnapshot(groupId);
  };

  const debugAddKitchenModule = (groupId: string, opts?: { type?: ModuleParams["type"]; segmentIndex?: number; offsetAlongMm?: number; cornerIndex?: number }) => {
    const group = S.kitchenGroups.find((item) => item.id === groupId) ?? null;
    const worktop = kitchenWorktops.find((item) => item.kitchenGroupId === groupId) ?? null;
    if (!group || !worktop) throw new Error("Debug kitchen group/worktop not found.");

    const nextParams = structuredClone(getModuleDescriptorOrThrow(opts?.type ?? "drawer_low").defaultParams()) as ModuleParams;
    applyKitchenContextToModuleParams(nextParams, group.ctx);
    const inst = createInstance(nextParams);
    inst.kitchenGroupId = groupId;

    if (nextParams.type === "corner_shelf_lower") {
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, group.ctx.worktopBackOffsetMm);
      let info = null as ReturnType<typeof getKitchenCornerPlacementInfo> | null;
      const requestedCornerIndex = typeof opts?.cornerIndex === "number" ? Math.round(opts.cornerIndex) : null;
      const candidateCornerIndexes =
        requestedCornerIndex != null
          ? [requestedCornerIndex]
          : Array.from({ length: Math.max(0, guidePath.length - 2) }, (_, index) => index + 1);
      for (const cornerIndex of candidateCornerIndexes) {
        info = getKitchenCornerPlacementInfo(worktop, cornerIndex, group.ctx.worktopBackOffsetMm, inst);
        if (info?.valid) break;
      }
      if (!info) throw new Error("Debug kitchen corner not available.");
      inst.kitchenPlacement = { ...info.binding };
      applyKitchenPlacementBinding(inst, inst.kitchenPlacement, group.ctx.worktopBackOffsetMm);
    } else {
      const info = getKitchenGuideSegmentInfo(worktop, opts?.segmentIndex ?? 0, group.ctx.worktopBackOffsetMm);
      if (!info) throw new Error("Debug guide segment not available.");

      if (moduleStaysOutsideKitchenWorktop(inst)) {
        const desiredAlongM = clampNumber((opts?.offsetAlongMm ?? 700) / 1000, 0, info.length);
        const cursorWorld = info.start
          .clone()
          .addScaledVector(info.dir, desiredAlongM)
          .addScaledVector(info.frontNormal, Math.max(0.05, worktop.params.depthMm / 2000));
        const tallConstraint = getTallKitchenPlacementConstraint(inst, cursorWorld, [worktop], group.ctx.worktopBackOffsetMm);
        if (!tallConstraint) throw new Error("Debug tall placement not available.");
        inst.kitchenPlacement = tallConstraint.kitchenPlacement ?? null;
        inst.root.position.copy(tallConstraint.position);
        inst.root.rotation.y = tallConstraint.rotationY;
        inst.root.position.y = getKitchenModulePlacementY(inst, groupId);
        inst.root.updateMatrixWorld(true);
      } else {
      const desiredAlongM = (opts?.offsetAlongMm ?? 700) / 1000;
      inst.kitchenPlacement = {
        kind: "segment",
        worktopId: worktop.id,
        segmentIndex: opts?.segmentIndex ?? 0,
        offsetAlongM: desiredAlongM
      };
      applyKitchenPlacementBinding(inst, inst.kitchenPlacement, group.ctx.worktopBackOffsetMm);
      }
    }

    layoutRoot.add(inst.root);
    instances.push(inst);
    group.instanceIds = instances.filter((item) => item.kitchenGroupId === groupId).map((item) => item.id);
    updateLayoutPanel();
    return getDebugKitchenSnapshot(groupId);
  };

  const debugCreateKitchenScenario = (opts?: {
    ctxPatch?: Partial<ReturnType<typeof resolveContext>>;
    path?: FloorBoundaryPoint[];
    justification?: KitchenWorktopJustification;
    mirrored?: boolean;
    addModule?: boolean;
    moduleType?: ModuleParams["type"];
    segmentIndex?: number;
    offsetAlongMm?: number;
    cornerIndex?: number;
  }) => {
    debugResetKitchenScenario();
    ensureLayoutMode();

    const nextCtx = resolveContext({
      ...makeDefaultKitchenContext(),
      ...(opts?.ctxPatch ?? {})
    });
    const groupId = `dbg_kg_${Date.now()}`;
    S.kitchenCtx = structuredClone(nextCtx);
    S.kitchenGroups.push({
      id: groupId,
      name: "Debug Kitchen",
      ctx: structuredClone(nextCtx),
      instanceIds: []
    });

    createKitchenWorktop(
      {
        path: structuredClone(opts?.path ?? [{ x: 0, z: 0 }, { x: 2400, z: 0 }]),
        justification: opts?.justification ?? "back",
        mirrored: !!opts?.mirrored,
        depthMm: nextCtx.worktopDepthMm,
        thicknessMm: nextCtx.worktopThicknessMm,
        heightMm: nextCtx.heightMm,
        overhangSideMm: nextCtx.worktopOverhangSideMm,
        materialId: nextCtx.worktopMaterialId
      },
      groupId,
      { skipHistory: true, id: "dbg_wt1" }
    );

    if (opts?.addModule !== false) {
      debugAddKitchenModule(groupId, {
        type: opts?.moduleType ?? "drawer_low",
        segmentIndex: opts?.segmentIndex ?? 0,
        offsetAlongMm: opts?.offsetAlongMm ?? 700,
        cornerIndex: opts?.cornerIndex
      });
    }

    debugSelectKitchenGroup(groupId);
    return getDebugKitchenSnapshot(groupId);
  };

  const debugPatchKitchenContext = (groupId: string, patch: Partial<ReturnType<typeof resolveContext>>) => {
    const group = S.kitchenGroups.find((item) => item.id === groupId) ?? null;
    if (!group) throw new Error(`Kitchen group ${groupId} not found.`);
    const prevCtx = resolveContext(structuredClone(group.ctx));
    const nextCtx = resolveContext({ ...group.ctx, ...patch });
    group.ctx = structuredClone(nextCtx);
    if (S.activeKitchenGroupId === groupId || selectedKitchenGroupId === groupId) {
      S.kitchenCtx = structuredClone(nextCtx);
    }
    rebuildKitchenGroupLayout(groupId, nextCtx, prevCtx);
    mountProps();
    return getDebugKitchenSnapshot(groupId);
  };

  const debugEnterMeasureTool = () => {
    setToolMeasure();
    return {
      layoutTool,
      enabled: measureState.enabled
    };
  };

  const debugCreateWall = (params: { aMm: { x: number; z: number }; bMm: { x: number; z: number }; thicknessMm?: number }) => {
    const wall = addWall(
      new THREE.Vector3(params.aMm.x / 1000, 0, params.aMm.z / 1000),
      new THREE.Vector3(params.bMm.x / 1000, 0, params.bMm.z / 1000),
      params.thicknessMm ?? wallDefault.thicknessMm
    );
    return wall ? { id: wall.id, aMm: { ...wall.params.aMm }, bMm: { ...wall.params.bMm } } : null;
  };

  const debugMoveWall = (wallId: string, shiftMm: { x: number; z: number }) => {
    const wall = walls.find((item) => item.id === wallId) ?? null;
    if (!wall) throw new Error(`Wall ${wallId} not found.`);
    const oldA = { ...wall.params.aMm };
    const oldB = { ...wall.params.bMm };
    wall.params.aMm = { x: wall.params.aMm.x + shiftMm.x, z: wall.params.aMm.z + shiftMm.z };
    wall.params.bMm = { x: wall.params.bMm.x + shiftMm.x, z: wall.params.bMm.z + shiftMm.z };
    for (const otherWall of walls) {
      if (otherWall.id === wall.id) continue;
      const wa = wallEndpointWhich(otherWall, oldA, wallJoinTolMm);
      if (wa) setWallEndpointMm(otherWall, wa, wall.params.aMm);
      const wb = wallEndpointWhich(otherWall, oldB, wallJoinTolMm);
      if (wb) setWallEndpointMm(otherWall, wb, wall.params.bMm);
    }
    rebuildWall(wall);
    autoJoinAtMmPoint(wall.params.aMm);
    autoJoinAtMmPoint(wall.params.bMm);
    rebuildWallPlanMesh();
    return { id: wall.id, aMm: { ...wall.params.aMm }, bMm: { ...wall.params.bMm } };
  };

  const debugCreateMeasure = (params: {
    aMm: { x: number; z: number };
    bMm: { x: number; z: number };
    normal?: boolean;
  }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const aRaw = new THREE.Vector3(params.aMm.x / 1000, 0, params.aMm.z / 1000);
    const bRaw = new THREE.Vector3(params.bMm.x / 1000, 0, params.bMm.z / 1000);
    const snappedA = snapPoint2D(aRaw, rect, cam(), 24);
    const snappedB = snapPoint2D(bRaw, rect, cam(), 24, {
      perpendicularFrom: params.normal ? null : snappedA.point
    });
    const a = snappedA.kind === "none" ? aRaw : snappedA.point;
    const b = snappedB.kind === "none" ? bRaw : snappedB.point;
    const aBinding = bindingFromPlanSnap(snappedA, a);
    const bBinding = bindingFromPlanSnap(snappedB, b);

    if (params.normal) {
      const baseDir = b.clone().sub(a).setY(0);
      if (baseDir.lengthSq() < 1e-10) throw new Error("Normal guide requires 2 distinct points.");
      baseDir.normalize();
      const normalDir = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
      const spanM = Math.max(4, Math.min(30, a.distanceTo(b) * 6));
      return addMeasurement(
        a.clone().addScaledVector(normalDir, -spanM / 2),
        a.clone().addScaledVector(normalDir, spanM / 2),
        aBinding,
        bBinding,
        { kind: "normalGuide" }
      );
    }

    return addMeasurement(a, b, aBinding, bBinding, {
      kind: "distance",
      distanceMm: planarDistanceMm(a, b)
    });
  };

  const debugCreateFloor = (params: FloorParams) => {
    const floor = createFloor(cloneFloorParams(params), { skipHistory: true });
    return { id: floor.id, boundary: structuredClone(floor.params.boundary) };
  };

  const debugSelectFloor = (floorId: string) => {
    setSelectedFloor(floorId);
    return { selectedKind, selectedFloorId };
  };

  const debugSelectWall = (wallId: string) => {
    setSelectedWall(wallId);
    return { selectedKind, selectedWallId };
  };

  const debugSelectModule = (instanceId: string) => {
    setSelectedModule(instanceId);
    return { selectedKind, selectedInstanceId };
  };

  const debugPatchModuleParams = (
    instanceId: string,
    patch: Record<string, unknown>,
    options?: { sourceKey?: string; preserveBackAnchor?: boolean }
  ) => {
    const inst = findInstance(instanceId);
    if (!inst) throw new Error(`Instance ${instanceId} not found.`);
    const previousParams = structuredClone(inst.params);
      inst.params = normalizeModuleParamsForSource(
        {
          ...structuredClone(inst.params),
          ...structuredClone(patch)
        } as ModuleParams,
        options?.sourceKey
      );
    const ok = rebuildInstance(inst, {
        preserveBackAnchor: options?.preserveBackAnchor ?? true,
        previousParams,
        sourceKey: options?.sourceKey
      });
    return {
      ok,
      debug: lastRebuildDebug ? structuredClone(lastRebuildDebug) : null,
      snapshot: getDebugKitchenSnapshot(inst.kitchenGroupId),
      instance: getDebugModuleSnapshot(inst)
    };
  };

  const debugDetectModuleAdjacency = (instanceId: string) => {
    const inst = findInstance(instanceId);
    if (!inst) throw new Error(`Instance ${instanceId} not found.`);
    const box = instanceWorldBox(inst);
    return instances
      .filter((other) => other.id !== inst.id && (!inst.kitchenGroupId || other.kitchenGroupId === inst.kitchenGroupId))
      .map((other) => {
        const info = detectModuleAdjacencyInfo(box, instanceWorldBox(other), other.id);
        if (!info) return null;
        return {
          otherId: other.id,
          otherType: other.params.type,
          side: info.side,
          axis: info.axis,
          gapMm: Math.round(info.gap * 1000),
          seamMm: Math.round(info.seam * 1000)
        };
      })
      .filter((value): value is NonNullable<typeof value> => !!value);
  };

  const debugCommitSelectedMeasureValue = (measureId: string, valueMm: number) => {
    const target = getCurrentMeasureSelectionTarget();
    const measure = measureState.measures.find((item) => item.id === measureId) ?? null;
    const bindings = target && measure ? getSelectionMeasureBindings(measure, target) : null;
    const before = captureLayoutSnapshot(S);
    commitSelectedMeasureValueMm(measureId, String(valueMm));
    const after = captureLayoutSnapshot(S);
    return {
      selectedKind,
      selectedKitchenGroupId,
      target:
        target?.kind === "kitchenGroup"
          ? { kind: target.kind, groupId: target.groupId, worktopIds: Array.from(target.worktopIds), instanceIds: Array.from(target.instanceIds) }
          : target,
      bindings,
      before,
      after
    };
  };

  const debugCommitWallMeasureValue = (wallId: string, measureId: string, valueMm: number) => {
    setSelectedWall(wallId);
    commitWallMeasureValueMm(measureId, String(valueMm));
    return getDebugKitchenSnapshot(null);
  };

  const debugProjectPlanPoint = (pointMm: { x: number; z: number }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const screen = worldToScreen(new THREE.Vector3(pointMm.x / 1000, 0, pointMm.z / 1000), cam(), rect);
    return { x: screen.x, y: screen.y };
  };

  const debugPickAlignLine = (pointMm: { x: number; z: number }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const world = new THREE.Vector3(pointMm.x / 1000, 0, pointMm.z / 1000);
    const screen = worldToScreen(world, cam(), rect);
    const picked = pickAlignLineAt(world, { x: screen.x, y: screen.y }, rect);
    if (!picked) return null;
    return {
      label: picked.label,
      targetKind: picked.targetKind,
      lineRole: picked.lineRole,
      wallId: picked.wallId ?? null,
      instanceId: picked.instanceId ?? null,
      worktopId: picked.worktopId ?? null,
      segmentIndex: picked.segmentIndex ?? null
    };
  };

  const debugAlignLines = (refMm: { x: number; z: number }, targetMm: { x: number; z: number }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const refWorld = new THREE.Vector3(refMm.x / 1000, 0, refMm.z / 1000);
    const targetWorld = new THREE.Vector3(targetMm.x / 1000, 0, targetMm.z / 1000);
    const refScreen = worldToScreen(refWorld, cam(), rect);
    const targetScreen = worldToScreen(targetWorld, cam(), rect);
    const ref = pickAlignLineAt(refWorld, { x: refScreen.x, y: refScreen.y }, rect);
    const picked = pickAlignLineAt(targetWorld, { x: targetScreen.x, y: targetScreen.y }, rect);
    if (!ref || !picked) {
      return {
        ok: false,
        ref: ref ? { label: ref.label, targetKind: ref.targetKind, lineRole: ref.lineRole } : null,
        picked: picked ? { label: picked.label, targetKind: picked.targetKind, lineRole: picked.lineRole } : null
      };
    }
    const result = applyAlignBetweenPickedLines(ref, picked);
    if (result.ok) {
      updateSelectionHighlights();
      commitHistory(S);
      mountProps();
    }
    return {
      ok: result.ok,
      reason: result.reason,
      ref: { label: ref.label, targetKind: ref.targetKind, lineRole: ref.lineRole },
      picked: {
        label: picked.label,
        targetKind: picked.targetKind,
        lineRole: picked.lineRole,
        wallId: picked.wallId ?? null,
        instanceId: picked.instanceId ?? null,
        worktopId: picked.worktopId ?? null,
        segmentIndex: picked.segmentIndex ?? null
      }
    };
  };

  const debugPlanSnap = (
    pointMm: { x: number; z: number },
    options?: { perpendicularFromMm?: { x: number; z: number } | null }
  ) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const snapped = snapPoint2D(new THREE.Vector3(pointMm.x / 1000, 0, pointMm.z / 1000), rect, cam(), 24, {
      perpendicularFrom: options?.perpendicularFromMm
        ? new THREE.Vector3(options.perpendicularFromMm.x / 1000, 0, options.perpendicularFromMm.z / 1000)
        : null
    });
    return {
      kind: snapped.kind,
      owner: snapped.owner ?? null,
      pointMm: {
        x: Math.round(snapped.point.x * 1000),
        z: Math.round(snapped.point.z * 1000)
      }
    };
  };

  const debugMeasureState = () => ({
    layoutTool,
    enabled: measureState.enabled,
    firstPointMm: measureState.firstPoint
      ? { x: Math.round(measureState.firstPoint.x * 1000), z: Math.round(measureState.firstPoint.z * 1000) }
      : null,
    measures: measureState.measures.map((item) => ({
      id: item.id,
      kind: item.kind,
      aBinding: item.aBinding,
      bBinding: item.bBinding,
      aMm: { x: Math.round(item.a.x * 1000), z: Math.round(item.a.z * 1000) },
      bMm: { x: Math.round(item.b.x * 1000), z: Math.round(item.b.z * 1000) }
    }))
  });

  const debugViewState = () => {
    const activeCam = cam();
    const sceneDebug = getSceneDebugState();
    return {
      viewMode,
      activeViewerTab,
      layoutTool,
      wallCount: walls.length,
      wallPlanVisible: wallPlanGroup.visible,
      wallPlanChildren: wallPlanGroup.children.length,
      clippingPlanes: renderer.clippingPlanes.length,
      detailSliceVisible: detailSliceGroup.visible,
      detailSliceChildren: detailSliceGroup.children.length,
      camera: {
        type: activeCam.type,
        position: { x: activeCam.position.x, y: activeCam.position.y, z: activeCam.position.z },
        target: { x: ctl().target.x, y: ctl().target.y, z: ctl().target.z },
        zoom: activeCam instanceof THREE.OrthographicCamera ? activeCam.zoom : null,
        left: activeCam instanceof THREE.OrthographicCamera ? activeCam.left : null,
        right: activeCam instanceof THREE.OrthographicCamera ? activeCam.right : null,
        top: activeCam instanceof THREE.OrthographicCamera ? activeCam.top : null,
        bottom: activeCam instanceof THREE.OrthographicCamera ? activeCam.bottom : null
      },
      scene: {
        planOverlayVisible: sceneDebug.planOverlayVisible,
        planAmbientVisible: sceneDebug.planAmbientVisible
      },
      walls: walls.map((wall) => ({
        id: wall.id,
        meshVisible: wall.mesh.visible,
        outlineVisible: wall.outline.visible,
        aMm: { ...wall.params.aMm },
        bMm: { ...wall.params.bMm }
      }))
    };
  };

  const debugLayoutSnapshot = () => captureLayoutSnapshot(S);

  (window as any).__kitchenDebug = {
    reset: debugResetKitchenScenario,
    selectKitchenGroup: debugSelectKitchenGroup,
    createKitchenScenario: debugCreateKitchenScenario,
    addKitchenModule: debugAddKitchenModule,
    patchKitchenContext: debugPatchKitchenContext,
    createWall: debugCreateWall,
    createFloor: debugCreateFloor,
    moveWall: debugMoveWall,
    createMeasure: debugCreateMeasure,
    selectWall: debugSelectWall,
    selectFloor: debugSelectFloor,
    selectModule: debugSelectModule,
    patchModuleParams: debugPatchModuleParams,
    detectModuleAdjacency: debugDetectModuleAdjacency,
    commitWallMeasureValue: debugCommitWallMeasureValue,
    commitSelectedMeasureValue: debugCommitSelectedMeasureValue,
    snapshot: getDebugKitchenSnapshot,
    enterMeasureTool: debugEnterMeasureTool,
    projectPlanPoint: debugProjectPlanPoint,
    pickAlignLine: debugPickAlignLine,
    alignLines: debugAlignLines,
    planSnap: debugPlanSnap,
    measureState: debugMeasureState,
    viewState: debugViewState,
    layoutSnapshot: debugLayoutSnapshot
  };

  const tick = () => {
    const dt = Math.min(0.05, navClock.getDelta());
    viewNavigation.update(dt);
    ctl().update();
    enforceWallDrawInvariant();
    enforceKitchenWorktopDrawInvariant();
    enforceSectionDrawInvariant();
    if (selectedBox && selectedMesh) selectedBox.setFromObject(selectedMesh);
    if (selectedInstanceBox && selectedInstanceId) {
      const inst = findInstance(selectedInstanceId);
      if (inst) selectedInstanceBox.setFromObject(inst.root);
    }
    if (grainArrow && selectedMesh) {
      const grain = computeGrainArrow(selectedMesh);
      if (grain) {
        grainArrow.position.copy(grain.origin);
        grainArrow.setDirection(grain.dir);
        grainArrow.setLength(grain.length, grain.length * 0.22, grain.length * 0.12);
      }
    }
    for (const o of overlapBoxes) o.helper.setFromObject(o.mesh);
    refreshAssociativeMeasures();
    updateMeasureLabels();
    updateMeasureLabelInteractivity();
    updateModuleAdjacencyVisuals();
    updateWallEditHud();
    updateModuleEditHud();
    updateDetailViewCamera();

    const activeCam = cam();
    const isPhoto = renderMode === "photo_pathtrace" && ENABLE_PHOTO && activeCam instanceof THREE.PerspectiveCamera;
    const isSsgi = renderMode === "realtime_ssgi" && ENABLE_SSGI && activeCam instanceof THREE.PerspectiveCamera;

    if (isPhoto) {
      ssgi?.dispose();
      ssgi = null;
      ssgiCameraUuid = null;

      if (!photo || photoCameraUuid !== activeCam.uuid) {
        photo?.dispose();
        photo = createPhotoPathTracer({ renderer, scene, camera: activeCam });
        photoCameraUuid = activeCam.uuid;
        photoLastLightingRevision = getLightingRevision();
        photo.setSize(args.viewerEl.clientWidth, args.viewerEl.clientHeight);
        photo.setMaxSamples(Number(photoSamples.value));
        copyM16(lastCameraWorld, activeCam.matrixWorld);
        copyM16(lastCameraProj, activeCam.projectionMatrix);
      }

      const lightingRev = getLightingRevision();
      if (lightingRev !== photoLastLightingRevision) {
        photo.updateFromScene();
        photoLastLightingRevision = lightingRev;
      }

      if (matrixChanged(lastCameraWorld, activeCam.matrixWorld) || matrixChanged(lastCameraProj, activeCam.projectionMatrix)) {
        photo.updateCamera();
        copyM16(lastCameraWorld, activeCam.matrixWorld);
        copyM16(lastCameraProj, activeCam.projectionMatrix);
      }

      photo.setMaxSamples(Number(photoSamples.value));
      photo.renderSample();
      photoStatus.textContent = `Samples: ${photo.getSamples()} / ${photo.getMaxSamples()}`;
    } else if (isSsgi) {
      photo?.dispose();
      photo = null;
      photoCameraUuid = null;
      photoLastLightingRevision = -1;
      photoStatus.textContent = "";

      if (!ssgi || ssgiCameraUuid !== activeCam.uuid) {
        ssgi?.dispose();
        ssgi = createSsgiPipeline({ renderer, scene, camera: activeCam });
        ssgiCameraUuid = activeCam.uuid;
        ssgi.setSize(args.viewerEl.clientWidth, args.viewerEl.clientHeight);
      }
      ssgi.render(dt);
    } else {
      if (ssgi) {
        ssgi.dispose();
        ssgi = null;
        ssgiCameraUuid = null;
      }
      if (photo) {
        photo.dispose();
        photo = null;
        photoCameraUuid = null;
        photoLastLightingRevision = -1;
        photoStatus.textContent = "";
      }
      renderer.render(scene, activeCam);
    }
    technicalDimensions.render();
    requestAnimationFrame(tick);
  };
  tick();

}
