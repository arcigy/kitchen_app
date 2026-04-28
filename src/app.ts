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
import {
  areAlignLinesParallel,
  buildModuleAlignCandidates,
  buildWallAlignCandidates,
  buildWorktopAlignCandidates,
  getAlignShiftVector,
  pickBestAlignLine
} from "./app/alignTool";
import {
  buildModuleSnapCandidates,
  detectModuleAdjacency,
  detectModuleAdjacencyInfo,
  type ModuleAdjacencyLink
} from "./app/moduleAdjacency";
import {
  cloneSectionParams,
  buildPlaneSliceStripGeometry,
  computeElevationViewConfig,
  computeSectionViewConfig,
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
import { createModulePlacementHelpers, type AdjacentModuleInfo, type ModulePlacementSnapOptions } from "./app/modulePlacementHelpers";
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
import { createWallController, type WallPlanMultiPolygon } from "./app/wallController";
import { createWorktopController } from "./app/worktopController";
import { createKitchenPlacementController } from "./app/kitchenPlacementController";
import { installPointerInputHandlers } from "./app/pointerInputHandlers";
import { installKeyboardInputHandlers } from "./app/keyboardInputHandlers";
import { createTransformController } from "./app/transformController";
import { createViewModeController } from "./app/viewModeController";
import { createInstanceRebuilder, type RebuildDebugState } from "./app/instanceRebuilder";
import { createMeasureValueCommitter } from "./app/measureValueCommitter";
import { createBuildSelectionController } from "./app/buildSelectionController";
import { createPropertiesRouter } from "./app/propertiesRouter";
import { createFloorBoundaryController } from "./app/floorBoundaryController";
import { createFloorController } from "./app/floorController";
import { createSectionController } from "./app/sectionController";
import { createSectionDrawController } from "./app/sectionDrawController";
import { topbarIcons } from "./app/topbarIcons";
import { createToolModeController } from "./app/toolModeController";
import { createSelectionController } from "./app/selectionController";
import { createBuildModeController } from "./app/buildModeController";
import { createModuleAdjacencySnapResolver } from "./app/moduleAdjacencySnapResolver";
import { createWallEditHudUpdater } from "./app/wallEditHudUpdater";
import { createWindowControlsController } from "./app/windowControlsController";
import { createClassicTopbarController } from "./app/classicTopbarController";
import { createMeasureSelectionActions } from "./app/measureSelectionActions";

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
  let lastRebuildDebug: RebuildDebugState = null;

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

  let createTransformControllerResult!: ReturnType<typeof createTransformController>;
  const clearTransform = (...args: Parameters<ReturnType<typeof createTransformController>["clearTransform"]>) => createTransformControllerResult.clearTransform(...args);
  const startTransformFromSelection = (...args: Parameters<ReturnType<typeof createTransformController>["startTransformFromSelection"]>) => createTransformControllerResult.startTransformFromSelection(...args);
  const restoreTransformStartState = (...args: Parameters<ReturnType<typeof createTransformController>["restoreTransformStartState"]>) => createTransformControllerResult.restoreTransformStartState(...args);
  const translateWallsByAnchors = (...args: Parameters<ReturnType<typeof createTransformController>["translateWallsByAnchors"]>) => createTransformControllerResult.translateWallsByAnchors(...args);
  const applyMoveDelta = (...args: Parameters<ReturnType<typeof createTransformController>["applyMoveDelta"]>) => createTransformControllerResult.applyMoveDelta(...args);
  const rotatePointAround = (...args: Parameters<ReturnType<typeof createTransformController>["rotatePointAround"]>) => createTransformControllerResult.rotatePointAround(...args);
  const rotateWallsByAnchors = (...args: Parameters<ReturnType<typeof createTransformController>["rotateWallsByAnchors"]>) => createTransformControllerResult.rotateWallsByAnchors(...args);
  const applyRotateAngle = (...args: Parameters<ReturnType<typeof createTransformController>["applyRotateAngle"]>) => createTransformControllerResult.applyRotateAngle(...args);

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



  const floorController = createFloorController({
    S,
    layoutRoot,
    floors,
    floorDefault,
    getFloorCounter: () => floorCounter,
    setFloorCounter: (next) => { floorCounter = next; },
    getSelectedFloorId: () => selectedFloorId,
    setSelectedFloorId: (next) => { selectedFloorId = next; }
  });
  const cloneFloorParams = floorController.cloneFloorParams;
  const rebuildFloor = floorController.rebuildFloor;
  const createFloor = floorController.createFloor;
  const deleteFloor = floorController.deleteFloor;
  const restoreFloorsFromSnapshot = floorController.restoreFloorsFromSnapshot;

  const sectionController = createSectionController({
    S,
    layoutRoot,
    sections,
    getSectionCounter: () => sectionCounter,
    setSectionCounter: (next) => { sectionCounter = next; },
    getSelectedKind: () => selectedKind,
    getSelectedSectionId: () => selectedSectionId,
    setSelectedSectionId: (next) => { selectedSectionId = next; },
    getMode: () => mode,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    setActiveViewerTab: (next) => { activeViewerTab = next; },
    refreshViewerTabs: () => refreshViewerTabs()
  });
  const updateSectionVisual = sectionController.updateSectionVisual;
  const getNextSectionName = sectionController.getNextSectionName;
  const createSectionInstance = sectionController.createSectionInstance;
  const deleteSectionInstance = sectionController.deleteSectionInstance;
  const restoreSectionsFromSnapshot = sectionController.restoreSectionsFromSnapshot;

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
    setUnderlayStatus("Worktop: click shape points. Type mm + Enter for segment length. Esc confirms the shape.");
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
      setUnderlayStatus("Worktop: second click adds the next point. Type mm + Enter.");
      return true;
    }

    if (kitchenWorktopDraw.points.length === 1) {
      kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      wallTypedHud.style.display = "none";
      scheduleKitchenWorktopPreviewUpdate();
      setUnderlayStatus("Worktop: continue with the next point or press Esc to confirm.");
      return true;
    }

    if (kitchenWorktopDraw.points.length === 2) {
      kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
      kitchenWorktopDraw.hoverPoint = point;
      kitchenWorktopDraw.typedMm = "";
      wallTypedHud.style.display = "none";
      updateKitchenWorktopPreview();
      setUnderlayStatus("Worktop: continue with the next corner or press Esc to confirm.");
      return true;
    }

    kitchenWorktopDraw.points = [...kitchenWorktopDraw.points, point];
    kitchenWorktopDraw.hoverPoint = point;
    kitchenWorktopDraw.typedMm = "";
    wallTypedHud.style.display = "none";
    scheduleKitchenWorktopPreviewUpdate();
    setUnderlayStatus("Worktop: next click adds another corner. Esc confirms the finished shape.");
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
      `Worktop: mirroring ${kitchenWorktopDraw.mirrored ? "ON" : "OFF"} around ${kitchenWorktopDraw.justification.toUpperCase()} line.`
    );
  };

  let sectionDrawController!: ReturnType<typeof createSectionDrawController>;
  const updateSectionDrawPreview = () => sectionDrawController.updateSectionDrawPreview();
  const cancelSectionDraw = (opts?: { silent?: boolean }) => sectionDrawController.cancelSectionDraw(opts);
  const commitSectionDraw = (bMm: FloorBoundaryPoint) => sectionDrawController.commitSectionDraw(bMm);

  const handleKitchenWorktopEscape = () => {
    if (!kitchenWorktopDraw.active) return false;
    if (kitchenWorktopDraw.points.length < 2) {
      cancelKitchenWorktopDraw({ silent: true });
      setUnderlayStatus("Worktop: canceled.");
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
    setUnderlayStatus(params.path.length >= 3 ? "Corner worktop created." : "Worktop created.");
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

  let toolModeController!: ReturnType<typeof createToolModeController>;
  const handleGlobalMeasurementClear = (ev: KeyboardEvent) => toolModeController.handleGlobalMeasurementClear(ev);
  const handleLayoutEscape = (ev: KeyboardEvent) => toolModeController.handleLayoutEscape(ev);
  const clearWallDrawState = () => toolModeController.clearWallDrawState();
  const deactivateMeasureTool = (opts?: { clearSaved?: boolean }) => toolModeController.deactivateMeasureTool(opts);
  const setToolSelect = () => toolModeController.setToolSelect();
  const setToolWall = () => toolModeController.setToolWall();
  const setToolAlign = () => toolModeController.setToolAlign();
  const setToolTrim = () => toolModeController.setToolTrim();
  const setToolSection = () => toolModeController.setToolSection();
  const setToolMeasure = () => toolModeController.setToolMeasure();
  const setToolDimension = () => toolModeController.setToolDimension();

  toolModeController = createToolModeController({
    S,
    alignState,
    args,
    cancelKitchenWorktopDraw,
    cancelPlacement,
    cancelSectionDraw,
    clearAllMeasurements: () => clearAllMeasurements(),
    clearPreview: () => clearPreview(),
    clearToolHud,
    dimensionState,
    get drawSnapOverlay() { return drawSnapOverlay; },
    ensureLayoutMode: () => ensureLayoutMode(),
    hideHoverCursor: () => hideHoverCursor(),
    isEscapeKey,
    isTypingTarget,
    layoutRoot,
    get measureState() { return measureState; },
    placement,
    placementHelpers,
    scene,
    sectionDraw,
    selectedInstanceIds,
    selectedWallIds,
    setFirstPointMarker: (point: THREE.Vector3 | null) => setFirstPointMarker(point),
    setInstanceSelected,
    setUnderlayStatus: (message: string) => setUnderlayStatus(message),
    showWallSnapMarkersFor,
    syncSelectionState,
    technicalDimensions,
    trimState,
    updateAllSectionVisuals: () => updateAllSectionVisuals(),
    updateSectionDrawPreview,
    updateSelectionHighlights,
    wallDraw,
    get wallTypedHud() { return wallTypedHud; },
    get layoutTool() { return layoutTool; }, set layoutTool(next: LayoutTool) { layoutTool = next; },
    get measurePlanSnap() { return measurePlanSnap; }, set measurePlanSnap(next: PlanSnapResult | null) { measurePlanSnap = next; },
    get mode() { return mode; },
    get selectedFloorId() { return selectedFloorId; }, set selectedFloorId(next: string | null) { selectedFloorId = next; },
    get selectedKind() { return selectedKind; }, set selectedKind(next: SelectedKind) { selectedKind = next; },
    get selectedKitchenGroupId() { return selectedKitchenGroupId; }, set selectedKitchenGroupId(next: string | null) { selectedKitchenGroupId = next; },
    get selectedSectionId() { return selectedSectionId; }, set selectedSectionId(next: string | null) { selectedSectionId = next; },
    get selectedUnderlayBox() { return selectedUnderlayBox; }, set selectedUnderlayBox(next: THREE.BoxHelper | null) { selectedUnderlayBox = next; },
    get selectedWallBox() { return selectedWallBox; }, set selectedWallBox(next: THREE.BoxHelper | null) { selectedWallBox = next; },
    get selectedWallId() { return selectedWallId; }, set selectedWallId(next: string | null) { selectedWallId = next; },
    get wallDrawSnap() { return wallDrawSnap; }, set wallDrawSnap(next: PlanSnapResult | null) { wallDrawSnap = next; },
    ensureFloorplanViewerTab: () => ensureFloorplanViewerTab(),
    mountProps: () => mountProps(),
    resetMeasureSnapCycle: () => resetMeasureSnapCycle()
  });
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
    setWallUnionPolys: (next: WallPlanMultiPolygon | null) => { wallUnionPolys = next; },
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
    if (mode !== "layout") setMode("layout");
  };



  const {
    I_ALIGN,
    I_BOM,
    I_CABINET,
    I_CANCEL,
    I_COPY,
    I_DIM,
    I_DONE,
    I_DUP,
    I_EXPORT,
    I_FLOOR,
    I_GRID2D,
    I_INSTALL,
    I_MOVE,
    I_REDO,
    I_RESET,
    I_ROTATE,
    I_SECTION,
    I_SELECT,
    I_TRASH,
    I_TRIM,
    I_UNDERLAY,
    I_UNDO,
    I_VIEW,
    I_WALL
  } = topbarIcons;
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
    p.textContent = mode === "layout" ? "Select an object or tool." : "Properties are available only in layout mode.";
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

  let floorBoundaryController!: ReturnType<typeof createFloorBoundaryController>;
  const syncDrawOrthoUi = () => floorBoundaryController.syncDrawOrthoUi();
  const toggleDrawOrthoMode = () => floorBoundaryController.toggleDrawOrthoMode();
  const floorOrthoPoint = (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => floorBoundaryController.floorOrthoPoint(start, raw);
  const moveFloorEditVertex = (startSegments: FloorBoundarySegment[], startPoint: FloorBoundaryPoint, nextPoint: FloorBoundaryPoint) => floorBoundaryController.moveFloorEditVertex(startSegments, startPoint, nextPoint);
  const moveFloorEditSegment = (startSegments: FloorBoundarySegment[], segmentIndex: number, startWorld: FloorBoundaryPoint, nextWorld: FloorBoundaryPoint) => floorBoundaryController.moveFloorEditSegment(startSegments, segmentIndex, startWorld, nextWorld);
  const pickFloorEditElement = (mousePx: { x: number; y: number }, rect: DOMRect) => floorBoundaryController.pickFloorEditElement(mousePx, rect);
  const clearFloorBoundaryGroup = () => floorBoundaryController.clearFloorBoundaryGroup();
  const renderFloorBoundaryEdit = () => floorBoundaryController.renderFloorBoundaryEdit();
  const setFloorBoundaryTool = (tool: FloorBoundaryTool) => floorBoundaryController.setFloorBoundaryTool(tool);
  const buildFloorBoundaryTopbar = () => floorBoundaryController.buildFloorBoundaryTopbar();
  const enterFloorBoundaryEdit = (floorId?: string) => floorBoundaryController.enterFloorBoundaryEdit(floorId);
  const discardFloorBoundaryEdit = () => floorBoundaryController.discardFloorBoundaryEdit();
  const addFloorEditSegment = (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => floorBoundaryController.addFloorEditSegment(a, b);

  floorBoundaryController = createFloorBoundaryController({
    I_ALIGN,
    I_CANCEL,
    I_DIM,
    I_DONE,
    I_GRID2D,
    I_VIEW,
    S,
    args,
    cam,
    cancelPlacement,
    clearToolHud,
    cloneFloorParams,
    commitHistory,
    createFloor,
    ensureFloorplanViewerTab: () => ensureFloorplanViewerTab(),
    ensureLayoutMode,
    floorBoundaryGroup,
    floorDefault,
    floorEdit,
    floors,
    kitchenWorktopDraw,
    mountProps: () => mountProps(),
    placement,
    placementHelpers,
    rebuildFloor,
    selectedInstanceIds,
    selectedWallIds,
    setInstanceSelected,
    setSelectedFloor,
    setToolSelect,
    setUnderlayStatus,
    scheduleKitchenWorktopPreviewUpdate,
    tb,
    get buildClassicTopbar() { return buildClassicTopbar; },
    get drawOrthoEnabled() { return drawOrthoEnabled; },
    set drawOrthoEnabled(next: boolean) { drawOrthoEnabled = next; },
    get drawOrthoToggleEl() { return drawOrthoToggleEl; },
    get floorCounter() { return floorCounter; },
    get rebuildStandardTopbar() { return rebuildStandardTopbar; },
    get selectedFloorId() { return selectedFloorId; },
    set selectedFloorId(next: string | null) { selectedFloorId = next; },
    get selectedKind() { return selectedKind; },
    set selectedKind(next: SelectedKind) { selectedKind = next; },
    get selectedWallId() { return selectedWallId; },
    set selectedWallId(next: string | null) { selectedWallId = next; }
  });
  syncDrawOrthoUi();
  let kitchenMode: ReturnType<typeof createKitchenEditMode> | null = null;
  const propertiesRouter = createPropertiesRouter({
    S,
    args,
    alignState,
    appendLinkedMeasureInputs: (section: HTMLElement, target: MeasureSelectionTarget | null) => appendLinkedMeasureInputs(section, target),
    anyOverlap,
    clearAllMeasurements,
    clearUnderlay,
    commitHistory,
    ensureLayoutMode,
    enterFloorBoundaryEdit,
    findInstance,
    floorDefault,
    floorEdit,
    floors,
    getModuleDescriptorOrThrow,
    instanceFitsRoom,
    instances,
    kitchenWorktopDraw,
    kitchenWorktops,
    measureState,
    moduleOverlapsKitchenWorktops,
    moduleOverlapsWalls,
    mountActiveViewProps,
    mountPlacementControls,
    pinnedInstanceIds,
    placement,
    placementHelpers,
    props,
    rebuildFloor,
    rebuildInstance,
    rebuildWall,
    rebuildWallPlanMesh,
    sectionDraw,
    sections,
    selectedInstanceIds,
    selectedWallIds,
    setSelectedModule,
    setSelectedUnderlay,
    setUnderlayFromCanvas,
    setUnderlayStatus,
    showNoProps,
    trimState,
    underlayCal,
    underlayMesh,
    underlayState,
    updateAllSectionVisuals: () => updateAllSectionVisuals(),
    updateLayoutPanel,
    updateSelectionHighlights,
    updateUnderlayTransform,
    updateWallMeshWithJustification,
    wallDefault,
    wallDraw,
    walls,
    get drawOrthoEnabled() { return drawOrthoEnabled; },
    get kitchenMode() { return kitchenMode; },
    get layoutTool() { return layoutTool; },
    get mode() { return mode; },
    get selectedFloorId() { return selectedFloorId; },
    get selectedInstanceId() { return selectedInstanceId; },
    get selectedKitchenGroupId() { return selectedKitchenGroupId; },
    get selectedKind() { return selectedKind; },
    set selectedKind(next: SelectedKind) { selectedKind = next; },
    get selectedSectionId() { return selectedSectionId; },
    get selectedWallId() { return selectedWallId; },
    setUnderlayScaleEl: (el: HTMLInputElement) => { underlayScaleEl = el; },
    setUnderlayOffXEl: (el: HTMLInputElement) => { underlayOffXEl = el; },
    setUnderlayOffZEl: (el: HTMLInputElement) => { underlayOffZEl = el; },
    setUnderlayStatusEl: (el: HTMLDivElement) => { underlayStatusEl = el; },
    markUnderlaySelected: () => { selectedKind = "underlay"; },
    scheduleKitchenWorktopPreviewUpdate
  });
  const mountProps = () => propertiesRouter.mountProps();



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
  function snapPositionDetailed(moving: LayoutInstance, desired: THREE.Vector3, opts?: ModulePlacementSnapOptions) { return modulePlacementHelpers.snapPositionDetailed(moving, desired, opts); }
  function collectAdjacentModuleInfos(inst: LayoutInstance, referenceBox = instanceWorldBox(inst)) { return modulePlacementHelpers.collectAdjacentModuleInfos(inst, referenceBox); }
  function chooseResizeAnchorSide(inst: LayoutInstance, infos: AdjacentModuleInfo[]) { return modulePlacementHelpers.chooseResizeAnchorSide(inst, infos); }
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

  let createClassicTopbarControllerResult!: ReturnType<typeof createClassicTopbarController>;
  const buildClassicTopbar = (...args: Parameters<ReturnType<typeof createClassicTopbarController>["buildClassicTopbar"]>) => createClassicTopbarControllerResult.buildClassicTopbar(...args);
  createClassicTopbarControllerResult = createClassicTopbarController({
    I_ALIGN,
    I_BOM,
    I_CABINET,
    I_COPY,
    I_DIM,
    I_DUP,
    I_EXPORT,
    I_FLOOR,
    I_GRID2D,
    I_INSTALL,
    I_MOVE,
    I_REDO,
    I_RESET,
    I_ROTATE,
    I_SECTION,
    I_SELECT,
    I_TRASH,
    I_TRIM,
    I_UNDERLAY,
    I_UNDO,
    I_VIEW,
    I_WALL,
    S,
    args,
    deleteSelected,
    duplicateSelected,
    enterFloorBoundaryEdit,
    getInstallState,
    helpers,
    get kitchenMode() { return kitchenMode; },
    layoutTool,
    openBomPanel,
    openPricingCatalog,
    openUnderlayPanel,
    promptAppInstall,
    redo,
    setToolAlign,
    setToolDimension,
    setToolMeasure,
    setToolSection,
    setToolSelect,
    setToolTrim,
    setToolWall,
    startTransformFromSelection,
    subscribeInstallState,
    tb,
    toggle2dView,
    undo,
    updateUndoRedoUi
  });


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

  sectionDrawController = createSectionDrawController({
    layoutRoot,
    sectionDraw,
    drawSnapOverlay,
    setSectionDrawSnap: (next) => { sectionDrawSnap = next; },
    hideHoverCursor,
    setUnderlayStatus,
    mountProps,
    createSectionInstance,
    getNextSectionName,
    setSelectedSection,
    activateViewerTab
  });

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

  const updateAllSectionVisuals = sectionController.updateAllSectionVisuals;
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

  let selectionController!: ReturnType<typeof createSelectionController>;
  function setInstanceSelected(id: string | null) { return selectionController.setInstanceSelected(id); }
  function setSelectedKitchenGroup(groupId: string | null) { return selectionController.setSelectedKitchenGroup(groupId); }
  function setSelectedModule(id: string | null) { return selectionController.setSelectedModule(id); }
  function setSelectedWindow() { return selectionController.setSelectedWindow(); }
  function setSelectedUnderlay() { return selectionController.setSelectedUnderlay(); }
  function setSelectedSection(id: string | null) { return selectionController.setSelectedSection(id); }
  function setSelectedWall(id: string | null) { return selectionController.setSelectedWall(id); }
  function setSelectedFloor(id: string | null) { return selectionController.setSelectedFloor(id); }

  selectionController = createSelectionController({
    instances,
    layoutPanel,
    pinnedInstanceIds,
    pinnedWallIds,
    scene,
    selectedInstanceIds,
    selectedWallIds,
    showWallSnapMarkersFor,
    syncSelectionState,
    underlayMesh,
    underlayState,
    updateAllSectionVisuals: () => updateAllSectionVisuals(),
    updateSelectionHighlights,
    walls,
    get kitchenMode() { return kitchenMode; },
    get layoutTool() { return layoutTool; }, set layoutTool(next: LayoutTool) { layoutTool = next; },
    mountProps: () => mountProps(),
    get selectedFloorId() { return selectedFloorId; }, set selectedFloorId(next: string | null) { selectedFloorId = next; },
    get selectedInstanceBox() { return selectedInstanceBox; }, set selectedInstanceBox(next: THREE.BoxHelper | null) { selectedInstanceBox = next; },
    get selectedInstanceId() { return selectedInstanceId; }, set selectedInstanceId(next: string | null) { selectedInstanceId = next; },
    get selectedKind() { return selectedKind; }, set selectedKind(next: SelectedKind) { selectedKind = next; },
    get selectedKitchenGroupId() { return selectedKitchenGroupId; }, set selectedKitchenGroupId(next: string | null) { selectedKitchenGroupId = next; },
    get selectedSectionId() { return selectedSectionId; }, set selectedSectionId(next: string | null) { selectedSectionId = next; },
    get selectedUnderlayBox() { return selectedUnderlayBox; }, set selectedUnderlayBox(next: THREE.BoxHelper | null) { selectedUnderlayBox = next; },
    get selectedWallBox() { return selectedWallBox; }, set selectedWallBox(next: THREE.BoxHelper | null) { selectedWallBox = next; },
    get selectedWallId() { return selectedWallId; }, set selectedWallId(next: string | null) { selectedWallId = next; }
  });
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

  let createWindowControlsControllerResult!: ReturnType<typeof createWindowControlsController>;
  const updateWindowTransform = (...args: Parameters<ReturnType<typeof createWindowControlsController>["updateWindowTransform"]>) => createWindowControlsControllerResult.updateWindowTransform(...args);
  const mountWindowControls = (...args: Parameters<ReturnType<typeof createWindowControlsController>["mountWindowControls"]>) => createWindowControlsControllerResult.mountWindowControls(...args);
  createWindowControlsControllerResult = createWindowControlsController({
    clampWindowParams,
    createWindow,
    mode,
    scene,
    setSelectedWindow,
    setWindowCutout,
    setWindowOpening,
    wallDefs,
    windowEditorHost,
    get windowInst() { return windowInst; },
    set windowInst(next: WindowInstance | null) { windowInst = next; }
  });


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

  let createInstanceRebuilderResult!: ReturnType<typeof createInstanceRebuilder>;
  function rebuildInstance(...args: Parameters<ReturnType<typeof createInstanceRebuilder>["rebuildInstance"]>) {
    return createInstanceRebuilderResult.rebuildInstance(...args);
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

  let createViewModeControllerResult!: ReturnType<typeof createViewModeController>;
  const setView2d = (...args: Parameters<ReturnType<typeof createViewModeController>["setView2d"]>) => createViewModeControllerResult.setView2d(...args);
  const setMode = (...args: Parameters<ReturnType<typeof createViewModeController>["setMode"]>) => createViewModeControllerResult.setMode(...args);

  const buildLayoutExportPayload = () => createLayoutExportPayload({ windowInst, floors, sections, instances });

  const buildSelectionController = createBuildSelectionController({
    S,
    scene,
    partPanel,
    hiddenParts,
    get activeBuildControls() { return activeBuildControls; },
    get cabinetGroup() { return cabinetGroup; },
    get selectedMesh() { return selectedMesh; },
    set selectedMesh(next: THREE.Mesh | null) { selectedMesh = next; },
    get selectedBox() { return selectedBox; },
    set selectedBox(next: THREE.BoxHelper | null) { selectedBox = next; },
    get grainArrow() { return grainArrow; },
    set grainArrow(next: THREE.ArrowHelper | null) { grainArrow = next; },
    get overlapBoxes() { return overlapBoxes; },
    set overlapBoxes(next: typeof overlapBoxes) { overlapBoxes = next; }
  });
  const { clearOverlapHighlight, highlightOverlap, selectByName, selectMesh, setVisibleByName } = buildSelectionController;

  const buildModeController = createBuildModeController({
    args,
    cam,
    clearOverlapHighlight,
    ctl,
    editorHost,
    hasImportedModules,
    hiddenParts,
    noModulesMessage,
    partPanel,
    scene,
    selectMesh,
    get activeBuildControls() { return activeBuildControls; },
    set activeBuildControls(next: ParamHighlightControls | null) { activeBuildControls = next; },
    get cabinetGroup() { return cabinetGroup; },
    set cabinetGroup(next: THREE.Group | null) { cabinetGroup = next; },
    get params() { return params; },
    get selectedMesh() { return selectedMesh; }
  });
  const mountControls = () => buildModeController.mountControls();
  const afterParamsChanged = () => buildModeController.afterParamsChanged();
  const rebuild = () => buildModeController.rebuild();
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

  createTransformControllerResult = createTransformController({
    S,
    anyOverlap,
    anyOverlapIgnoring,
    applyWallConstraints,
    autoOrientModuleToRoomWallIfSnapped,
    cloneSectionParams,
    detectModuleAdjacency,
    dragState,
    findInstance,
    fromMmPoint,
    inferKitchenPlacementBinding,
    instanceFitsRoom,
    instanceWorldBox,
    instances,
    layoutTool,
    marquee,
    measureState,
    mmDist,
    mode,
    moduleOverlapsKitchenWorktops,
    moduleOverlapsWalls,
    mountProps,
    nudgePinnedModuleChain,
    pinnedWallIds,
    rebuildWall,
    rebuildWallPlanMesh,
    sections,
    selectedInstanceId,
    selectedInstanceIds,
    selectedKind,
    selectedSectionId,
    selectedWallId,
    selectedWallIds,
    setUnderlayStatus,
    snapPositionDetailed,
    toMmPoint,
    transformState,
    underlayCal,
    updateLayoutPanel,
    updateSectionVisual,
    updateSelectionHighlights,
    viewMode,
    wallEditHud,
    wallJoinTolMm,
    walls,
    windowDragState
  });

  createInstanceRebuilderResult = createInstanceRebuilder({
    S,
    anyOverlap,
    applyWallConstraints,
    args,
    buildModule,
    chooseResizeAnchorSide,
    collectAdjacentModuleInfos,
    disposeObject3D,
    ensurePickAndOutline,
    findInstance,
    footprintExtentsMatchXZ,
    getModuleLocalKitchenAnchor,
    inferKitchenPlacementBinding,
    inferTallResizeAnchorSide,
    instanceFitsLayoutBounds,
    instanceWorldBox,
    instances,
    isCornerKitchenModule,
    get lastRebuildDebug() { return lastRebuildDebug; }, set lastRebuildDebug(next) { lastRebuildDebug = next; },
    moduleOverlapsKitchenWorktops,
    moduleOverlapsWalls,
    moduleRootLocalBox,
    normalizeModuleParamsForSource,
    preserveAnchoredResizeSide,
    preserveWorldKitchenAnchor,
    propagateCornerResizeToPinnedNeighbors,
    propagateModuleResizeToPinnedNeighbors,
    renderErrors,
    tagModuleGeometry,
    updateLayoutPanel,
    validateModule
  });

  installKeyboardInputHandlers({
    S,
    get activeViewerTab() { return activeViewerTab; }, set activeViewerTab(next) { activeViewerTab = next; },
    addWall,
    anyOverlap,
    applyRotateAngle,
    applyWallConstraints,
    autoJoinAtMmPoint,
    autoOrientModuleToRoomWallIfSnapped,
    cam,
    cancelPlacement,
    clearTransform,
    clearWallDrawState,
    commitHistory,
    commitKitchenWorktopTypedLength,
    deleteInstance,
    deleteWall,
    discardFloorBoundaryEdit,
    dragState,
    findInstance,
    floorEdit,
    getKitchenPlacementConstraint,
    handleLayoutEscape,
    helpers,
    inferKitchenPlacementBinding,
    instanceFitsRoom,
    instances,
    isTypingTarget,
    kitchenWorktopDraw,
    get layoutTool() { return layoutTool; }, set layoutTool(next) { layoutTool = next; },
    marquee,
    measureState,
    mirrorKitchenWorktopDraw,
    get mode() { return mode; }, set mode(next) { mode = next; },
    moduleOverlapsKitchenWorktops,
    moduleOverlapsWalls,
    mountProps,
    nudgePinnedModuleChain,
    pinnedWallIds,
    placement,
    placementHelpers,
    rebuildWall,
    rebuildWallPlanMesh,
    redo,
    renderFloorBoundaryEdit,
    sectionDraw,
    sections,
    selectedInstanceId,
    selectedInstanceIds,
    get selectedKind() { return selectedKind; }, set selectedKind(next) { selectedKind = next; },
    selectedSectionId,
    get selectedWallId() { return selectedWallId; }, set selectedWallId(next) { selectedWallId = next; },
    selectedWallIds,
    setSelectedModule,
    setSelectedWall,
    setToolAlign,
    setToolSelect,
    setToolTrim,
    setToolWall,
    setUnderlayStatus,
    snapPositionDetailed,
    startTransformFromSelection,
    transformState,
    underlayCal,
    undo,
    updateLayoutPanel,
    updateSectionDrawPreview,
    updateSectionVisual,
    updateWallMeshWithJustification,
    get viewMode() { return viewMode; }, set viewMode(next) { viewMode = next; },
    wallDefault,
    wallDraw,
    wallEditHud,
    wallEndpointWhich,
    wallJoinTolMm,
    wallTypedHud,
    walls,
    windowDragState
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

  createViewModeControllerResult = createViewModeController({
    S,
    args,
    buildUi,
    cancelPlacement,
    clearAllMeasurements,
    clearOverlapHighlight,
    clearWallDrawState,
    drawOrthoToggleEl,
    drawSnapOverlay,
    ensurePickAndOutline,
    floors,
    handleKitchenWorktopEscape,
    hideHoverCursor,
    instanceEditorHost,
    instances,
    kitchenWorktopDraw,
    kitchenWorktops,
    layoutRoot,
    layoutUi,
    makeKitchenWorktopOutlineGeometry,
    measureState,
    mountControls,
    mountProps,
    partsBuildHost,
    partsLayoutHost,
    placement,
    placementHelpers,
    rebuild,
    rebuildWallPlanMesh,
    selectMesh,
    setInstanceSelected,
    setPlanPresentation,
    setSelectedFloor,
    setSelectedModule,
    setSelectedSection,
    setSelectedWall,
    setSelectedWindow,
    setViewMode,
    showNoProps,
    syncDetailClippingAndMaterials,
    syncViewerTabs,
    updateAllSectionVisuals,
    updateDetailSliceOverlay,
    updateLayoutPanel,
    updateSelectionHighlights,
    view2d,
    viewNavigation,
    wallPlanGroup,
    wallSnapMarkers,
    walls,
    windowEditorHost,
    get activeDetailClipPlanes() { return activeDetailClipPlanes; }, set activeDetailClipPlanes(next) { activeDetailClipPlanes = next; },
    get activeViewerTab() { return activeViewerTab; }, set activeViewerTab(next) { activeViewerTab = next; },
    get cabinetGroup() { return cabinetGroup; },
    get layoutTool() { return layoutTool; }, set layoutTool(next) { layoutTool = next; },
    get mode() { return mode; }, set mode(next) { mode = next; },
    get selectedFloorId() { return selectedFloorId; },
    get selectedInstanceId() { return selectedInstanceId; },
    get selectedKind() { return selectedKind; }, set selectedKind(next) { selectedKind = next; },
    get selectedSectionId() { return selectedSectionId; },
    get selectedWallId() { return selectedWallId; }, set selectedWallId(next) { selectedWallId = next; },
    get viewMode() { return viewMode; }, set viewMode(next) { viewMode = next; },
    get windowInst() { return windowInst; }
  });

  setMode("layout");
  history.current = captureLayoutSnapshot(S);
  history.past = [];
  history.future = [];
  updateUndoRedoUi(S);

  let createWallEditHudUpdaterResult!: ReturnType<typeof createWallEditHudUpdater>;
  function updateWallEditHud(...args: Parameters<ReturnType<typeof createWallEditHudUpdater>["updateWallEditHud"]>) { return createWallEditHudUpdaterResult.updateWallEditHud(...args); }

  createWallEditHudUpdaterResult = createWallEditHudUpdater({
    cam,
    clamp,
    fromMmPoint,
    hideWallEditHud,
    layoutTool,
    measureState,
    mmDist,
    mode,
    renderer,
    selectedKind,
    selectedWallId,
    viewMode,
    wallEditHud,
    walls,
    worldToScreen
  });

  const updateModuleEditHud = () => {
    hideModuleEditHud();
  };

  const measureSelectionActions = createMeasureSelectionActions({
    S,
    measureState,
    walls,
    floors,
    instances,
    kitchenWorktops,
    getAssociativeMeasureContext,
    updateMeasurementGeometry,
    getSelectedKind: () => selectedKind,
    getSelectedWallId: () => selectedWallId,
    getSelectedInstanceId: () => selectedInstanceId,
    getSelectedFloorId: () => selectedFloorId,
    getSelectedKitchenGroupId: () => selectedKitchenGroupId,
    wallEndpointWhich,
    setWallEndpointMm,
    rebuildWall,
    autoJoinAtMmPoint,
    rebuildWallPlanMesh,
    wallJoinTolMm,
    findInstance,
    instanceFitsRoom,
    anyOverlap,
    moduleOverlapsWalls,
    moduleOverlapsKitchenWorktops,
    inferKitchenPlacementBinding,
    rebuildFloor,
    rebuildKitchenWorktop,
    applyKitchenPlacementBinding,
    findKitchenWorktop,
    updateSelectionHighlights,
    updateLayoutPanel
  });
  const refreshAssociativeMeasures = measureSelectionActions.refreshAssociativeMeasures;
  const getCurrentMeasureSelectionTarget = measureSelectionActions.getCurrentMeasureSelectionTarget;
  const translateWallByMeasure = measureSelectionActions.translateWallByMeasure;
  const translateModuleByMeasure = measureSelectionActions.translateModuleByMeasure;
  const translateFloorByMeasure = measureSelectionActions.translateFloorByMeasure;
  const translateKitchenGroupByMeasure = measureSelectionActions.translateKitchenGroupByMeasure;
  const alignKitchenWorktopLine = measureSelectionActions.alignKitchenWorktopLine;

  let createModuleAdjacencySnapResolverResult!: ReturnType<typeof createModuleAdjacencySnapResolver>;
  function resolveModuleAdjacencySnap(...args: Parameters<ReturnType<typeof createModuleAdjacencySnapResolver>["resolveModuleAdjacencySnap"]>) { return createModuleAdjacencySnapResolverResult.resolveModuleAdjacencySnap(...args); }

  createModuleAdjacencySnapResolverResult = createModuleAdjacencySnapResolver({
    S,
    applyKitchenPlacementBinding,
    clampNumber,
    getKitchenGuideSegmentInfo,
    getModuleLocalBackCenter,
    inferKitchenPlacementBinding,
    isCornerKitchenModule,
    kitchenWorktops,
    snapPositionDetailed
  });

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

  let createMeasureValueCommitterResult!: ReturnType<typeof createMeasureValueCommitter>;
  function commitSelectedMeasureValueMm(...args: Parameters<ReturnType<typeof createMeasureValueCommitter>["commitSelectedMeasureValueMm"]>) { return createMeasureValueCommitterResult.commitSelectedMeasureValueMm(...args); }

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

  createMeasureValueCommitterResult = createMeasureValueCommitter({
    S,
    commitHistory,
    getAssociativeMeasureContext,
    getCurrentMeasureSelectionTarget,
    getSelectionMeasureBindings,
    measureState,
    mountProps,
    refreshAssociativeMeasures,
    resolvePlanBinding,
    translateFloorByMeasure,
    translateKitchenGroupByMeasure,
    translateModuleByMeasure,
    translateWallByMeasure,
    updateLayoutPanel,
    updateMeasureLabelInteractivity
  });

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
