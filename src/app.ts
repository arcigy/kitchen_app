import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import {
  axisLockXZ,
  clamp,
  computeGrainArrow,
  computeOverlaps,
  findSelectableMeshByName,
  formatMm,
  getSelectableMeshes,
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
import { distPointToSegment2, distPxPointToSeg } from "./app/screenGeometry";
import { mountAlignToolPropsPanel, mountKitchenWorktopToolPropsPanel, mountMeasureToolPropsPanel, mountTrimToolPropsPanel, mountWallToolPropsPanel } from "./app/toolPropsPanels";
import { mountFloorBoundaryPropsPanel, mountFloorPropsPanel, mountSectionPropsPanel, mountSectionToolPropsPanel, mountModulePropsPanel, mountUnderlayPropsPanel, mountWallPropsPanel, mountWindowPropsPanel } from "./app/selectedPropsPanels";
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
  cloneSectionParams,
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
import type { SsgiPipeline } from "./rendering/ssgiPipeline";
import type { PhotoPathTracer } from "./rendering/photoPathTracer";
import { createTopbar } from "./ui/createTopbar";
import { openBomPanel, openPricingCatalog } from "./app/projectPanels";
import {
  cloneFloorParams as cloneFloorParamsBase,
  floorMaterialColor,
  makeFloorGeometry,
  makeFloorOutlineGeometry
} from "./app/floorGeometry";
import {
  cloneFloorSegments,
  floorBoundaryToSegments,
  floorOrthoPoint as computeFloorOrthoPoint,
  floorPointDistMm,
  floorPointEq,
  floorPointToWorld,
  floorSegmentsToBoundary,
  makeFloorCirclePoints,
  moveFloorEditSegment as moveFloorEditSegmentBase,
  moveFloorEditVertex as moveFloorEditVertexBase,
  worldToFloorPoint
} from "./app/floorBoundaryEdit";
import {
  clearFloorBoundaryGroup as clearFloorBoundaryGroupBase,
  pickFloorEditElement as pickFloorEditElementBase,
  renderFloorBoundaryEdit as renderFloorBoundaryEditBase
} from "./app/floorBoundaryVisuals";
import {
  fromMmPoint,
  joinExtensionM as computeJoinExtensionM,
  mmDist,
  pointOnWallAxisMm,
  snapAxisXZ,
  toMmPoint,
  wallDirOutFromNode as wallDirOutFromNodeBase,
  wallEndpointWhich,
  wallExteriorSign
} from "./app/wallGeometryHelpers";
import {
  cloneKitchenWorktopParams,
  kitchenWorktopOutlineColor,
  makeKitchenWorktopBackGuideGeometry,
  makeKitchenWorktopGeometry,
  makeKitchenWorktopMaterial,
  makeKitchenWorktopOutlineGeometry,
  makeKitchenWorktopPreviewGeometry
} from "./app/kitchenWorktopVisuals";
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
import { createLayoutExportPayload } from "./app/layoutExport";
import { createRenderControls, type RenderMode } from "./app/renderControls";
import { renderAppFrame } from "./app/frameRenderer";
import { createModulePlacementHelpers } from "./app/modulePlacementHelpers";
import {
  ensurePickAndOutline as ensurePickAndOutlineBase,
  footprintExtentsMatchXZ,
  getInstanceGeometryMeshes as getInstanceGeometryMeshesBase,
  instanceLayoutWorldBox as instanceLayoutWorldBoxBase,
  instanceVisualWorldBox,
  moduleRootLocalBox,
  tagModuleGeometry
} from "./app/moduleVisualGeometry";
import { getInstallState, promptAppInstall, subscribeInstallState } from "./pwa/installController";
import { installKitchenDebugApi } from "./app/kitchenDebugApi";
import { createWallController } from "./app/wallController";
import { createWorktopController } from "./app/worktopController";
import { createKitchenPlacementController } from "./app/kitchenPlacementController";
import { installPointerInputHandlers } from "./app/pointerInputHandlers";

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

  let wallController!: ReturnType<typeof createWallController>;
  const pickAlignLineAt = (...args: Parameters<ReturnType<typeof createWallController>["pickAlignLineAt"]>) => wallController.pickAlignLineAt(...args);
  const lineLineIntersectionXZ = (...args: Parameters<ReturnType<typeof createWallController>["lineLineIntersectionXZ"]>) => wallController.lineLineIntersectionXZ(...args);
  const translateWallAndConnected = (...args: Parameters<ReturnType<typeof createWallController>["translateWallAndConnected"]>) => wallController.translateWallAndConnected(...args);
  const moveWallEndpointAndConnected = (...args: Parameters<ReturnType<typeof createWallController>["moveWallEndpointAndConnected"]>) => wallController.moveWallEndpointAndConnected(...args);
  const setWallEndpointMm = (...args: Parameters<ReturnType<typeof createWallController>["setWallEndpointMm"]>) => wallController.setWallEndpointMm(...args);
  const wallDirOutFromNode = (...args: Parameters<ReturnType<typeof createWallController>["wallDirOutFromNode"]>) => wallController.wallDirOutFromNode(...args);
  const joinExtensionM = (...args: Parameters<ReturnType<typeof createWallController>["joinExtensionM"]>) => wallController.joinExtensionM(...args);
  const removeWall = (...args: Parameters<ReturnType<typeof createWallController>["removeWall"]>) => wallController.removeWall(...args);
  const splitWallAtMm = (...args: Parameters<ReturnType<typeof createWallController>["splitWallAtMm"]>) => wallController.splitWallAtMm(...args);
  const autoJoinAtMmPoint = (...args: Parameters<ReturnType<typeof createWallController>["autoJoinAtMmPoint"]>) => wallController.autoJoinAtMmPoint(...args);
  const pickWallLine2D = (...args: Parameters<ReturnType<typeof createWallController>["pickWallLine2D"]>) => wallController.pickWallLine2D(...args);
  const cross2XZ = (...args: Parameters<ReturnType<typeof createWallController>["cross2XZ"]>) => wallController.cross2XZ(...args);
  const intersectLinesXZ = (...args: Parameters<ReturnType<typeof createWallController>["intersectLinesXZ"]>) => wallController.intersectLinesXZ(...args);
  const bestNeighborAtNode = (...args: Parameters<ReturnType<typeof createWallController>["bestNeighborAtNode"]>) => wallController.bestNeighborAtNode(...args);
  const miterEndCorners = (...args: Parameters<ReturnType<typeof createWallController>["miterEndCorners"]>) => wallController.miterEndCorners(...args);
  const updateWallMesh = (...args: Parameters<ReturnType<typeof createWallController>["updateWallMesh"]>) => wallController.updateWallMesh(...args);
  const rebuildWallPlanMesh = (...args: Parameters<ReturnType<typeof createWallController>["rebuildWallPlanMesh"]>) => wallController.rebuildWallPlanMesh(...args);
  const createWallMesh = (...args: Parameters<ReturnType<typeof createWallController>["createWallMesh"]>) => wallController.createWallMesh(...args);
  const createWallOutline = (...args: Parameters<ReturnType<typeof createWallController>["createWallOutline"]>) => wallController.createWallOutline(...args);
  const syncWallOutline = (...args: Parameters<ReturnType<typeof createWallController>["syncWallOutline"]>) => wallController.syncWallOutline(...args);
  const wallRefLineToCenterLine = (...args: Parameters<ReturnType<typeof createWallController>["wallRefLineToCenterLine"]>) => wallController.wallRefLineToCenterLine(...args);
  const updateWallMeshWithJustification = (...args: Parameters<ReturnType<typeof createWallController>["updateWallMeshWithJustification"]>) => wallController.updateWallMeshWithJustification(...args);
  const makeWallPreviewMesh = (...args: Parameters<ReturnType<typeof createWallController>["makeWallPreviewMesh"]>) => wallController.makeWallPreviewMesh(...args);
  const rebuildWall = (...args: Parameters<ReturnType<typeof createWallController>["rebuildWall"]>) => wallController.rebuildWall(...args);
  const addWall = (...args: Parameters<ReturnType<typeof createWallController>["addWall"]>) => wallController.addWall(...args);



  const cloneFloorParams = (params: FloorParams): FloorParams => cloneFloorParamsBase(params, floorDefault.materialId);

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



  let worktopController!: ReturnType<typeof createWorktopController>;
  const makeCurrentKitchenWorktopBackGuideGeometry = (...args: Parameters<ReturnType<typeof createWorktopController>["makeCurrentKitchenWorktopBackGuideGeometry"]>) => worktopController.makeCurrentKitchenWorktopBackGuideGeometry(...args);
  const rebuildKitchenWorktop = (...args: Parameters<ReturnType<typeof createWorktopController>["rebuildKitchenWorktop"]>) => worktopController.rebuildKitchenWorktop(...args);
  const createKitchenWorktop = (...args: Parameters<ReturnType<typeof createWorktopController>["createKitchenWorktop"]>) => worktopController.createKitchenWorktop(...args);
  const removeKitchenWorktop = (...args: Parameters<ReturnType<typeof createWorktopController>["removeKitchenWorktop"]>) => worktopController.removeKitchenWorktop(...args);
  const restoreKitchenWorktopsFromSnapshot = (...args: Parameters<ReturnType<typeof createWorktopController>["restoreKitchenWorktopsFromSnapshot"]>) => worktopController.restoreKitchenWorktopsFromSnapshot(...args);
  const makeKitchenWorktopParamsFromPath = (...args: Parameters<ReturnType<typeof createWorktopController>["makeKitchenWorktopParamsFromPath"]>) => worktopController.makeKitchenWorktopParamsFromPath(...args);
  const updateKitchenWorktopPreview = (...args: Parameters<ReturnType<typeof createWorktopController>["updateKitchenWorktopPreview"]>) => worktopController.updateKitchenWorktopPreview(...args);
  const scheduleKitchenWorktopPreviewUpdate = (...args: Parameters<ReturnType<typeof createWorktopController>["scheduleKitchenWorktopPreviewUpdate"]>) => worktopController.scheduleKitchenWorktopPreviewUpdate(...args);
  const cancelKitchenWorktopDraw = (...args: Parameters<ReturnType<typeof createWorktopController>["cancelKitchenWorktopDraw"]>) => worktopController.cancelKitchenWorktopDraw(...args);
  const getKitchenGroupWorktops = (...args: Parameters<ReturnType<typeof createWorktopController>["getKitchenGroupWorktops"]>) => worktopController.getKitchenGroupWorktops(...args);
  const replaceKitchenGroupWorktops = (...args: Parameters<ReturnType<typeof createWorktopController>["replaceKitchenGroupWorktops"]>) => worktopController.replaceKitchenGroupWorktops(...args);
  const rebuildKitchenGroupWorktops = (...args: Parameters<ReturnType<typeof createWorktopController>["rebuildKitchenGroupWorktops"]>) => worktopController.rebuildKitchenGroupWorktops(...args);

  let kitchenPlacementController!: ReturnType<typeof createKitchenPlacementController>;
  const clampNumber = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["clampNumber"]>) => kitchenPlacementController.clampNumber(...args);
  const normalizeAngleRad = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["normalizeAngleRad"]>) => kitchenPlacementController.normalizeAngleRad(...args);
  const getModuleLocalBackCenter = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getModuleLocalBackCenter"]>) => kitchenPlacementController.getModuleLocalBackCenter(...args);
  const isCornerKitchenModule = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["isCornerKitchenModule"]>) => kitchenPlacementController.isCornerKitchenModule(...args);
  const moduleStaysOutsideKitchenWorktop = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["moduleStaysOutsideKitchenWorktop"]>) => kitchenPlacementController.moduleStaysOutsideKitchenWorktop(...args);
  const getKitchenModulePlacementY = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getKitchenModulePlacementY"]>) => kitchenPlacementController.getKitchenModulePlacementY(...args);
  const getModuleLocalKitchenCornerAnchor = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getModuleLocalKitchenCornerAnchor"]>) => kitchenPlacementController.getModuleLocalKitchenCornerAnchor(...args);
  const getModuleLocalKitchenCornerAxisAnchor = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getModuleLocalKitchenCornerAxisAnchor"]>) => kitchenPlacementController.getModuleLocalKitchenCornerAxisAnchor(...args);
  const getModuleKitchenCornerExtents = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getModuleKitchenCornerExtents"]>) => kitchenPlacementController.getModuleKitchenCornerExtents(...args);
  const getModuleLocalKitchenAnchor = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getModuleLocalKitchenAnchor"]>) => kitchenPlacementController.getModuleLocalKitchenAnchor(...args);
  const getModuleWorldKitchenAnchor = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getModuleWorldKitchenAnchor"]>) => kitchenPlacementController.getModuleWorldKitchenAnchor(...args);
  const preserveWorldKitchenAnchor = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["preserveWorldKitchenAnchor"]>) => kitchenPlacementController.preserveWorldKitchenAnchor(...args);
  const getAssociativeMeasureContext = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getAssociativeMeasureContext"]>) => kitchenPlacementController.getAssociativeMeasureContext(...args);
  const bindingFromPlanSnap = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["bindingFromPlanSnap"]>) => kitchenPlacementController.bindingFromPlanSnap(...args);
  const snapPoint2D = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["snapPoint2D"]>) => kitchenPlacementController.snapPoint2D(...args);
  const getKitchenGuideSegmentInfo = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getKitchenGuideSegmentInfo"]>) => kitchenPlacementController.getKitchenGuideSegmentInfo(...args);
  const getKitchenCornerPlacementInfo = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getKitchenCornerPlacementInfo"]>) => kitchenPlacementController.getKitchenCornerPlacementInfo(...args);
  const getKitchenCornerArmBindingInfo = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getKitchenCornerArmBindingInfo"]>) => kitchenPlacementController.getKitchenCornerArmBindingInfo(...args);
  const getKitchenSegmentReservedMargins = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getKitchenSegmentReservedMargins"]>) => kitchenPlacementController.getKitchenSegmentReservedMargins(...args);
  const inferKitchenPlacementBinding = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["inferKitchenPlacementBinding"]>) => kitchenPlacementController.inferKitchenPlacementBinding(...args);
  const applyKitchenPlacementBinding = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["applyKitchenPlacementBinding"]>) => kitchenPlacementController.applyKitchenPlacementBinding(...args);
  const rebuildKitchenGroupLayout = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["rebuildKitchenGroupLayout"]>) => kitchenPlacementController.rebuildKitchenGroupLayout(...args);
  const getTallKitchenPlacementConstraint = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getTallKitchenPlacementConstraint"]>) => kitchenPlacementController.getTallKitchenPlacementConstraint(...args);
  const getKitchenPlacementConstraint = (...args: Parameters<ReturnType<typeof createKitchenPlacementController>["getKitchenPlacementConstraint"]>) => kitchenPlacementController.getKitchenPlacementConstraint(...args);

  kitchenPlacementController = createKitchenPlacementController({
    S,
    walls,
    instances,
    floors,
    kitchenWorktops,
    wallSolvedOutlines,
    getKitchenWorktopBackGuidePath,
    rebuildInstance,
    rebuildKitchenGroupWorktops,
    updateLayoutPanel,
    getWallSolvedJoinPolys: () => wallSolvedJoinPolys,
    getWallUnionPolys: () => wallUnionPolys,
    getLayoutTool: () => layoutTool,
    getWallChainStart: () => wallDraw.chainStart
  });

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
    setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: klikaj body tvaru. PĂ„â€šĂ‚Â­Ă„Ä…Ă‹â€ˇ mm + Enter pre dÄ‚â€žÄąĹşĂ„Ä…Ă„Äľku segmentu. Esc = potvrdiĂ„Ä…Ă„â€ž hotovĂ„â€šĂ‹ĹĄ tvar.");
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
      setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: druhĂ„â€šĂ‹ĹĄ klik = Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ bod. PĂ„â€šĂ‚Â­Ă„Ä…Ă‹â€ˇ mm + Enter.");
      return true;
    }

    if (kitchenWorktopDraw.points.length === 1) {
      kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      wallTypedHud.style.display = "none";
      scheduleKitchenWorktopPreviewUpdate();
      setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: pokraÄ‚â€žÄąÂ¤uj Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­m bodom alebo Esc = potvrdiĂ„Ä…Ă„â€ž.");
      return true;
    }

    if (kitchenWorktopDraw.points.length === 2) {
      kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      wallTypedHud.style.display = "none";
      updateKitchenWorktopPreview();
      setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: pokraÄ‚â€žÄąÂ¤uj Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­m rohom alebo Esc = potvrdiĂ„Ä…Ă„â€ž tvar.");
      return true;
    }

    kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
    kitchenWorktopDraw.hoverPoint = point;
    kitchenWorktopDraw.typedMm = "";
    wallTypedHud.style.display = "none";
    scheduleKitchenWorktopPreviewUpdate();
    setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ klik = Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ roh, Esc = potvrdiĂ„Ä…Ă„â€ž hotovĂ„â€šĂ‹ĹĄ tvar.");
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
      `PracovnĂ„â€šĂ‹â€ˇ doska: zrkadlenie ${kitchenWorktopDraw.mirrored ? "ZAP" : "VYP"} okolo ${kitchenWorktopDraw.justification.toUpperCase()} line.`
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
      setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: zruĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â©.");
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
    setUnderlayStatus(params.path.length >= 3 ? "RohovĂ„â€šĂ‹â€ˇ pracovnĂ„â€šĂ‹â€ˇ doska vytvorenĂ„â€šĂ‹â€ˇ." : "PracovnĂ„â€šĂ‹â€ˇ doska vytvorenĂ„â€šĂ‹â€ˇ.");
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
    args.measureReadoutEl.textContent = measureState.enabled ? "Measure: klikni prvĂ„â€šĂ‹ĹĄ bod." : "";
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
        setUnderlayStatus("KĂ„â€šÄąâ€šta: vĂ„â€šĂ‹ĹĄber zruĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‹ĹĄ. Vyber prvĂ„â€šÄąĹş Ä‚â€žÄąÂ¤iaru.");
      } else {
        setToolSelect();
        setUnderlayStatus("KĂ„â€šÄąâ€šta: stopped.");
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
        setUnderlayStatus("Section: canceled current line. Klikni prvĂ„â€šĂ‹ĹĄ bod.");
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
    setUnderlayStatus("Section: klikni prvĂ„â€šĂ‹ĹĄ bod, potom druhĂ„â€šĂ‹ĹĄ bod. Space = zrkadliĂ„Ä…Ă„â€ž smer.");
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
    args.measureReadoutEl.textContent = "Measure: klikni prvĂ„â€šĂ‹ĹĄ bod.";
    setUnderlayStatus("Measure: klikni prvĂ„â€šĂ‹ĹĄ roh alebo hranu.");
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
    setUnderlayStatus("KĂ„â€šÄąâ€šta: vyber prvĂ„â€šÄąĹş Ä‚â€žÄąÂ¤iaru, potom Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇie rovnobeĂ„Ä…Ă„ÄľnĂ„â€šĂ‚Â© Ä‚â€žÄąÂ¤iary. Klik do voÄ‚â€žĂ„ÄľnĂ„â€šĂ‚Â©ho miesta vloĂ„Ä…Ă„ÄľĂ„â€šĂ‚Â­ kĂ„â€šÄąâ€štu.");
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
        setUnderlayStatus(`PracovnĂ„â€šĂ‹â€ˇ doska: ${kitchenWorktopDraw.typedMm} mm (Enter = pridaĂ„Ä…Ă„â€ž bod, Backspace = edit, Esc = potvrdiĂ„Ä…Ă„â€ž)`);
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
          setUnderlayStatus(`PracovnĂ„â€šĂ‹â€ˇ doska: ${kitchenWorktopDraw.typedMm} mm (Enter = pridaĂ„Ä…Ă„â€ž bod, Backspace = edit, Esc = potvrdiĂ„Ä…Ă„â€ž)`);
        } else {
          wallTypedHud.style.display = "none";
          setUnderlayStatus("PracovnĂ„â€šĂ‹â€ˇ doska: klikaj body alebo pĂ„â€šĂ‚Â­Ă„Ä…Ă‹â€ˇ mm + Enter. Esc = potvrdiĂ„Ä…Ă„â€ž.");
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
            setUnderlayStatus(`RotĂ„â€šĂ‹â€ˇcia: ${transformState.typed}Ä‚â€šĂ‚Â° (Enter)`);
            ev.preventDefault();
            return;
          }
          if (ev.key === "Backspace") {
            transformState.typed = transformState.typed.slice(0, -1);
            setUnderlayStatus(transformState.typed.length ? `RotĂ„â€šĂ‹â€ˇcia: ${transformState.typed}Ä‚â€šĂ‚Â° (Enter)` : "RotĂ„â€šĂ‹â€ˇcia: pohni myĂ„Ä…Ă‹â€ˇou pre smer, alebo zadaj stupne + Enter.");
            ev.preventDefault();
            return;
          }
          if (ev.key === "Enter" && transformState.typed.trim().length > 0) {
            const n = Number(transformState.typed.trim().replace(",", "."));
            if (Number.isFinite(n) && n !== 0) {
              const sign = transformState.lastAngleSign || 1;
              const ang = (Math.abs(n) * Math.PI) / 180 * sign;
              applyRotateAngle(ang);
              setUnderlayStatus(`RotĂ„â€šĂ‹â€ˇcia: ${sign < 0 ? "CW" : "CCW"} ${Math.abs(Math.round(n))}Ä‚â€šĂ‚Â° (klikni pre dokonÄ‚â€žÄąÂ¤enie)`);
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
            setUnderlayStatus("Stena: druhĂ„â€šĂ‹ĹĄ bod... (pĂ„â€šĂ‚Â­Ă„Ä…Ă‹â€ˇ mm + Enter, Shift = bez axis snap, Esc = stop)");
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
            setUnderlayStatus("Stena: Ä‚â€žÄąÄ…alĂ„Ä…Ă‹â€ˇĂ„â€šĂ‚Â­ bod... (pĂ„â€šĂ‚Â­Ă„Ä…Ă‹â€ˇ mm + Enter, Shift = bez axis snap, Esc = stop)");
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
  kitchenPlacementController.setMeasureStateRef(measureState);

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

  const { photoSamples, photoStatus } = createRenderControls({
    layoutUi,
    enableSsgi: ENABLE_SSGI,
    enablePhoto: ENABLE_PHOTO,
    getRenderMode: () => renderMode,
    setRenderMode: (mode) => {
      renderMode = mode;
    },
    setDaylightIntensity,
    getShadowAlgorithm,
    setShadowAlgorithm,
    setHdri,
    disposeSsgi: () => {
      ssgi?.dispose();
      ssgi = null;
      ssgiCameraUuid = null;
    },
    disposePhoto: () => {
      photo?.dispose();
      photo = null;
      photoCameraUuid = null;
      photoLastLightingRevision = -1;
    },
    resetPhoto: () => {
      photo?.reset();
    },
    downloadViewportPng
  });

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

  wallController = createWallController({
    walls,
    instances,
    kitchenWorktops,
    layoutRoot,
    wallPlanGroup,
    wallPlanMeshes,
    wallJoinMeshes,
    wallDebugGroup,
    wallSolvedOutlines,
    wallDefault,
    wallJoinTolMm,
    pinnedWallIds,
    S,
    cam,
    getModuleLocalBackCenter,
    getKitchenWorktopGuidePathForAlign,
    moduleOverlapsWalls,
    setUnderlayStatus,
    showWallSnapMarkersFor,
    getViewMode: () => viewMode,
    getSelectedKind: () => selectedKind,
    getSelectedWallId: () => selectedWallId,
    setSelectedWallId: (next: string | null) => { selectedWallId = next; },
    getWallDebugEnabled: () => wallDebugEnabled,
    setWallSolvedJoinPolys: (next: Array<Array<{ x: number; z: number }>>) => { wallSolvedJoinPolys = next; },
    setWallUnionPolys: (next: any | null) => { wallUnionPolys = next; },
    nextWallId: () => `w${wallCounter++}`
  });

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
    p.textContent = mode === "layout" ? "Vyber objekt alebo nĂ„â€šĂ‹â€ˇstroj." : "Properties sĂ„â€šÄąĹş dostupnĂ„â€šĂ‚Â© iba v layout mode.";
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

  const floorOrthoPoint = (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => {
    return computeFloorOrthoPoint(start, raw, drawOrthoEnabled);
  };

  const moveFloorEditVertex = (startSegments: FloorBoundarySegment[], startPoint: FloorBoundaryPoint, nextPoint: FloorBoundaryPoint) => {
    floorEdit.segments = moveFloorEditVertexBase(startSegments, startPoint, nextPoint);
  };

  const moveFloorEditSegment = (
    startSegments: FloorBoundarySegment[],
    segmentIndex: number,
    startWorld: FloorBoundaryPoint,
    nextWorld: FloorBoundaryPoint
  ) => {
    floorEdit.segments = moveFloorEditSegmentBase(startSegments, segmentIndex, startWorld, nextWorld);
  };

  const pickFloorEditElement = (mousePx: { x: number; y: number }, rect: DOMRect) =>
    pickFloorEditElementBase({ floorEdit, mousePx, rect, camera: cam() });

  const clearFloorBoundaryGroup = () => clearFloorBoundaryGroupBase(floorBoundaryGroup);

  const renderFloorBoundaryEdit = () => renderFloorBoundaryEditBase({ group: floorBoundaryGroup, floorEdit });

  const setFloorBoundaryTool = (tool: FloorBoundaryTool) => {
    floorEdit.tool = tool;
    floorEdit.first = null;
    floorEdit.hover = null;
    clearToolHud();
    renderFloorBoundaryEdit();
    setUnderlayStatus(
      tool === "pickLines"
        ? "Floor boundary: Pick Lines Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ klikni hranu steny."
        : tool === "rectangle"
          ? "Floor boundary: Rectangle Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ klikni prvĂ„â€šĂ‹ĹĄ a druhĂ„â€šĂ‹ĹĄ roh."
          : tool === "circle"
            ? "Floor boundary: Circle Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ klikni stred a polomer."
            : "Floor boundary: Line Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ klikaj body boundary line."
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
    tb.toolButton(finish, { title: "DokonÄ‚â€žÄąÂ¤iĂ„Ä…Ă„â€ž podlahu", iconSvg: I_DONE, label: "DokonÄ‚â€žÄąÂ¤iĂ„Ä…Ă„â€ž", variant: "success", onClick: () => finishFloorBoundaryEdit() });
    tb.toolButton(finish, { title: "ZruĂ„Ä…Ă‹â€ˇiĂ„Ä…Ă„â€ž", iconSvg: I_CANCEL, label: "ZruĂ„Ä…Ă‹â€ˇiĂ„Ä…Ă„â€ž", variant: "danger", onClick: () => discardFloorBoundaryEdit() });
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
    setUnderlayStatus("Floor boundary: Line Ä‚ËĂ˘â€šÂ¬Ă˘â‚¬ĹĄ kresli boundary line alebo pouĂ„Ä…Ă„Äľi Pick Lines.");
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
      floorEdit.error = "Boundary line nie je uzavretĂ„â€šĂ‹â€ˇ. Uzavri loop alebo doplĂ„Ä…Ă‚Â chĂ„â€šĂ‹ĹĄbajĂ„â€šÄąĹşce Ä‚â€žÄąÂ¤iary.";
      setUnderlayStatus("Floor boundary: boundary musĂ„â€šĂ‚Â­ maĂ„Ä…Ă„â€ž aspoĂ„Ä…Ă‚Â 3 Ä‚â€žÄąÂ¤iary.");
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
    setUnderlayStatus("Floor boundary: uloĂ„Ä…Ă„ÄľenĂ„â€šĂ‚Â©.");
  };

  const discardFloorBoundaryEdit = () => {
    if (!floorEdit.active) return;
    const existing = floorEdit.floorId ? floors.find((floor) => floor.id === floorEdit.floorId) ?? null : null;
    if (existing && floorEdit.snapshot) {
      existing.params = cloneFloorParams(floorEdit.snapshot);
      rebuildFloor(existing);
    }
    exitFloorBoundaryEditCommon();
    setUnderlayStatus("Floor boundary: zruĂ„Ä…Ă‹â€ˇenĂ„â€šĂ‚Â©.");
  };

  const addFloorEditSegment = (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => {
    if (floorPointDistMm(a, b) < 2) return;
    floorEdit.error = "";
    floorEdit.segments.push({ a: { ...a }, b: { ...b } });
    renderFloorBoundaryEdit();
  };

  const mountFloorBoundaryProps = () => mountFloorBoundaryPropsPanel({ props, floorEdit, getAllMaterials, floorDefault });

  const mountWallToolProps = () => mountWallToolPropsPanel({ props, wallDefault, wallDraw, updateWallMeshWithJustification, setUnderlayStatus });

  const mountKitchenWorktopToolProps = () => mountKitchenWorktopToolPropsPanel({ props, S, kitchenWorktopDraw, scheduleKitchenWorktopPreviewUpdate, getMaterialDefinitionById });

  const mountAlignToolProps = () => mountAlignToolPropsPanel({ props, alignState });

  const mountTrimToolProps = () => mountTrimToolPropsPanel({ props, trimState });

  const mountMeasureToolProps = () => mountMeasureToolPropsPanel({ props, measureState, args, formatMm, clearAllMeasurements, setUnderlayStatus, mountProps });

  const mountWallProps = (w?: WallInstance) => mountWallPropsPanel({ props, selectedWallIds, walls, showNoProps, commitHistory, S, mountProps, rebuildWall, rebuildWallPlanMesh, appendLinkedMeasureInputs }, w);

  const mountFloorProps = (floor: FloorInstance) => mountFloorPropsPanel({ props, getAllMaterials, floorDefault, rebuildFloor, updateSelectionHighlights, commitHistory, S, enterFloorBoundaryEdit, appendLinkedMeasureInputs }, floor);

  const mountSectionToolProps = () => mountSectionToolPropsPanel({ props, sectionDraw, drawOrthoEnabled });

  const mountSectionProps = (id: string) => mountSectionPropsPanel({ props, sections, showNoProps, getSectionBasis, updateAllSectionVisuals, mountProps, commitHistory, S }, id);

  const mountModuleProps = (id: string) => mountModulePropsPanel({ findInstance, showNoProps, props, pinnedInstanceIds, instanceFitsRoom, anyOverlap, moduleOverlapsWalls, moduleOverlapsKitchenWorktops, commitHistory, S, mountProps, getModuleDescriptorOrThrow, args, rebuildInstance, appendLinkedMeasureInputs }, id);

  const mountWindowProps = () => mountWindowPropsPanel({ props });

  const mountUnderlayProps = () => mountUnderlayPropsPanel({ props, loadUnderlayToCanvas, ensureLayoutMode, setUnderlayStatus, setUnderlayFromCanvas, underlayState, commitHistory, S, setSelectedUnderlay, updateUnderlayTransform, underlayCal, underlayMesh, clearUnderlay, setSelectedModule, mountProps, setUnderlayScaleEl: (el: HTMLInputElement) => { underlayScaleEl = el; }, setUnderlayOffXEl: (el: HTMLInputElement) => { underlayOffXEl = el; }, setUnderlayOffZEl: (el: HTMLInputElement) => { underlayOffZEl = el; }, setUnderlayStatusEl: (el: HTMLDivElement) => { underlayStatusEl = el; }, markUnderlaySelected: () => { selectedKind = "underlay"; } });

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



  worktopController = createWorktopController({
    kitchenWorktops,
    layoutRoot,
    S,
    kitchenWorktopDraw,
    wallTypedHud,
    getKitchenWorktopBackGuidePath,
    hideHoverCursor,
    showWallSnapMarkersFor,
    setUnderlayStatus,
    mountProps,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    getSelectedKind: () => selectedKind,
    getSelectedWallId: () => selectedWallId,
    setWorktopDrawSnap: (next: PlanSnapResult | null) => { worktopDrawSnap = next; },
    nextWorktopId: () => `wt${worktopCounter++}`,
    ensureWorktopCounter: (next: number) => { worktopCounter = Math.max(worktopCounter, next); S.worktopCounter = worktopCounter; },
    setWorktopCounter: (next: number) => { worktopCounter = next; S.worktopCounter = worktopCounter; },
    syncWorktopCounter: () => { S.worktopCounter = worktopCounter; }
  });

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

  let modulePlacementHelpers!: ReturnType<typeof createModulePlacementHelpers>;
  function placeWithoutOverlap(inst: LayoutInstance) { return modulePlacementHelpers.placeWithoutOverlap(inst); }
  function anyOverlap(moving: LayoutInstance, ignoreId: string | null) { return modulePlacementHelpers.anyOverlap(moving, ignoreId); }
  function anyOverlapIgnoring(moving: LayoutInstance, ignoreIds: Set<string>) { return modulePlacementHelpers.anyOverlapIgnoring(moving, ignoreIds); }
  function moduleWorldRing(inst: LayoutInstance) { return modulePlacementHelpers.moduleWorldRing(inst); }
  function moduleOverlapsKitchenWorktops(inst: LayoutInstance) { return modulePlacementHelpers.moduleOverlapsKitchenWorktops(inst); }
  function moduleOverlapsWalls(inst: LayoutInstance) { return modulePlacementHelpers.moduleOverlapsWalls(inst); }
  function snapPositionDetailed(moving: LayoutInstance, desired: THREE.Vector3, opts?: Record<string, unknown>) { return modulePlacementHelpers.snapPositionDetailed(moving, desired, opts); }
  function collectAdjacentModuleInfos(inst: LayoutInstance, referenceBox = instanceWorldBox(inst)) { return modulePlacementHelpers.collectAdjacentModuleInfos(inst, referenceBox); }
  function chooseResizeAnchorSide(inst: LayoutInstance, infos: any[]) { return modulePlacementHelpers.chooseResizeAnchorSide(inst, infos); }
  function inferTallResizeAnchorSide(inst: LayoutInstance) { return modulePlacementHelpers.inferTallResizeAnchorSide(inst); }
  function preserveAnchoredResizeSide(inst: LayoutInstance, prevWorldBox: THREE.Box3, anchorSide: "left" | "right" | "front" | "back" | null) { return modulePlacementHelpers.preserveAnchoredResizeSide(inst, prevWorldBox, anchorSide); }
  function nudgePinnedModuleChain(inst: LayoutInstance, delta: THREE.Vector3) { return modulePlacementHelpers.nudgePinnedModuleChain(inst, delta); }
  function propagateCornerResizeToPinnedNeighbors(inst: LayoutInstance, previousParams: ModuleParams) { return modulePlacementHelpers.propagateCornerResizeToPinnedNeighbors(inst, previousParams); }
  function propagateModuleResizeToPinnedNeighbors(inst: LayoutInstance, prevWorldBox: THREE.Box3, prevBoxesById?: Map<string, THREE.Box3>) { return modulePlacementHelpers.propagateModuleResizeToPinnedNeighbors(inst, prevWorldBox, prevBoxesById); }
  function snapPosition(moving: LayoutInstance, desired: THREE.Vector3) { return modulePlacementHelpers.snapPosition(moving, desired); }
  function setPlacementAdjacencyPreview(link: ModuleAdjacencyLink | null) { return modulePlacementHelpers.setPlacementAdjacencyPreview(link); }
  function updateModuleAdjacencyVisuals() { return modulePlacementHelpers.updateModuleAdjacencyVisuals(); }
  function applyWallConstraints(moving: LayoutInstance, desired: THREE.Vector3) { return modulePlacementHelpers.applyWallConstraints(moving, desired); }
  function autoOrientModuleToRoomWallIfSnapped(inst: LayoutInstance, ignoreIds?: Set<string>) { return modulePlacementHelpers.autoOrientModuleToRoomWallIfSnapped(inst, ignoreIds); }

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
      label: "KĂ„â€šÄąâ€šta",
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
    tb.toolButton(project, {
      title: "BOM",
      iconSvg: I_BOM,
      label: "BOM",
      onClick: () => openBomPanel({ instances: S.instances, kitchenWorktops: S.kitchenWorktops, kitchenCtx: S.kitchenCtx })
    });
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

  function instanceLayoutWorldBox(inst: LayoutInstance) {
    return instanceLayoutWorldBoxBase(inst, getModuleLocalBackCenter);
  }

  function instanceWorldBox(inst: LayoutInstance) {
    return instanceLayoutWorldBox(inst);
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

  function ensurePickAndOutline(inst: LayoutInstance, flattenToPlan = viewMode === "2d" && activeViewerTab === "floorplan") {
    ensurePickAndOutlineBase(inst, {
      flattenToPlan,
      viewMode,
      getModuleLocalBackCenter
    });
  }

  function getInstanceGeometryMeshes(inst: LayoutInstance) {
    return getInstanceGeometryMeshesBase(inst, viewMode);
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

  modulePlacementHelpers = createModulePlacementHelpers({
    instances,
    kitchenWorktops,
    walls,
    S,
    roomBounds,
    wallSolvedOutlines,
    moduleAdjacencyGroup,
    placementAdjacencyPreview,
    instanceLayoutWorldBox,
    instanceWorldBox,
    instanceFitsRoom,
    getModuleLocalBackCenter,
    moduleStaysOutsideKitchenWorktop,
    isCornerKitchenModule,
    applyKitchenPlacementBinding,
    getKitchenCornerArmBindingInfo,
    getKitchenGuideSegmentInfo,
    getKitchenWorktopBackGuidePath,
    findInstance,
    getWallUnionPolys: () => wallUnionPolys,
    getWallSolvedJoinPolys: () => wallSolvedJoinPolys,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab
  });

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

  const buildLayoutExportPayload = () => createLayoutExportPayload({ windowInst, floors, sections, instances });

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

  installPointerInputHandlers({
    S,
    get activeViewerTab() { return activeViewerTab; }, set activeViewerTab(next) { activeViewerTab = next; },
    addFloorEditSegment,
    addMeasurement,
    addWall,
    alignState,
    anyOverlap,
    appendKitchenWorktopPoint,
    applyAlignBetweenPickedLines,
    applyMeasureAxisAssist,
    applyMeasureAxisAssist3D,
    applyMoveDelta,
    applyRotateAngle,
    applyWallConstraints,
    areAlignLinesParallel,
    args,
    autoJoinAtMmPoint,
    autoOrientModuleToRoomWallIfSnapped,
    axisLockPoint3D,
    axisLockXZ,
    beginKitchenWorktopSelection,
    beginModuleSelection,
    bindingFromPlanSnap,
    get cabinetGroup() { return cabinetGroup; }, set cabinetGroup(next) { cabinetGroup = next; },
    cam,
    clearPreview,
    clearToolHud,
    clearTransform,
    clearWallDrawState,
    clearWindowLightIfMissing,
    cloneFloorSegments,
    commitHistory,
    commitPlacement,
    commitSectionDraw,
    dimensionState,
    distPxPointToSeg,
    distance3dMm,
    dragState,
    get drawOrthoEnabled() { return drawOrthoEnabled; }, set drawOrthoEnabled(next) { drawOrthoEnabled = next; },
    drawSnapOverlay,
    findInstance,
    findSelectableFloorplanModuleAtPoint,
    floorEdit,
    floorOrthoPoint,
    floorPointEq,
    floorPointToWorld,
    floors,
    formatMm,
    fromMmPoint,
    getAllInstanceGeometryMeshes,
    getInstanceGeometryMeshes,
    getInstanceIdFromObject,
    getKitchenWorktopGeometryMeshes,
    getLayoutMeasureMeshes3d,
    getMeasure3DSnapTargetObject,
    getSectionIdFromObject,
    getSectionPickMeshes,
    getSelectableMeshes,
    getWorktopIdFromObject,
    groundPlane,
    hideHoverCursor,
    hudHoverLine,
    hudLineThicknessM,
    hudPickLine1,
    hudPickLine2,
    inferKitchenPlacementBinding,
    instances,
    keepStickyPlanSnap,
    get kitchenMode() { return kitchenMode; }, set kitchenMode(next) { kitchenMode = next; },
    kitchenWorktopDraw,
    layoutRoot,
    get layoutTool() { return layoutTool; }, set layoutTool(next) { layoutTool = next; },
    lineLineIntersectionXZ,
    makeFloorCirclePoints,
    makeWallPreviewMesh,
    marquee,
    marqueeEl,
    measureState,
    get mode() { return mode; }, set mode(next) { mode = next; },
    moduleOverlapsKitchenWorktops,
    moduleOverlapsWalls,
    mountProps,
    mountWindowControls,
    moveFloorEditSegment,
    moveFloorEditVertex,
    moveWallEndpointAndConnected,
    nudgePinnedModuleChain,
    pickAlignLineAt,
    pickFloorEditElement,
    pickSurfacePoint,
    pickWallLine2D,
    pinnedInstanceIds,
    pinnedWallIds,
    placement,
    placementHelpers,
    planarDistanceMm,
    pointInPolygonXZ,
    pointOnWallAxisMm,
    pointerNdc,
    raycaster,
    rebuildGhost,
    rebuildWall,
    rebuildWallPlanMesh,
    renderFloorBoundaryEdit,
    renderer,
    resolveKitchenWorktopDrawSnap,
    resolveMeasurePlanSnap,
    resolveSectionDrawPoint,
    scheduleKitchenWorktopPreviewUpdate,
    sectionDraw,
    selectMesh,
    get selectPlanSnap() { return selectPlanSnap; }, set selectPlanSnap(next) { selectPlanSnap = next; },
    get selectedFloorId() { return selectedFloorId; }, set selectedFloorId(next) { selectedFloorId = next; },
    get selectedInstanceId() { return selectedInstanceId; }, set selectedInstanceId(next) { selectedInstanceId = next; },
    selectedInstanceIds,
    get selectedKind() { return selectedKind; }, set selectedKind(next) { selectedKind = next; },
    get selectedKitchenGroupId() { return selectedKitchenGroupId; }, set selectedKitchenGroupId(next) { selectedKitchenGroupId = next; },
    get selectedSectionId() { return selectedSectionId; }, set selectedSectionId(next) { selectedSectionId = next; },
    selectedUnderlayBox,
    get selectedWallId() { return selectedWallId; }, set selectedWallId(next) { selectedWallId = next; },
    selectedWallIds,
    setFirstPointMarker,
    setInstanceSelected,
    setSelectedFloor,
    setSelectedModule,
    setSelectedSection,
    setSelectedUnderlay,
    setSelectedWall,
    setSelectedWindow,
    setUnderlayStatus,
    showWallSnapMarkersFor,
    snapAxisXZ,
    snapPoint2D,
    snapPoint3D,
    snapPointXZ,
    snapPosition,
    syncSelectionState,
    technicalDimensions,
    toFreePlanBinding,
    toMmPoint,
    transformState,
    trimState,
    underlayCal,
    underlayDragState,
    underlayMesh,
    underlayOffXEl,
    underlayOffZEl,
    underlayScaleEl,
    underlayState,
    updateAllSectionVisuals,
    updateHoverCursor,
    updateHudLine,
    updateLayoutPanel,
    updateMeasureHoverFromPlanPoint,
    updatePreview,
    updateSectionDrawPreview,
    updateSelectionHighlights,
    updateUnderlayTransform,
    updateWallMeshWithJustification,
    updateWindowTransform,
    get viewMode() { return viewMode; }, set viewMode(next) { viewMode = next; },
    viewNavigation,
    wallDefault,
    wallDefs,
    wallDraw,
    get wallDrawSnap() { return wallDrawSnap; }, set wallDrawSnap(next) { wallDrawSnap = next; },
    wallEditHud,
    wallSolvedOutlines,
    wallTypedHud,
    walls,
    windowDragState,
    get windowInst() { return windowInst; }, set windowInst(next) { windowInst = next; },
    worldToFloorPoint,
    worldToScreen
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

  installKitchenDebugApi({
    S,
    kitchenWorktops,
    instances,
    placement,
    placementHelpers,
    layoutRoot,
    measureState,
    wallDefault,
    walls,
    renderer,
    wallJoinTolMm,
    wallPlanGroup,
    detailSliceGroup,
    instanceVisualWorldBox,
    getModuleLocalBackCenter,
    getModuleWorldKitchenAnchor,
    getKitchenWorktopBackGuidePath,
    cancelKitchenWorktopDraw,
    removeKitchenWorktop,
    deleteInstance,
    setSelectedKitchenGroup,
    setSelectedModule,
    mountProps,
    updateLayoutPanel,
    getModuleDescriptorOrThrow,
    createInstance,
    getKitchenCornerPlacementInfo,
    applyKitchenPlacementBinding,
    getKitchenGuideSegmentInfo,
    moduleStaysOutsideKitchenWorktop,
    clampNumber,
    getTallKitchenPlacementConstraint,
    getKitchenModulePlacementY,
    ensureLayoutMode,
    createKitchenWorktop,
    rebuildKitchenGroupLayout,
    setToolMeasure,
    addWall,
    setWallEndpointMm,
    rebuildWall,
    autoJoinAtMmPoint,
    rebuildWallPlanMesh,
    snapPoint2D,
    cam,
    bindingFromPlanSnap,
    addMeasurement,
    createFloor,
    cloneFloorParams,
    setSelectedFloor,
    setSelectedWall,
    findInstance,
    rebuildInstance,
    instanceWorldBox,
    getCurrentMeasureSelectionTarget,
    commitSelectedMeasureValueMm,
    commitWallMeasureValueMm,
    pickAlignLineAt,
    applyAlignBetweenPickedLines,
    updateSelectionHighlights,
    getSceneDebugState,
    ctl,
    getKitchenMode: () => kitchenMode,
    getSelectedKitchenGroupId: () => selectedKitchenGroupId,
    getSelectedInstanceId: () => selectedInstanceId,
    getSelectedFloorId: () => selectedFloorId,
    getSelectedWallId: () => selectedWallId,
    getSelectedKind: () => selectedKind,
    getActiveViewerTab: () => activeViewerTab,
    getLayoutTool: () => layoutTool,
    getViewMode: () => viewMode,
    getLastRebuildDebug: () => lastRebuildDebug
  });

  const frameRendererContext = {
    viewNavigation,
    ctl,
    enforceWallDrawInvariant,
    enforceKitchenWorktopDrawInvariant,
    enforceSectionDrawInvariant,
    findInstance,
    refreshAssociativeMeasures,
    updateMeasureLabels,
    updateMeasureLabelInteractivity,
    updateModuleAdjacencyVisuals,
    updateWallEditHud,
    updateModuleEditHud,
    updateDetailViewCamera,
    cam,
    renderer,
    scene,
    viewerEl: args.viewerEl,
    photoSamples,
    photoStatus,
    getLightingRevision,
    lastCameraWorld,
    lastCameraProj,
    technicalDimensions,
    enablePhoto: ENABLE_PHOTO,
    enableSsgi: ENABLE_SSGI,
    get selectedBox() { return selectedBox; },
    get selectedMesh() { return selectedMesh; },
    get selectedInstanceBox() { return selectedInstanceBox; },
    get selectedInstanceId() { return selectedInstanceId; },
    get grainArrow() { return grainArrow; },
    get overlapBoxes() { return overlapBoxes; },
    get renderMode() { return renderMode; },
    get ssgi() { return ssgi; },
    set ssgi(value: SsgiPipeline | null) { ssgi = value; },
    get ssgiCameraUuid() { return ssgiCameraUuid; },
    set ssgiCameraUuid(value: string | null) { ssgiCameraUuid = value; },
    get photo() { return photo; },
    set photo(value: PhotoPathTracer | null) { photo = value; },
    get photoCameraUuid() { return photoCameraUuid; },
    set photoCameraUuid(value: string | null) { photoCameraUuid = value; },
    get photoLastLightingRevision() { return photoLastLightingRevision; },
    set photoLastLightingRevision(value: number) { photoLastLightingRevision = value; }
  };

  const tick = () => {
    const dt = Math.min(0.05, navClock.getDelta());
    renderAppFrame(frameRendererContext, dt);
    requestAnimationFrame(tick);
  };
  tick();
}
