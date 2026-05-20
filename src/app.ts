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
  cloneSectionParams
} from "./app/sectionViews";
import {
  createSelectionHighlights,
  createToolHud,
  createUnderlayController,
  createWallSnapMarkers
} from "./app/layoutVisuals";
import { createViewerDownbar, createViewerTabs, resolveAppArgs, type AppArgs } from "./app/bootstrap";
import type {
  AlignPickedLine,
  ColumnInstance,
  ColumnParams,
  DoorInstance,
  DoorParams,
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
import { createEditorShell } from "./ui/createEditorShell";
import { disposeObject3D } from "./core/dispose";
import { getModuleDescriptors } from "./modules/registry";
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
import { createPropertiesPanelAdapter } from "./ui/propertiesPanelAdapter";
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
import { createWardrobeEditMode } from "./layout/wardrobeEditMode";
import {
  updateUndoRedoUi,
  commitHistory,
  undo,
  redo,
  captureLayoutSnapshot,
  restoreLayoutSnapshot,
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
import { createProjectActions } from "./app/project/projectActions";
import { createLayoutExportPayload } from "./app/layoutExport";
import { createRenderControls, type RenderMode } from "./app/renderControls";
import { renderAppFrame } from "./app/frameRenderer";
import { createModulePlacementHelpers, type AdjacentModuleInfo, type ModulePlacementSnapOptions } from "./app/modulePlacementHelpers";
import {
  footprintExtentsMatchXZ,
  instanceVisualWorldBox,
  moduleRootLocalBox,
  tagModuleGeometry
} from "./app/moduleVisualGeometry";
import { getInstallState, promptAppInstall, subscribeInstallState } from "./pwa/installController";
import { installKitchenDebugApi } from "./app/kitchenDebugApi";
import { createWallController, type WallPlanMultiPolygon } from "./app/wallController";
import { DEFAULT_WALL_TYPE_ID } from "./app/wallTypes";
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
import { createProjectHeader } from "./ui/project/projectHeader";
import { createProjectMenuActions } from "./ui/project/projectSaveActions";
import type { ProjectSaveFile } from "./core/project-save/project-save-types";
import { createToolModeController } from "./app/toolModeController";
import { createSelectionController } from "./app/selectionController";
import { createBuildModeController } from "./app/buildModeController";
import { createModuleAdjacencySnapResolver } from "./app/moduleAdjacencySnapResolver";
import { createWallEditHudUpdater } from "./app/wallEditHudUpdater";
import { createWindowControlsController } from "./app/windowControlsController";
import { createDoorControlsController } from "./app/doorControlsController";
import { createClassicTopbarController } from "./app/classicTopbarController";
import { createMeasureSelectionActions } from "./app/measureSelectionActions";
import { createRoomWallDefinitions } from "./app/wallDefinitions";
import { createDetailViewController } from "./app/detailViewController";
import { createLayoutSceneQueries } from "./app/layoutSceneQueries";
import { createInstanceActionsController } from "./app/instanceActionsController";
import { createKitchenWorktopDrawController } from "./app/kitchenWorktopDrawController";
import { createMeasurePlanSnapController } from "./app/measurePlanSnapController";
import { createEditHudController } from "./app/editHudController";
import { createWallEditDragController } from "./app/wallEditDragController";
import { createViewPropertiesController } from "./app/viewPropertiesController";
import { createModuleSelectionController } from "./app/moduleSelectionController";
import { createLayoutActionsController } from "./app/layoutActionsController";
import { createWindowInstanceController } from "./app/windowInstanceController";
import { createDoorInstanceController } from "./app/doorInstanceController";
import { createColumnController } from "./app/columnController";
import { createKitchenWorktopSelectionController } from "./app/kitchenWorktopSelectionController";
import { createViewDisplayController } from "./app/viewDisplayController";
import { createVisibilityController, type VisibilityTarget } from "./app/visibilityController";
import { getEnabledModulePackageDefinitions } from "./core/catalog/module-catalog";
import {
  createDefaultModulePackageParameters,
  resolveModulePackageComponentAssignments,
  resolveModulePackageMaterialAssignments
} from "./core/module-package/runtime/module-runtime-adapter";
import { createModulePackageControls, findModulePackageForParams } from "./core/module-package/runtime/module-package-controls";

export function startApp(initialArgs: AppArgs) {
  const args = resolveAppArgs(initialArgs);
  const clientCatalog = args.clientCatalog;
  const modulePackages = args.modulePackages;

  type ParamHighlightControls = {
    highlightParamKeys?: (keys: string[]) => void;
    clearHighlights?: () => void;
  };

  const enabledModulePackages = getEnabledModulePackageDefinitions(clientCatalog, modulePackages);
  const runtimeDescriptorsByType = new Map<string, ReturnType<typeof getModuleDescriptors>[number]>(
    getModuleDescriptors().map((descriptor) => [descriptor.type, descriptor])
  );
  const availableModuleDescriptors = enabledModulePackages
    .map((modulePackage) => runtimeDescriptorsByType.get(modulePackage.module.moduleType))
    .filter((descriptor): descriptor is ReturnType<typeof getModuleDescriptors>[number] => !!descriptor);
  const hasImportedModules = availableModuleDescriptors.length > 0;
  const noModulesMessage =
    "No tenant module packages are enabled for this client.";
  let exportActions: ReturnType<typeof createExportActions> | null = null;
  const downloadViewportPng = () => exportActions?.downloadViewportPng();
  const firstModulePackage = enabledModulePackages.find((modulePackage) =>
    availableModuleDescriptors.some((descriptor) => descriptor.type === modulePackage.module.moduleType)
  );
  const createParamsFromModulePackage = (modulePackage: NonNullable<typeof firstModulePackage>) => ({
    ...createDefaultModulePackageParameters(modulePackage),
    materialAssignments: resolveModulePackageMaterialAssignments({ modulePackage, catalog: clientCatalog }),
    componentAssignments: resolveModulePackageComponentAssignments({ modulePackage, catalog: clientCatalog }),
    type: modulePackage.module.moduleType
  } as ModuleParams);
  let params: ModuleParams = hasImportedModules
    ? createParamsFromModulePackage(firstModulePackage!)
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
    setPresentationMode,
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
  const viewDisplay = createViewDisplayController(scene);
  let activeViewerTab = "3d";

  type LayoutTool = "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";
  let layoutTool: LayoutTool = "select";
  let viewNavigation: ReturnType<typeof createViewNavigation>;
  let detailViewController!: ReturnType<typeof createDetailViewController>;
  const getNavigationSceneBounds = () => detailViewController.getNavigationSceneBounds();
  const syncDetailClippingAndMaterials = () => detailViewController.syncDetailClippingAndMaterials();
  const updateDetailSliceOverlay = () => detailViewController.updateDetailSliceOverlay();
  const refreshViewerTabs = () => detailViewController.refreshViewerTabs();
  const isCustomOrthoView = () => detailViewController.isCustomOrthoView();
  const ensureFloorplanViewerTab = () => detailViewController.ensureFloorplanViewerTab();
  const activateViewerTab = (key: string) => detailViewController.activateViewerTab(key);
  const updateDetailViewCamera = () => detailViewController.updateDetailViewCamera();

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

  const setViewerDisplayMode = (displayMode: ReturnType<typeof viewDisplay.getMode>) => {
    viewDisplay.setMode(displayMode);
    setPresentationMode(displayMode === "realistic" ? "realistic" : "solid");
    if (displayMode !== "realistic") {
      renderMode = "realtime";
      ssgi?.dispose();
      ssgi = null;
      ssgiCameraUuid = null;
      photo?.dispose();
      photo = null;
      photoCameraUuid = null;
      photoLastLightingRevision = -1;
    }
    syncViewerDownbar();
  };

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
    getWalls: () => walls,
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
    hasUnderlaySource,
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

  const windows: WindowInstance[] = [];
  let windowCounter = 1;
  let windowInst: WindowInstance | null = null;
  const doors: DoorInstance[] = [];
  let doorCounter = 1;
  let doorInst: DoorInstance | null = null;
  let selectedKind: SelectedKind = null;
  let selectedKitchenGroupId: string | null = null;
  let selectedFloorId: string | null = null;
  let selectedColumnId: string | null = null;
  let selectedSectionId: string | null = null;
  let kitchenMode: ReturnType<typeof createKitchenEditMode> | null = null;
  let wardrobeMode: ReturnType<typeof createWardrobeEditMode> | null = null;

  const walls: WallInstance[] = [];
  let wallCounter = 1;
  const wallJoinTolMm = 25;
  const wallDefault = {
    typeId: DEFAULT_WALL_TYPE_ID,
    thicknessMm: 150,
    heightMm: 2600,
    materialId: "default",
    justification: "center" as "center" | "interior" | "exterior",
    exteriorSign: 1 as 1 | -1
  };

  const floors: FloorInstance[] = [];
  let floorCounter = 1;
  const columns: ColumnInstance[] = [];
  let columnCounter = 1;
  const sections: SectionInstance[] = [];
  let sectionCounter = 1;
  const floorDefault = {
    heightMm: 0,
    thicknessMm: 150,
    materialId: "mat_grey_corpus"
  };

  const kitchenWorktops: KitchenWorktopInstance[] = [];
  let worktopCounter = 1;

  const getVisibilityTargets = (): VisibilityTarget[] => {
    const targets: VisibilityTarget[] = [
      ...instances.map((inst) => ({ key: `module:${inst.id}`, root: inst.root })),
      ...walls.map((wall) => ({ key: `wall:${wall.id}`, root: wall.root })),
      ...floors.map((floor) => ({ key: `floor:${floor.id}`, root: floor.root })),
      ...columns.map((column) => ({ key: `column:${column.id}`, root: column.root })),
      ...sections.map((section) => ({ key: `section:${section.id}`, root: section.root })),
      ...kitchenWorktops.map((worktop) => ({ key: `worktop:${worktop.id}`, root: worktop.root })),
      ...(wardrobeMode?.getVisibilityTargets() ?? [])
    ];
    targets.push(...windows.map((window) => ({ key: `window:${window.id}`, root: window.root })));
    targets.push(...doors.map((door) => ({ key: `door:${door.id}`, root: door.root })));
    if (hasUnderlaySource()) targets.push({ key: "underlay:main", root: underlayMesh });
    return targets;
  };

  const getSelectedVisibilityTargetKeys = () => {
    if (selectedInstanceIds.size > 0) return Array.from(selectedInstanceIds, (id) => `module:${id}`);
    if (selectedWallIds.size > 0) return Array.from(selectedWallIds, (id) => `wall:${id}`);
    if (selectedKind === "floor" && selectedFloorId) return [`floor:${selectedFloorId}`];
    if (selectedKind === "column" && selectedColumnId) return [`column:${selectedColumnId}`];
    if (selectedKind === "section" && selectedSectionId) return [`section:${selectedSectionId}`];
    if (selectedKind === "window" && windowInst) return [`window:${windowInst.id}`];
    if (selectedKind === "door" && doorInst) return [`door:${doorInst.id}`];
    if (selectedKind === "underlay") return ["underlay:main"];
    const wardrobeKeys = wardrobeMode?.getSelectedVisibilityTargetKeys() ?? [];
    if (wardrobeKeys.length > 0) return wardrobeKeys;
    return [];
  };

  let syncClassicTopbarVisibility = () => {};
  let syncViewerDownbar = () => {};
  const visibilityController = createVisibilityController({
    getAllTargets: getVisibilityTargets,
    getSelectedTargetKeys: getSelectedVisibilityTargetKeys,
    onChanged: () => {
      args.viewerEl.classList.toggle("viewer-show-hidden", visibilityController.showHidden && visibilityController.hasHiddenObjects());
      viewDisplay.sync();
      syncClassicTopbarVisibility();
      syncViewerDownbar();
    }
  });
  const viewerDownbar = createViewerDownbar(args.viewerEl, {
    getMode: () => viewDisplay.getMode(),
    setMode: setViewerDisplayMode,
    hidden: {
      hasHiddenObjects: () => visibilityController.hasHiddenObjects(),
      isShowHidden: () => visibilityController.showHidden,
      toggleShowHidden: () => visibilityController.toggleShowHidden()
    }
  });
  syncViewerDownbar = viewerDownbar.sync;

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

  const kitchenCtx = resolveContext(makeDefaultKitchenContext(clientCatalog));


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
  S.columns = columns;
  S.columnCounter = columnCounter;
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
  S.selectedColumnId = selectedColumnId;
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
    S.selectedColumnId = selectedColumnId;
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
  const setWallEndpointAndConnectedMm = (...args: Parameters<ReturnType<typeof createWallController>["setWallEndpointAndConnectedMm"]>) => wallController.setWallEndpointAndConnectedMm(...args);
  const setWallEndpointsAndConnectedMm = (...args: Parameters<ReturnType<typeof createWallController>["setWallEndpointsAndConnectedMm"]>) => wallController.setWallEndpointsAndConnectedMm(...args);
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
  const rebuildWall = (...args: Parameters<ReturnType<typeof createWallController>["rebuildWall"]>) => {
    const result = wallController.rebuildWall(...args);
    syncDetailClippingAndMaterials();
    return result;
  };
  const addWall = (...args: Parameters<ReturnType<typeof createWallController>["addWall"]>) => wallController.addWall(...args);
  const duplicateWall = (...args: Parameters<ReturnType<typeof createWallController>["duplicateWall"]>) => wallController.duplicateWall(...args);



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
    getWallChainStart: () => wallDraw.chainStart,
    catalog: clientCatalog,
    modulePackages
  });

  const layoutSceneQueries = createLayoutSceneQueries({
    instances,
    kitchenWorktops,
    walls,
    columns,
    floors,
    sections,
    roomBounds,
    getWindowInst: () => windowInst,
    getWindowInsts: () => windows,
    getDoorInst: () => doorInst,
    getDoorInsts: () => doors,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    getModuleLocalBackCenter
  });
  const findInstance = layoutSceneQueries.findInstance;
  const instanceLayoutWorldBox = layoutSceneQueries.instanceLayoutWorldBox;
  const instanceWorldBox = layoutSceneQueries.instanceWorldBox;
  const instanceFitsRoom = layoutSceneQueries.instanceFitsRoom;
  const instanceFitsLayoutBounds = layoutSceneQueries.instanceFitsLayoutBounds;
  const roomContainsBoxXZ = layoutSceneQueries.roomContainsBoxXZ;
  const ensurePickAndOutline = layoutSceneQueries.ensurePickAndOutline;
  const getInstanceGeometryMeshes = layoutSceneQueries.getInstanceGeometryMeshes;
  const getAllInstanceGeometryMeshes = layoutSceneQueries.getAllInstanceGeometryMeshes;
  const getKitchenWorktopGeometryMeshes = layoutSceneQueries.getKitchenWorktopGeometryMeshes;
  const getMeasure3DSnapTargetObject = layoutSceneQueries.getMeasure3DSnapTargetObject;
  const getLayoutMeasureMeshes3d = layoutSceneQueries.getLayoutMeasureMeshes3d;
  const getInstanceIdFromObject = layoutSceneQueries.getInstanceIdFromObject;
  const getWorktopIdFromObject = layoutSceneQueries.getWorktopIdFromObject;
  const getSectionIdFromObject = layoutSceneQueries.getSectionIdFromObject;
  const getColumnIdFromObject = layoutSceneQueries.getColumnIdFromObject;
  const getDoorIdFromObject = layoutSceneQueries.getDoorIdFromObject;
  const getSectionPickMeshes = layoutSceneQueries.getSectionPickMeshes;
  const getColumnPickMeshes = layoutSceneQueries.getColumnPickMeshes;
  const findKitchenWorktop = layoutSceneQueries.findKitchenWorktop;
  const keepStickyPlanSnap = layoutSceneQueries.keepStickyPlanSnap;

  let instanceActionsController!: ReturnType<typeof createInstanceActionsController>;
  function createInstance(...args: Parameters<ReturnType<typeof createInstanceActionsController>["createInstance"]>) {
    return instanceActionsController.createInstance(...args);
  }
  function duplicateInstance(...args: Parameters<ReturnType<typeof createInstanceActionsController>["duplicateInstance"]>) {
    return instanceActionsController.duplicateInstance(...args);
  }
  function deleteInstance(...args: Parameters<ReturnType<typeof createInstanceActionsController>["deleteInstance"]>) {
    return instanceActionsController.deleteInstance(...args);
  }

  instanceActionsController = createInstanceActionsController({
    S,
    instances,
    layoutRoot,
    clientCatalog,
    getMode: () => mode,
    getInstanceCounter: () => instanceCounter,
    setInstanceCounter: (next) => { instanceCounter = next; },
    findInstance,
    getSelectedInstanceId: () => selectedInstanceId,
    ensurePickAndOutline,
    placeWithoutOverlap,
    inferKitchenPlacementBinding,
    setSelectedModule,
    updateLayoutPanel
  });

  let kitchenWorktopDrawController!: ReturnType<typeof createKitchenWorktopDrawController>;
  const startKitchenWorktopDraw = () => kitchenWorktopDrawController.startKitchenWorktopDraw();
  const appendKitchenWorktopPoint = (point: FloorBoundaryPoint) => kitchenWorktopDrawController.appendKitchenWorktopPoint(point);
  const commitKitchenWorktopTypedLength = () => kitchenWorktopDrawController.commitKitchenWorktopTypedLength();
  const mirrorKitchenWorktopDraw = () => kitchenWorktopDrawController.mirrorKitchenWorktopDraw();

  let sectionDrawController!: ReturnType<typeof createSectionDrawController>;
  const updateSectionDrawPreview = () => sectionDrawController.updateSectionDrawPreview();
  const cancelSectionDraw = (opts?: { silent?: boolean }) => sectionDrawController.cancelSectionDraw(opts);
  const commitSectionDraw = (bMm: FloorBoundaryPoint) => sectionDrawController.commitSectionDraw(bMm);

  const handleKitchenWorktopEscape = () => kitchenWorktopDrawController.handleKitchenWorktopEscape();

  const wallDefs = createRoomWallDefinitions(roomBounds);

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
    wall: null as string | null,
    offsetMm: 0
  };
  const doorDragState = {
    active: false,
    wall: null as string | null,
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
      doorDragState.active ||
      Boolean(wallEditHud.drag) ||
      marquee.active ||
      marquee.pending ||
      floorEdit.active ||
      underlayDragState.active ||
      !!transformState.kind,
    getSceneBounds: () => getNavigationSceneBounds(),
    refreshDetailView: () => {
      detailViewController.activeDetailClipPlanes = [];
      updateDetailViewCamera();
      updateDetailSliceOverlay();
    }
  });
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
    cancelColumnPlacement,
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
    isColumnPlacementActive,
    isTypingTarget,
    layoutRoot,
    get measureState() { return measureState; },
    placement,
    get placementHelpers() { return placementHelpers; },
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
    get measurePlanSnap() { return measurePlanSnapController.measurePlanSnap; }, set measurePlanSnap(next: PlanSnapResult | null) { measurePlanSnapController.measurePlanSnap = next; },
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
        measurePlanSnapController.hasMeasureSnapCyclePoint
      ) {
        measurePlanSnapController.cycleMeasureSnap(ev.shiftKey ? -1 : 1, renderer.domElement.getBoundingClientRect());
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
    measurePlanSnapController.measurePlanSnap = null;
    resetMeasureSnapCycle();
    selectPlanSnap = null;
    clearColumnPlacementPreview();
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
  let selectPlanSnap: PlanSnapResult | null = null;
  let measurePlanSnapController!: ReturnType<typeof createMeasurePlanSnapController>;
  const resetMeasureSnapCycle = () => measurePlanSnapController.resetMeasureSnapCycle();
  const resolveMeasurePlanSnap = (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) =>
    measurePlanSnapController.resolveMeasurePlanSnap(hitPoint, rect, normalMode);
  const updateMeasureHoverFromPlanPoint = (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) =>
    measurePlanSnapController.updateMeasureHoverFromPlanPoint(hitPoint, rect, normalMode);

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

  kitchenWorktopDrawController = createKitchenWorktopDrawController({
    S,
    kitchenWorktopDraw,
    wallTypedHud,
    getWorktopCounter: () => worktopCounter,
    setWorktopDrawSnap: (next) => { worktopDrawSnap = next; },
    cancelKitchenWorktopDraw,
    cancelPlacement: () => cancelPlacement(S, placementHelpers),
    isPlacementActive: () => placement.active,
    ensureFloorplanViewerTab,
    clearSelectionForDraw: () => {
      selectedKind = null;
      selectedWallId = null;
      selectedFloorId = null;
      selectedInstanceId = null;
      selectedWallIds.clear();
      selectedInstanceIds.clear();
      setInstanceSelected(null);
    },
    syncSelectionState,
    updateSelectionHighlights,
    setUnderlayStatus: (text) => setUnderlayStatus(text),
    mountProps: () => mountProps(),
    scheduleKitchenWorktopPreviewUpdate,
    updateKitchenWorktopPreview,
    floorOrthoPoint: (start, raw) => floorOrthoPoint(start, raw),
    makeKitchenWorktopParamsFromPath,
    getKitchenGroupWorktops,
    replaceKitchenGroupWorktops
  });

  measurePlanSnapController = createMeasurePlanSnapController({
    measureState,
    measureReadoutEl: args.measureReadoutEl,
    hudHoverLine,
    getCamera: cam,
    snapPoint2D,
    updateHoverCursor,
    hudLineThicknessM,
    updateHudLine,
    updatePreview,
    clearPreview,
    setFirstPointMarker
  });

  const {
    buildUi,
    layoutUi,
    modelSelect,
    editorHost,
    view2d,
    instanceEditorHost,
    windowEditorHost,
    partsBuildHost,
    partsLayoutHost
  } = createEditorShell({
    formEl: args.formEl,
    partsEl: args.partsEl,
    hasImportedModules,
    availableModuleDescriptors
  });

  detailViewController = createDetailViewController({
    renderer,
    getCamera: cam,
    getControls: ctl,
    view2d,
    setView2d: (enabled) => setView2d(enabled),
    setExtraTabs,
    syncViewerTabs,
    viewNavigation,
    detailSliceGroup,
    walls,
    floors,
    instances,
    kitchenWorktops,
    sections,
    getCabinetGroup: () => cabinetGroup,
    getWindowInst: () => windowInst,
    getMode: () => mode,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    setActiveViewerTab: (next) => { activeViewerTab = next; }
  });

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
      if (mode !== "realtime" && viewDisplay.getMode() !== "realistic") {
        viewDisplay.setMode("realistic");
        setPresentationMode("realistic");
        syncViewerDownbar();
      }
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
    getSelectedWallIds: () => selectedWallIds,
    setSelectedWallId: (next: string | null) => { selectedWallId = next; },
    getWallDebugEnabled: () => wallDebugEnabled,
    setWallSolvedJoinPolys: (next: Array<Array<{ x: number; z: number }>>) => { wallSolvedJoinPolys = next; },
    setWallUnionPolys: (next: WallPlanMultiPolygon | null) => { wallUnionPolys = next; },
    getWindowInst: () => windowInst,
    getWindowInsts: () => windows,
    getDoorInst: () => doorInst,
    getDoorInsts: () => doors,
    nextWallId: () => `w${wallCounter++}`
  });

  const editHudController = createEditHudController({
    S,
    wallEditHud,
    moduleEditHud,
    walls,
    wallJoinTolMm,
    findInstance,
    getMode: () => mode,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    getLayoutTool: () => layoutTool,
    isWallDrawActive: () => wallDraw.active,
    getSelectedKind: () => selectedKind,
    getSelectedWallId: () => selectedWallId,
    getSelectedInstanceId: () => selectedInstanceId,
    setWallEndpointMm,
    autoJoinAtMmPoint,
    rebuildWall,
    rebuildWallPlanMesh,
    rebuildInstance,
    mountProps: () => mountProps(),
    commitHistory: () => commitHistory(S)
  });
  const hideWallEditHud = editHudController.hideWallEditHud;
  const hideModuleEditHud = editHudController.hideModuleEditHud;
  editHudController.installInlineEditors();

  createWallEditDragController({
    wallEditHud,
    walls,
    renderer,
    pointerNdc,
    raycaster,
    groundPlane,
    wallJoinTolMm,
    getMode: () => mode,
    getViewMode: () => viewMode,
    getLayoutTool: () => layoutTool,
    isMeasureEnabled: () => measureState.enabled,
    getSelectedKind: () => selectedKind,
    getSelectedWallId: () => selectedWallId,
    getCamera: cam
  }).installHandleListeners();

  const ensureLayoutMode = () => {
    if (mode !== "layout") setMode("layout");
  };



  const {
    I_ALIGN,
    I_BOM,
    I_CABINET,
    I_CANCEL,
    I_COLUMN,
    I_COPY,
    I_DIM,
    I_DOOR,
    I_DONE,
    I_DUP,
    I_EXPORT,
    I_FLOOR,
    I_GRID2D,
    I_HIDE,
    I_INSTALL,
    I_ISOLATE,
    I_MEASURE,
    I_MOVE,
    I_REDO,
    I_RESET,
    I_ROTATE,
    I_SECTION,
    I_SELECT,
    I_STAIR,
    I_TRASH,
    I_TRIM,
    I_UNDERLAY,
    I_UNDO,
    I_UNHIDE,
    I_VIEW,
    I_WARDROBE,
    I_WINDOW,
    I_WALL
  } = topbarIcons;
  const tb = createTopbar(args.ribbonEl);
  const projectHeader = createProjectHeader(args.ribbonEl);
  tb.setChrome({
    title: "Kitchen Layout 2026 - Floor Plan",
    projectLabel: args.clientProfile?.company.name ?? "Project 1",
    tabs: [
      { id: "file", label: "File", accent: true },
      { id: "architecture", label: "Architecture", active: true },
      { id: "kitchen", label: "Kitchen" },
      { id: "livingWall", label: "Living Wall" },
      { id: "room", label: "Room" },
      { id: "modify", label: "Modify" },
      { id: "view", label: "View" }
    ]
  });
  projectHeader.render(null);

  const props = createPropertiesPanelAdapter(args.propertiesEl);

  const viewPropertiesController = createViewPropertiesController({
    props,
    walls,
    instances,
    kitchenWorktops,
    sections,
    getMode: () => mode,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    isDrawOrthoEnabled: () => drawOrthoEnabled
  });
  const showNoProps = viewPropertiesController.showNoProps;
  const mountActiveViewProps = viewPropertiesController.mountActiveViewProps;

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
    get placementHelpers() { return placementHelpers; },
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
  type WindowControlsApi = ReturnType<typeof createWindowControlsController>;
  let createWindowControlsControllerResult: WindowControlsApi | null = null;
  const requireWindowControls = () => {
    if (!createWindowControlsControllerResult) throw new Error("Window controls are not initialized.");
    return createWindowControlsControllerResult;
  };
  const addOrSelectWindow = () => {
    cancelDoorPlacement();
    return requireWindowControls().addOrSelectWindow();
  };
  const insertWindowAtWallPoint = (...args: Parameters<WindowControlsApi["insertWindowAtWallPoint"]>) => requireWindowControls().insertWindowAtWallPoint(...args);
  const updateWindowPlacementPreview = (...args: Parameters<WindowControlsApi["updateWindowPlacementPreview"]>) => createWindowControlsControllerResult?.updateWindowPlacementPreview(...args) ?? false;
  const clearWindowPlacementPreview = () => createWindowControlsControllerResult?.clearWindowPlacementPreview();
  const cancelWindowPlacement = () => createWindowControlsControllerResult?.cancelWindowPlacement() ?? false;
  const getWindowPlacementParams = () => createWindowControlsControllerResult?.getWindowPlacementParams() ?? null;
  const updateWindowPlacementParams = (...args: Parameters<WindowControlsApi["updateWindowPlacementParams"]>) => requireWindowControls().updateWindowPlacementParams(...args);
  const isWindowPlacementActive = () => createWindowControlsControllerResult?.isWindowPlacementActive() ?? false;
  const syncWindowSelectionVisuals = (...args: Parameters<WindowControlsApi["syncWindowSelectionVisuals"]>) => createWindowControlsControllerResult?.syncWindowSelectionVisuals(...args);
  const updateWindowTransform = (...args: Parameters<WindowControlsApi["updateWindowTransform"]>) => requireWindowControls().updateWindowTransform(...args);
  const mountWindowControls = (...args: Parameters<WindowControlsApi["mountWindowControls"]>) => createWindowControlsControllerResult?.mountWindowControls(...args);
  type DoorControlsApi = ReturnType<typeof createDoorControlsController>;
  let createDoorControlsControllerResult: DoorControlsApi | null = null;
  const requireDoorControls = () => {
    if (!createDoorControlsControllerResult) throw new Error("Door controls are not initialized.");
    return createDoorControlsControllerResult;
  };
  const addOrSelectDoor = () => {
    cancelWindowPlacement();
    return requireDoorControls().addOrSelectDoor();
  };
  const insertDoorAtWallPoint = (...args: Parameters<DoorControlsApi["insertDoorAtWallPoint"]>) => requireDoorControls().insertDoorAtWallPoint(...args);
  const updateDoorPlacementPreview = (...args: Parameters<DoorControlsApi["updateDoorPlacementPreview"]>) => createDoorControlsControllerResult?.updateDoorPlacementPreview(...args) ?? false;
  const clearDoorPlacementPreview = () => createDoorControlsControllerResult?.clearDoorPlacementPreview();
  const cancelDoorPlacement = () => createDoorControlsControllerResult?.cancelDoorPlacement() ?? false;
  const getDoorPlacementParams = () => createDoorControlsControllerResult?.getDoorPlacementParams() ?? null;
  const updateDoorPlacementParams = (...args: Parameters<DoorControlsApi["updateDoorPlacementParams"]>) => requireDoorControls().updateDoorPlacementParams(...args);
  const rotateDoorPlacement = () => createDoorControlsControllerResult?.rotateDoorPlacement() ?? false;
  const flipDoorPlacementSwingSide = () => createDoorControlsControllerResult?.flipDoorPlacementSwingSide() ?? false;
  const isDoorPlacementActive = () => createDoorControlsControllerResult?.isDoorPlacementActive() ?? false;
  const syncDoorSelectionVisuals = (...args: Parameters<DoorControlsApi["syncDoorSelectionVisuals"]>) => createDoorControlsControllerResult?.syncDoorSelectionVisuals(...args);
  const updateDoorTransform = (...args: Parameters<DoorControlsApi["updateDoorTransform"]>) => requireDoorControls().updateDoorTransform(...args);
  const columnController = createColumnController({
    S,
    layoutRoot,
    columns,
    wallDefault,
    getViewMode: () => viewMode,
    getActiveViewerTab: () => activeViewerTab,
    getColumnCounter: () => columnCounter,
    setColumnCounter: (next) => { columnCounter = next; },
    getSelectedColumnId: () => selectedColumnId,
    setSelectedColumnId: (next) => { selectedColumnId = next; }
  });
  const createColumn = columnController.createColumn;
  const rebuildColumn = columnController.rebuildColumn;
  const deleteColumn = columnController.deleteColumn;
  const restoreColumnsFromSnapshot = columnController.restoreColumnsFromSnapshot;
  const syncColumnPresentation = columnController.syncColumnPresentation;
  const syncColumnSelectionVisuals = columnController.syncColumnSelectionVisuals;
  let columnPlacementActive = false;
  const columnPlacementParams = columnController.defaultColumnParams({
    heightMm: wallDefault.heightMm,
    materialId: wallDefault.materialId
  });

  function isColumnPlacementActive() {
    return columnPlacementActive;
  }

  function updateColumnPlacementParams(patch: Partial<ColumnParams>) {
    Object.assign(columnPlacementParams, columnController.normalizeColumnParams({ ...columnPlacementParams, ...patch }));
    if (columnPlacementActive) columnController.updateColumnPlacementPreview(columnPlacementParams);
    return columnPlacementParams;
  }

  function clearColumnPlacementPreview() {
    columnController.clearColumnPlacementPreview();
  }

  function updateColumnPlacementPreview(pointMm: { x: number; z: number } | null) {
    if (!columnPlacementActive) return false;
    return columnController.updateColumnPlacementPreview(columnPlacementParams, pointMm);
  }

  function cancelColumnPlacement(opts?: { silent?: boolean }) {
    if (!columnPlacementActive) return false;
    columnPlacementActive = false;
    columnController.clearColumnPlacementPreview();
    selectPlanSnap = null;
    drawSnapOverlay.hide();
    hideHoverCursor();
    if (!opts?.silent) {
      setUnderlayStatus("Column: zrusene.");
      mountProps();
    }
    return true;
  }

  function insertColumnAtPoint(pointMm: { x: number; z: number }) {
    if (!columnPlacementActive) return false;
    updateColumnPlacementParams({ xMm: pointMm.x, zMm: pointMm.z });
    const column = createColumn(columnPlacementParams);
    setSelectedColumn(column.id);
    columnController.updateColumnPlacementPreview(columnPlacementParams, pointMm);
    setUnderlayStatus("Column: vlozeny. Klikni dalsie miesto alebo Esc.");
    mountProps();
    return true;
  }

  function addColumn() {
    ensureLayoutMode();
    ensureFloorplanViewerTab();
    if (placement.active) cancelPlacement(S, placementHelpers);
    cancelWindowPlacement();
    cancelDoorPlacement();
    setToolSelect();
    updateColumnPlacementParams({
      heightMm: columnPlacementParams.heightMm || wallDefault.heightMm,
      materialId: columnPlacementParams.materialId || wallDefault.materialId
    });
    selectPlanSnap = null;
    drawSnapOverlay.hide();
    columnPlacementActive = true;
    selectedKind = null;
    selectedColumnId = null;
    syncSelectionState();
    syncColumnSelectionVisuals();
    setUnderlayStatus("Column: nastav parametre a klikni miesto v podoryse. Esc zrusi.");
    mountProps();
  }
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
    catalog: clientCatalog,
    getAllMaterials: () => clientCatalog.legacyMaterials.filter((material) => material.is_public),
    getMaterialDefinitionById: (id) => clientCatalog.materials.find((material) => material.id === id) ?? null,
    columns,
    get columnPlacementParams() { return columnPlacementActive ? columnPlacementParams : null; },
    modulePackages,
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
    get placementHelpers() { return placementHelpers; },
    props,
    rebuildColumn,
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
    wallJoinTolMm,
    updateColumnPlacementParams,
    wallDefault,
    wallDraw,
    walls,
    get windowInst() { return windowInst; },
    get windowPlacementParams() { return getWindowPlacementParams(); },
    updateWindowTransform: (inst: WindowInstance) => updateWindowTransform(inst),
    updateWindowPlacementParams,
    get doorInst() { return doorInst; },
    get doorPlacementParams() { return getDoorPlacementParams(); },
    updateDoorTransform: (inst: DoorInstance) => updateDoorTransform(inst),
    updateDoorPlacementParams,
    isColumnPlacementActive,
    isWindowPlacementActive,
    isDoorPlacementActive,
    get wardrobeMode() { return wardrobeMode; },
    get drawOrthoEnabled() { return drawOrthoEnabled; },
    get kitchenMode() { return kitchenMode; },
    get layoutTool() { return layoutTool; },
    get mode() { return mode; },
    get selectedFloorId() { return selectedFloorId; },
    get selectedColumnId() { return selectedColumnId; },
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
    catalog: clientCatalog,
    setWorktopDrawSnap: (next: PlanSnapResult | null) => { worktopDrawSnap = next; },
    nextWorktopId: () => `wt${worktopCounter++}`,
    ensureWorktopCounter: (next: number) => { worktopCounter = Math.max(worktopCounter, next); S.worktopCounter = worktopCounter; },
    setWorktopCounter: (next: number) => { worktopCounter = next; S.worktopCounter = worktopCounter; },
    syncWorktopCounter: () => { S.worktopCounter = worktopCounter; }
  });

  helpers = {
    setSelectedWall,
    setSelectedFloor,
    setSelectedColumn,
    setSelectedModule,
    updateSelectionHighlights,
    disposeObject3D,
    createInstance,
    createWallMesh,
    createWallOutline,
    rebuildWall,
    rebuildWallPlanMesh,
    restoreFloors: restoreFloorsFromSnapshot,
    restoreColumns: restoreColumnsFromSnapshot,
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
    resolvePlacementConstraint: getKitchenPlacementConstraint,
    catalog: clientCatalog,
    modulePackages
  };


  let rebuildStandardTopbar = () => {};
  const deleteKitchenGroup = (groupId: string) => {
    if (!groupId) return false;
    if (S.kitchenEditMode && S.activeKitchenGroupId === groupId) {
      kitchenMode?.exitDiscard();
    }

    let deleted = false;
    for (let index = kitchenWorktops.length - 1; index >= 0; index -= 1) {
      const worktop = kitchenWorktops[index]!;
      if (worktop.kitchenGroupId !== groupId) continue;
      removeKitchenWorktop(worktop.id, { skipHistory: true });
      deleted = true;
    }
    for (let index = instances.length - 1; index >= 0; index -= 1) {
      const inst = instances[index]!;
      if (inst.kitchenGroupId !== groupId) continue;
      deleteInstance(inst.id);
      deleted = true;
    }
    const groupIndex = S.kitchenGroups.findIndex((group) => group.id === groupId);
    if (groupIndex >= 0) {
      S.kitchenGroups.splice(groupIndex, 1);
      deleted = true;
    }
    if (!deleted) return false;

    if (S.activeKitchenGroupId === groupId) S.activeKitchenGroupId = null;
    if (selectedKitchenGroupId === groupId) selectedKitchenGroupId = null;
    selectedInstanceIds.clear();
    updateLayoutPanel();
    updateSelectionHighlights();
    return true;
  };

  const deleteWindow = () => {
    const target = windowInst;
    if (!target) return false;
    const wallId = target.params.wallId;
    const wall = wallId ? walls.find((item) => item.id === wallId) ?? null : null;
    target.root.parent?.remove(target.root);
    disposeObject3D(target.root);
    const idx = windows.findIndex((item) => item.id === target.id);
    if (idx >= 0) windows.splice(idx, 1);
    windowInst = null;
    const remainingWindow = windows[windows.length - 1] ?? null;
    if (remainingWindow) {
      updateWindowTransform(remainingWindow);
    } else {
      setWindowOpening(null);
      setWindowCutout(null);
    }
    syncWindowSelectionVisuals(false);
    if (wall) rebuildWall(wall);
    rebuildWallPlanMesh();
    return true;
  };

  const deleteDoor = () => {
    const target = doorInst;
    if (!target) return false;
    const wallId = target.params.wallId;
    const wall = wallId ? walls.find((item) => item.id === wallId) ?? null : null;
    target.root.parent?.remove(target.root);
    disposeObject3D(target.root);
    const idx = doors.findIndex((item) => item.id === target.id);
    if (idx >= 0) doors.splice(idx, 1);
    doorInst = null;
    const remainingDoor = doors[doors.length - 1] ?? null;
    if (remainingDoor) updateDoorTransform(remainingDoor);
    syncDoorSelectionVisuals(false);
    if (wall) rebuildWall(wall);
    rebuildWallPlanMesh();
    return true;
  };

  const deleteUnderlay = () => {
    if (!hasUnderlaySource()) return false;
    clearUnderlay();
    return true;
  };

  const layoutActionsController = createLayoutActionsController({
    view2d,
    ensureLayoutMode,
    cancelPlacementIfActive: () => {
      if (placement.active) cancelPlacement(S, placementHelpers);
    },
    setToolSelect,
    isVisibleUnpinnedUnderlay: () => underlayMesh.visible && hasUnderlaySource() && !underlayState.pinned,
    getSelectedKind: () => selectedKind,
    setSelectedKind: (kind) => { selectedKind = kind; },
    getSelectedInstanceId: () => selectedInstanceId,
    getSelectedKitchenGroupId: () => selectedKitchenGroupId,
    getSelectedSectionId: () => selectedSectionId,
    getSelectedFloorId: () => selectedFloorId,
    getSelectedColumnId: () => selectedColumnId,
    getSelectedWallId: () => selectedWallId,
    getSelectedInstanceIds: () => selectedInstanceIds,
    getSelectedWallIds: () => selectedWallIds,
    setSelectedUnderlay,
    setSelectedWall,
    setSelectedModule,
    setSelectedSection,
    setSelectedFloor,
    setSelectedColumn,
    mountProps,
    duplicateInstance,
    duplicateWall,
    deleteInstance,
    deleteWall,
    deleteSectionInstance,
    deleteFloor,
    deleteColumn,
    deleteKitchenGroup,
    deleteWindow,
    deleteDoor,
    deleteUnderlay,
    deleteWardrobeSelection: () => wardrobeMode?.deleteSelected() ?? false,
    commitHistory: () => commitHistory(S),
    setView2d: (checked) => setView2d(checked)
  });
  const openUnderlayPanel = layoutActionsController.openUnderlayPanel;
  const duplicateSelected = layoutActionsController.duplicateSelected;
  const deleteSelected = layoutActionsController.deleteSelected;
  const toggle2dView = layoutActionsController.toggle2dView;

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
  const setClassicTopbarTab = (...args: Parameters<ReturnType<typeof createClassicTopbarController>["setActiveTab"]>) => createClassicTopbarControllerResult.setActiveTab(...args);
  createClassicTopbarControllerResult = createClassicTopbarController({
    I_ALIGN,
    I_BOM,
    I_CABINET,
    I_COLUMN,
    I_COPY,
    I_DIM,
    I_DOOR,
    I_DUP,
    I_EXPORT,
    I_FLOOR,
    I_GRID2D,
    I_HIDE,
    I_INSTALL,
    I_ISOLATE,
    I_MEASURE,
    I_MOVE,
    I_REDO,
    I_RESET,
    I_ROTATE,
    I_SECTION,
    I_SELECT,
    I_STAIR,
    I_TRASH,
    I_TRIM,
    I_UNDERLAY,
    I_UNDO,
    I_UNHIDE,
    I_VIEW,
    I_WARDROBE,
    I_WINDOW,
    I_WALL,
    S,
    addColumn,
    addOrSelectDoor,
    addOrSelectWindow,
    args,
    deleteSelected,
    duplicateSelected,
    enterFloorBoundaryEdit,
    getInstallState,
    helpers,
    get kitchenMode() { return kitchenMode; },
    get wardrobeMode() { return wardrobeMode; },
    layoutTool,
    openBomPanel: (panelArgs) => openBomPanel({ ...panelArgs, catalog: clientCatalog }),
    openPricingCatalog: () => openPricingCatalog(clientCatalog),
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
    updateUndoRedoUi,
    visibility: {
      hasSelection: () => visibilityController.hasSelection(),
      selectedHasHidden: () => visibilityController.selectedHasHidden(),
      isShowHidden: () => visibilityController.showHidden,
      hasHiddenObjects: () => visibilityController.hasHiddenObjects(),
      hideSelected: () => visibilityController.hideSelected(),
      unhideSelected: () => visibilityController.unhideSelected(),
      isolateSelected: () => visibilityController.isolateSelected(),
      unhideAll: () => visibilityController.unhideAll()
    }
  });
  syncClassicTopbarVisibility = createClassicTopbarControllerResult.syncClassicTopbarVisibility;


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
    getSelectedKitchenGroupId: () => selectedKitchenGroupId,
    setSelectedKitchenGroup,
    updateLayoutPanel,
    startWorktopDraw: startKitchenWorktopDraw,
    cancelWorktopDraw: cancelKitchenWorktopDraw,
    handleWorktopEscape: handleKitchenWorktopEscape,
    refreshWorktopPreview: updateKitchenWorktopPreview,
    getGroupWorktops: getKitchenGroupWorktops,
    replaceGroupWorktops: replaceKitchenGroupWorktops,
    rebuildGroupWorktops: (groupId, ctx) => rebuildKitchenGroupWorktops(groupId, ctx),
    buildClassicTopbar,
    showKitchenTab: () => setClassicTopbarTab("kitchen"),
    restoreStandardTopbar: () => rebuildStandardTopbar(),
    refreshProps: () => mountProps(),
    catalog: clientCatalog,
    modulePackages
  });

  wardrobeMode = createWardrobeEditMode({
    layoutRoot,
    viewerEl: args.viewerEl,
    getCamera: cam,
    tb,
    props,
    icons: { board: I_CABINET, back: I_FLOOR, done: I_DONE, cancel: I_CANCEL },
    ensureLayoutMode,
    setToolSelect,
    cancelPlacementIfActive: () => {
      if (placement.active) cancelPlacement(S, placementHelpers);
    },
    disposeObject3D,
    buildClassicTopbar,
    restoreStandardTopbar: () => rebuildStandardTopbar(),
    refreshProps: () => mountProps(),
    catalog: clientCatalog
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

  const kitchenWorktopSelectionController = createKitchenWorktopSelectionController({
    marquee,
    marqueeEl,
    findKitchenWorktop,
    getKitchenEditMode: () => S.kitchenEditMode,
    getKitchenMode: () => kitchenMode,
    setSelectedKitchenGroup
  });
  const beginKitchenWorktopSelection = kitchenWorktopSelectionController.beginKitchenWorktopSelection;

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
  function setSelectedDoor() { return selectionController.setSelectedDoor(); }
  function setSelectedUnderlay() { return selectionController.setSelectedUnderlay(); }
  function setSelectedSection(id: string | null) { return selectionController.setSelectedSection(id); }
  function setSelectedColumn(id: string | null) { return selectionController.setSelectedColumn(id); }
  function setSelectedWall(id: string | null) { return selectionController.setSelectedWall(id); }
  function setSelectedFloor(id: string | null) { return selectionController.setSelectedFloor(id); }

  selectionController = createSelectionController({
    instances,
    layoutPanel,
    pinnedInstanceIds,
    pinnedWallIds,
    rebuildWallPlanMesh,
    scene,
    selectedInstanceIds,
    selectedWallIds,
    showWallSnapMarkersFor,
    syncColumnSelectionVisuals,
    syncDoorSelectionVisuals,
    syncWindowSelectionVisuals,
    syncSelectionState,
    hasUnderlaySource,
    underlayMesh,
    underlayState,
    updateAllSectionVisuals: () => updateAllSectionVisuals(),
    updateSelectionHighlights,
    walls,
    get kitchenMode() { return kitchenMode; },
    get layoutTool() { return layoutTool; }, set layoutTool(next: LayoutTool) { layoutTool = next; },
    get selectedColumnId() { return selectedColumnId; }, set selectedColumnId(next: string | null) { selectedColumnId = next; },
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

  const windowInstanceController = createWindowInstanceController({
    roomHeightM: roomBounds.h,
    wallDefs,
    walls,
    getWindowInst: () => windows[0] ?? null,
    nextWindowId: () => `win${windowCounter++}`,
    setWindowOpening,
    setWindowCutout,
    updateWindowTransform: (inst) => updateWindowTransform(inst)
  });
  const createWindow = windowInstanceController.createWindow;
  const clampWindowParams = windowInstanceController.clampWindowParams;
  const clearWindowLightIfMissing = windowInstanceController.clearWindowLightIfMissing;
  createWindowControlsControllerResult = createWindowControlsController({
    clampWindowParams,
    commitHistory: () => commitHistory(S),
    createWindow,
    ensureFloorplanViewerTab,
    getActiveViewerTab: () => activeViewerTab,
    getSelectedWallId: () => selectedWallId,
    getViewMode: () => viewMode,
    layoutRoot,
    mode,
    mountProps,
    rebuildWall,
    rebuildWallPlanMesh,
    scene,
    setSelectedWindow,
    setToolSelect,
    setUnderlayStatus,
    setWindowCutout,
    setWindowOpening,
    wallDefs,
    walls,
    windowEditorHost,
    windows,
    get windowInst() { return windowInst; },
    set windowInst(next: WindowInstance | null) { windowInst = next; }
  });

  const doorInstanceController = createDoorInstanceController({
    roomHeightM: roomBounds.h,
    walls,
    getDoorInst: () => doors[0] ?? null,
    nextDoorId: () => `door${doorCounter++}`,
    updateDoorTransform: (inst) => updateDoorTransform(inst)
  });
  const createDoor = doorInstanceController.createDoor;
  const clampDoorParams = doorInstanceController.clampDoorParams;
  createDoorControlsControllerResult = createDoorControlsController({
    clampDoorParams,
    commitHistory: () => commitHistory(S),
    createDoor,
    ensureFloorplanViewerTab,
    getActiveViewerTab: () => activeViewerTab,
    getSelectedWallId: () => selectedWallId,
    getViewMode: () => viewMode,
    layoutRoot,
    mode,
    mountProps,
    rebuildWall,
    rebuildWallPlanMesh,
    setSelectedDoor,
    setToolSelect,
    setUnderlayStatus,
    walls,
    doors,
    get doorInst() { return doorInst; },
    set doorInst(next: DoorInstance | null) { doorInst = next; }
  });

  function mountInstanceControls(inst: LayoutInstance) {
    instanceEditorHost.innerHTML = "";

    const modulePackage = findModulePackageForParams(modulePackages, inst.params);
    if (!modulePackage) {
      const missing = document.createElement("div");
      missing.className = "muted";
      missing.textContent = `Module package missing for ${inst.params.type}.`;
      instanceEditorHost.appendChild(missing);
      return;
    }

    createModulePackageControls(instanceEditorHost, modulePackage, inst.params, {
      getWorktopThicknessMm: () => 0,
      clientCatalog,
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

  const moduleSelectionController = createModuleSelectionController({
    instances,
    pinnedInstanceIds,
    raycaster,
    groundPlane,
    renderer,
    dragState,
    marquee,
    marqueeEl,
    findInstance,
    getCamera: cam,
    getMode: () => mode,
    getViewMode: () => viewMode,
    getKitchenEditMode: () => S.kitchenEditMode,
    getKitchenMode: () => kitchenMode,
    getModuleLocalBackCenter,
    setSelectedKitchenGroup,
    setSelectedModule
  });
  const beginModuleSelection = moduleSelectionController.beginModuleSelection;
  const findSelectableFloorplanModuleAtPoint = moduleSelectionController.findSelectableFloorplanModuleAtPoint;
  const selectInstanceById = moduleSelectionController.selectInstanceById;

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

  const buildLayoutExportPayload = () => createLayoutExportPayload({ windowInst, windows, doorInst, doors, walls, columns, floors, sections, instances });

  const vectorSnapshot = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
  const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const buildProjectAppState = (): ProjectSaveFile["appState"] => {
    const camera = cam();
    const target = (ctl() as any)?.target;
    return {
      layout: {
        snapshot: captureLayoutSnapshot(S),
        layoutExport: buildLayoutExportPayload(),
        windows: windows.map((item) => ({ id: item.id, params: cloneJson(item.params) })),
        doors: doors.map((item) => ({ id: item.id, params: cloneJson(item.params) })),
        counters: { windowCounter, doorCounter }
      },
      kitchen: {
        context: cloneJson(S.kitchenCtx),
        groups: S.kitchenGroups.map((group) => ({
          id: group.id,
          name: group.name,
          ctx: cloneJson(group.ctx),
          instanceIds: [...group.instanceIds]
        })),
        activeKitchenGroupId: S.activeKitchenGroupId
      },
      modules: instances.map((inst) => ({
        id: inst.id,
        type: inst.params.type,
        params: cloneJson(inst.params),
        kitchenGroupId: inst.kitchenGroupId,
        kitchenPlacement: cloneJson(inst.kitchenPlacement),
        positionMm: {
          x: Math.round(inst.root.position.x * 1000),
          y: Math.round(inst.root.position.y * 1000),
          z: Math.round(inst.root.position.z * 1000)
        },
        rotationYDeg: (inst.root.rotation.y * 180) / Math.PI
      })),
      scene: {
        mode,
        viewMode,
        renderMode,
        hdri: getHdriSettings(),
        daylightIntensity: getDaylightIntensity(),
        shadowAlgorithm: getShadowAlgorithm()
      },
      editor: {
        layoutTool,
        activeViewerTab
      },
      camera: {
        type: camera.type,
        position: vectorSnapshot(camera.position),
        target: target instanceof THREE.Vector3 ? vectorSnapshot(target) : undefined
      },
      selections: {
        selectedKind,
        selectedInstanceId,
        selectedWallId,
        selectedFloorId,
        selectedColumnId,
        selectedSectionId,
        selectedWallIds: [...selectedWallIds],
        selectedInstanceIds: [...selectedInstanceIds]
      },
      pricingSettings: null,
      quoteSettings: null
    };
  };

  const restoreProjectSave = (save: ProjectSaveFile) => {
    const layout = save.appState.layout as {
      snapshot?: unknown;
      windows?: Array<{ id: string; params: WindowParams }>;
      doors?: Array<{ id: string; params: DoorParams }>;
      counters?: { windowCounter?: number; doorCounter?: number };
    } | null;
    const kitchen = save.appState.kitchen as { context?: unknown; groups?: Array<{ id: string; name: string; ctx: unknown; instanceIds: string[] }>; activeKitchenGroupId?: string | null } | null;
    if (kitchen?.context) S.kitchenCtx = resolveContext(kitchen.context as typeof S.kitchenCtx);
    S.kitchenGroups.splice(0, S.kitchenGroups.length);
    for (const group of kitchen?.groups ?? []) {
      S.kitchenGroups.push({
        id: group.id,
        name: group.name,
        ctx: resolveContext(group.ctx as typeof S.kitchenCtx),
        instanceIds: [...group.instanceIds]
      });
    }
    S.activeKitchenGroupId = kitchen?.activeKitchenGroupId ?? null;
    if (!layout?.snapshot) throw new Error("Project save is missing layout snapshot.");
    restoreLayoutSnapshot(S, helpers, layout.snapshot as Parameters<typeof restoreLayoutSnapshot>[2]);
    for (const inst of windows.splice(0, windows.length)) {
      layoutRoot.remove(inst.root);
      disposeObject3D(inst.root);
    }
    for (const inst of doors.splice(0, doors.length)) {
      layoutRoot.remove(inst.root);
      disposeObject3D(inst.root);
    }
    windowInst = null;
    doorInst = null;
    for (const savedWindow of layout.windows ?? []) {
      const params = clampWindowParams(cloneJson(savedWindow.params));
      const inst = createWindow(params.wall, params.wallId ?? null, { id: savedWindow.id });
      inst.params = params;
      updateWindowTransform(inst);
      windows.push(inst);
      layoutRoot.add(inst.root);
      windowInst = inst;
    }
    for (const savedDoor of layout.doors ?? []) {
      const params = clampDoorParams(cloneJson(savedDoor.params));
      const inst = createDoor(params.wall, params.wallId ?? null, { id: savedDoor.id });
      inst.params = params;
      updateDoorTransform(inst);
      doors.push(inst);
      layoutRoot.add(inst.root);
      doorInst = inst;
    }
    windowCounter = Math.max(layout.counters?.windowCounter ?? 1, ...windows.map((item) => Number(item.id.replace(/\D/g, "")) + 1).filter(Number.isFinite), 1);
    doorCounter = Math.max(layout.counters?.doorCounter ?? 1, ...doors.map((item) => Number(item.id.replace(/\D/g, "")) + 1).filter(Number.isFinite), 1);
    rebuildWallPlanMesh();
    S.history.current = captureLayoutSnapshot(S);
    S.history.past = [];
    S.history.future = [];
    updateUndoRedoUi(S);
    mountProps();
    updateLayoutPanel();
  };

  const projectActions = createProjectActions({
    buildAppState: buildProjectAppState,
    restoreSave: restoreProjectSave,
    onProjectChanged: (project, status) => {
      tb.setProjectLabel(project ? project.name : args.clientProfile?.company.name ?? "Project 1");
      projectHeader.render(project, status);
    }
  });
  const projectMenuActions = createProjectMenuActions(projectActions);

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
    clientCatalog,
    modulePackages,
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

    const modulePackage = findModulePackageForParams(modulePackages, inst.params);
    if (!modulePackage) {
      setUnderlayStatus(`Reset: module package missing for ${inst.params.type}.`);
      return;
    }

    inst.params = createParamsFromModulePackage(modulePackage);
    mountInstanceControls(inst);
    rebuildInstance(inst);
  });

  exportActions = createExportActions({
    appArgs: args,
    clientContext: args.clientContext,
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
    projectMenuActions,
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
    doorDragState,
    windowDragState
  });

  createInstanceRebuilderResult = createInstanceRebuilder({
    S,
    anyOverlap,
    applyWallConstraints,
    args,
    buildModule: (params) => buildModule(params, clientCatalog),
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
    cancelDoorPlacement,
    cancelWindowPlacement,
    cancelPlacement,
    clearTransform,
    clearWallDrawState,
    commitHistory,
    commitKitchenWorktopTypedLength,
    deleteSelected,
    deleteInstance,
    deleteWall,
    discardFloorBoundaryEdit,
    dragState,
    doorDragState,
    findInstance,
    floorEdit,
    getKitchenPlacementConstraint,
    handleLayoutEscape,
    helpers,
    inferKitchenPlacementBinding,
    instanceFitsRoom,
    instances,
    isDoorPlacementActive,
    isWindowPlacementActive,
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
    get placementHelpers() { return placementHelpers; },
    rebuildWall,
    rebuildWallPlanMesh,
    redo,
    renderFloorBoundaryEdit,
    rotateDoorPlacement,
    flipDoorPlacementSwingSide,
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
    clearDoorPlacementPreview,
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
    doorDragState,
    doors,
    get drawOrthoEnabled() { return drawOrthoEnabled; }, set drawOrthoEnabled(next) { drawOrthoEnabled = next; },
    drawSnapOverlay,
    findInstance,
    findSelectableFloorplanModuleAtPoint,
    floorEdit,
    floorOrthoPoint,
    floorPointEq,
    floorPointToWorld,
    floors,
    columns,
    formatMm,
    fromMmPoint,
    getAllInstanceGeometryMeshes,
    getInstanceGeometryMeshes,
    getInstanceIdFromObject,
    getColumnIdFromObject,
    getDoorIdFromObject,
    getColumnPickMeshes,
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
    insertColumnAtPoint,
    insertDoorAtWallPoint,
    insertWindowAtWallPoint,
    updateDoorPlacementPreview,
    updateWindowPlacementPreview,
    updateColumnPlacementPreview,
    clearWindowPlacementPreview,
    instances,
    isDoorPlacementActive,
    isWindowPlacementActive,
    isColumnPlacementActive,
    isObjectPickable: (object: THREE.Object3D | null | undefined) => {
      if (!visibilityController.isObjectPickable(object)) return false;
      const instanceId = getInstanceIdFromObject(object);
      if (!instanceId || !kitchenMode) return true;
      return !!kitchenMode.filterSelectableInstanceId(instanceId);
    },
    isVisibilityTargetPickable: (key: string | null | undefined) => visibilityController.isKeyPickable(key),
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
    setWallEndpointAndConnectedMm,
    setWallEndpointsAndConnectedMm,
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
    get selectedColumnId() { return selectedColumnId; }, set selectedColumnId(next) { selectedColumnId = next; },
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
    setSelectedColumn,
    setSelectedDoor,
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
    hasUnderlaySource,
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
    updateDoorTransform,
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
    windows,
    get windowInst() { return windowInst; }, set windowInst(next) { windowInst = next; },
    get doorInst() { return doorInst; }, set doorInst(next) { doorInst = next; },
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
    columns,
    doors,
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
    setSelectedColumn,
    setSelectedDoor,
    setSelectedFloor,
    setSelectedModule,
    setSelectedSection,
    setSelectedWall,
    setSelectedWindow,
    setViewMode,
    showNoProps,
    syncColumnPresentation,
    syncDetailClippingAndMaterials,
    syncDoorSelectionVisuals,
    syncViewerTabs,
    syncWindowSelectionVisuals,
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
    windows,
    get activeDetailClipPlanes() { return detailViewController.activeDetailClipPlanes; }, set activeDetailClipPlanes(next) { detailViewController.activeDetailClipPlanes = next; },
    get activeViewerTab() { return activeViewerTab; }, set activeViewerTab(next) { activeViewerTab = next; },
    get cabinetGroup() { return cabinetGroup; },
    get layoutTool() { return layoutTool; }, set layoutTool(next) { layoutTool = next; },
    get mode() { return mode; }, set mode(next) { mode = next; },
    get selectedFloorId() { return selectedFloorId; },
    get selectedColumnId() { return selectedColumnId; },
    get selectedInstanceId() { return selectedInstanceId; },
    get selectedKind() { return selectedKind; }, set selectedKind(next) { selectedKind = next; },
    get selectedSectionId() { return selectedSectionId; },
    get selectedWallId() { return selectedWallId; }, set selectedWallId(next) { selectedWallId = next; },
    get viewMode() { return viewMode; }, set viewMode(next) { viewMode = next; },
    get windowInst() { return windowInst; },
    get doorInst() { return doorInst; }
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
    inst.outline.visible = viewMode === "2d" && (isFloorplanView || isDetailOrthoView);
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
    modulePackages,
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
    getLastRebuildDebug: () => lastRebuildDebug,
    catalog: clientCatalog
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
    viewDisplay,
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
    visibilityController.sync();
    syncClassicTopbarVisibility();
    syncViewerDownbar();
    renderAppFrame(frameRendererContext, dt);
    requestAnimationFrame(tick);
  };
  tick();
}
