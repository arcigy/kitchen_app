import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { disposeObject3D } from "../core/dispose";
import type { AppState } from "../layout/appState";
import type { PlanSnapResult } from "./planSnap";
import type { SnapOverlayKind } from "./snapOverlay";
import { distPxPointToSeg } from "./screenGeometry";
import { worldToScreen } from "./sharedUtils";
import { floorBoundaryToSegments, floorPointDistMm } from "./floorBoundaryEdit";
import {
  offsetPlanLinePath,
} from "./planLineDrawingTool";
import {
  alignCustomFurnitureBoundarySegmentToReference,
  applyCustomFurnitureBoundaryCut,
  applyCustomFurnitureBoundaryFillet,
  cloneCustomFurnitureBoundaryEditState,
  cloneCustomFurnitureBoundarySegments,
  createCustomFurnitureBoundaryFilletSegments,
  customFurnitureBoundarySegmentsToBoundary,
  customFurniturePlanPathLengthMm,
  getCustomFurnitureBoundarySegmentPieces,
  getCustomFurniturePlanSegmentsForParams,
  getCustomFurnitureSegmentPathPoints,
  getCustomFurnitureSharedDrawToolIds,
  makeCustomFurnitureCircleBoundary,
  makeCustomFurniturePolygonBoundary,
  makeCustomFurnitureRectBoundary,
  moveCustomFurnitureBoundaryCut,
  moveCustomFurnitureBoundarySegmentToParallelDistance,
  offsetCustomFurniturePlanPath,
  popCustomFurnitureBoundaryRedoState,
  popCustomFurnitureBoundaryUndoState,
  resolveCustomFurnitureAutoAxisSnap,
  resolveCustomFurnitureBoundaryEscapeAction,
  resolveCustomFurnitureCombinedAxisSnap,
  resolveCustomFurnitureParallelBoundaryDimension,
  resolveCustomFurnitureTrackedAxisSnap,
  selectCustomFurnitureBoundarySegmentsInRect,
  shouldCustomFurnitureBoundaryDrawFromPickedPoint,
  shouldCustomFurnitureSelectToolPassThroughEmptyPointer,
  shouldStopCustomFurnitureLineChainOnSnap,
  trimExtendCustomFurnitureBoundarySegmentsToCorner,
  type CustomFurnitureBoundaryEditState,
  type CustomFurnitureBoundaryFilletMeta,
  type CustomFurnitureBoundarySegment,
  type CustomFurnitureBoundaryVertexRef,
  type CustomFurnitureSharedDrawToolId
} from "./customFurnitureBoundaryEditing";
import {
  makeCustomFurnitureVerticalBoardDraftPreview,
  makeCustomFurnitureVerticalBoardProfile,
  makeCustomFurnitureVerticalBoardProfileForLength,
  nextCustomFurnitureVerticalBoardDraftPoints,
  resolveCustomFurnitureActiveFurnitureId,
  resolveCustomFurnitureConstraintHeightMm,
  shouldCommitCustomFurnitureDraftBeforeLeaving,
  shouldStayInCustomFurnitureEditorAfterAccept,
  type CustomFurnitureVerticalBoardHeightSettings
} from "./customFurnitureBoardEditing";
import {
  firstMaterial,
  makeMeshMaterial,
} from "./customFurnitureUiControls";
import {
  getCustomFurnitureSharedDrawToolButton,
  resolveCustomFurnitureDrawOffsetMm,
  type CustomFurnitureDrawToolbarContext,
  type CustomFurnitureVerticalBoardDrawMode
} from "./customFurnitureTopbarModel";
import {
  CUSTOM_FURNITURE_SHARED_DRAW_ICONS,
  CUSTOM_FURNITURE_TOOLBAR_ICONS
} from "./customFurnitureToolbarIcons";
import type { EditorPropsApi, EditorTopbarApi } from "./editorModeApis";
import { mountCustomFurnitureActiveToolProps } from "./customFurnitureToolPropsPanel";
import {
  mountCustomFurnitureBoardProps,
  mountCustomFurnitureProps
} from "./customFurnitureSelectedPropsPanel";
import {
  makeCustomFurnitureBoardEdgeGeometry,
  makeCustomFurnitureBoardGeometry,
  makeCustomFurnitureBoardOutlineGeometry,
  makeCustomFurnitureBoundaryGeometry,
  nearestBoardProfileEdge,
  sanitizeCustomFurniturePlanPolygon,
  sanitizeCustomFurnitureProfile
} from "../layout/customFurnitureGeometry";
import type {
  CustomFurnitureBoardJustification,
  CustomFurnitureBoardObject,
  CustomFurnitureBoardParams,
  CustomFurnitureConstraint,
  CustomFurnitureInstance,
  CustomFurnitureParams,
  CustomFurniturePlanPoint,
  CustomFurnitureSnapshotItem
} from "../layout/customFurnitureTypes";

export {
  alignCustomFurnitureBoundarySegmentToReference,
  applyCustomFurnitureBoundaryCut,
  applyCustomFurnitureBoundaryFillet,
  cloneCustomFurnitureBoundaryEditState,
  createCustomFurnitureBoundaryFilletSegments,
  customFurnitureBoundarySegmentsToBoundary,
  customFurniturePlanPathLengthMm,
  getCustomFurnitureBoundarySegmentPieces,
  getCustomFurniturePlanSegmentsForParams,
  getCustomFurnitureSegmentPathPoints,
  getCustomFurnitureSharedDrawToolIds,
  makeCustomFurnitureCircleBoundary,
  makeCustomFurniturePolygonBoundary,
  makeCustomFurnitureRectBoundary,
  moveCustomFurnitureBoundaryCut,
  moveCustomFurnitureBoundarySegmentToParallelDistance,
  offsetCustomFurniturePlanPath,
  popCustomFurnitureBoundaryRedoState,
  popCustomFurnitureBoundaryUndoState,
  resolveCustomFurnitureAutoAxisSnap,
  resolveCustomFurnitureBoundaryEscapeAction,
  resolveCustomFurnitureCombinedAxisSnap,
  resolveCustomFurnitureParallelBoundaryDimension,
  resolveCustomFurnitureTrackedAxisSnap,
  selectCustomFurnitureBoundarySegmentsInRect,
  shouldCustomFurnitureBoundaryDrawFromPickedPoint,
  shouldCustomFurnitureSelectToolPassThroughEmptyPointer,
  shouldStopCustomFurnitureLineChainOnSnap,
  trimExtendCustomFurnitureBoundarySegmentsToCorner
};
export {
  makeCustomFurnitureVerticalBoardDraftPreview,
  makeCustomFurnitureVerticalBoardProfile,
  makeCustomFurnitureVerticalBoardProfileForLength,
  nextCustomFurnitureVerticalBoardDraftPoints,
  resolveCustomFurnitureActiveFurnitureId,
  resolveCustomFurnitureConstraintHeightMm,
  shouldCommitCustomFurnitureDraftBeforeLeaving,
  shouldStayInCustomFurnitureEditorAfterAccept
};
export type {
  CustomFurnitureBoundaryEditState,
  CustomFurnitureBoundaryFilletMeta,
  CustomFurnitureBoundarySegment,
  CustomFurnitureBoundaryVertexRef
};

type CustomFurnitureTool = "boundary" | "horizontalBoard" | "verticalBoard" | "edgeBand";
type CustomFurnitureBoundaryDrawTool =
  | "select"
  | "boundaryLine"
  | "line"
  | "rectangle"
  | "polygon"
  | "circle"
  | "arc"
  | "spline"
  | "pickLines"
  | "trim"
  | "align"
  | "fillet"
  | "cut";
type CustomFurnitureBoundaryDrag =
  | {
      kind: "vertex";
      pointerId: number;
      ref: CustomFurnitureBoundaryVertexRef;
      startPoint: CustomFurniturePlanPoint;
      startSegments: CustomFurnitureBoundarySegment[];
    }
  | {
      kind: "segment";
      pointerId: number;
      segmentIndex: number;
      startWorld: CustomFurniturePlanPoint;
      startSegments: CustomFurnitureBoundarySegment[];
    };
type CustomFurnitureBoundarySelectRect = {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  mode: "contain" | "touch";
};
type CustomFurnitureBoundaryDimensionEdit = {
  kind: "parallelSegmentDistance";
  segmentIndex: number;
  referenceSegmentIndex: number;
} | { kind: "filletRadius"; filletId: string } | { kind: "cutPosition"; cutId: string };
type CreateCustomFurnitureControllerArgs = {
  S: AppState;
  catalog: ClientCatalog;
  customFurniture: CustomFurnitureInstance[];
  layoutRoot: THREE.Group;
  renderer: THREE.WebGLRenderer;
  getCamera: () => THREE.Camera;
  tb: EditorTopbarApi;
  props: EditorPropsApi;
  icons: {
    board: string;
    cancel: string;
    done: string;
    edge: string;
    furniture: string;
    horizontal: string;
    vertical: string;
  };
  ensureLayoutMode: () => void;
  ensureFloorplanViewerTab: () => void;
  setLayoutSelectTool?: () => void;
  buildClassicTopbar: () => void;
  restoreStandardTopbar: () => void;
  refreshProps: () => void;
  syncViewerCursor?: () => void;
  commitHistory: () => void;
  setStatus: (message: string) => void;
  clearAppSelection: () => void;
  drawSnapOverlay: {
    hide: () => void;
    showWorld: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect, kind: SnapOverlayKind) => void;
  };
  snapPoint2D: (
    raw: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    maxPx?: number,
    options?: {
      kindPriority?: Array<Exclude<PlanSnapResult["kind"], "none">>;
      sticky?: PlanSnapResult | null;
      preferNearest?: boolean;
    }
  ) => PlanSnapResult;
  keepStickyPlanSnap: (
    rawPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx?: number
  ) => PlanSnapResult | null;
  updateHoverCursor: (point: THREE.Vector2, kind: SnapOverlayKind) => void;
  hideHoverCursor: () => void;
  getCounter: () => number;
  setCounter: (next: number) => void;
  getViewerToolMode?: () => "select" | "pan" | "zoom-in" | "zoom-out" | "orbit" | "fit";
};

const constraintOptions: CustomFurnitureConstraint[] = ["projectBase", "furnitureBase", "furnitureTop", "absolute"];

const cloneJson = <T>(value: T): T => structuredClone(value);
const mmToM = (value: number) => value / 1000;

export function releaseCustomFurnitureButtonMagnetCapture(doc: Document) {
  const active = doc.querySelectorAll<HTMLElement>(".button-magnet-active");
  const hadCapture = doc.body.classList.contains("button-magnet-capturing") || active.length > 0;
  doc.body.classList.remove("button-magnet-capturing");
  active.forEach((button) => {
    button.classList.remove("button-magnet-active");
    button.style.removeProperty("--button-magnet-x");
    button.style.removeProperty("--button-magnet-y");
    button.style.removeProperty("--button-magnet-scale");
  });
  return hadCapture;
}

export function createCustomFurnitureController(args: CreateCustomFurnitureControllerArgs) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let selectedFurnitureId: string | null = null;
  let selectedBoardId: string | null = null;
  let editorFurnitureId: string | null = null;
  let boundaryEditFurnitureId: string | null = null;
  let activeTool: CustomFurnitureTool | null = null;
  let boundaryEditActive = false;
  let boundaryDrawTool: CustomFurnitureBoundaryDrawTool = "boundaryLine";
  let boundarySegments: CustomFurnitureBoundarySegment[] = [];
  let boundaryFirst: CustomFurniturePlanPoint | null = null;
  let boundaryHover: CustomFurniturePlanPoint | null = null;
  let hoverBoundarySegmentIndex: number | null = null;
  let selectedBoundarySegmentIndex: number | null = null;
  const selectedBoundarySegmentIndexes = new Set<number>();
  let selectedBoundaryVertex: CustomFurnitureBoundaryVertexRef | null = null;
  let boundaryDrag: CustomFurnitureBoundaryDrag | null = null;
  let boundarySelectRect: CustomFurnitureBoundarySelectRect | null = null;
  let boundarySelectRectEl: HTMLDivElement | null = null;
  let boundaryTrimFirstSegmentIndex: number | null = null;
  let boundaryAlignReferenceSegmentIndex: number | null = null;
  let boundaryFilletFirstSegmentIndex: number | null = null;
  let boundaryCutSegmentIndex: number | null = null;
  let boundarySnap: PlanSnapResult | null = null;
  let boundaryTrackingCandidate: CustomFurniturePlanPoint | null = null;
  let boundaryTrackingTimer: ReturnType<typeof setTimeout> | null = null;
  let boundaryTrackedPoint: CustomFurniturePlanPoint | null = null;
  let boundaryTrackedAlignedPoint: CustomFurniturePlanPoint | null = null;
  let boundaryMoveActive = false;
  let draftPoints: CustomFurniturePlanPoint[] = [];
  let draftHoverPoint: CustomFurniturePlanPoint | null = null;
  let draftHoverSegment: CustomFurnitureBoundarySegment | null = null;
  let draftPickedVerticalBoardSegments: CustomFurnitureBoundarySegment[] = [];
  let verticalBoardSketchSourceBoards: CustomFurnitureBoardParams[] = [];
  let verticalBoardDrawMode: CustomFurnitureVerticalBoardDrawMode = "line";
  let drawOffsetMm = 0;
  let drawOffsetDirection = 1;
  let draftBoardThicknessMm = 18;
  let draftBoardMaterialId = firstMaterial(args.catalog, "board", args.catalog.kitchenDefaults.carcassMaterialId);
  let draftBoardJustification: CustomFurnitureBoardJustification = "center";
  let draftBoardBaseConstraint: CustomFurnitureConstraint = "furnitureBase";
  let draftBoardBaseOffsetMm = 0;
  let draftBoardTopConstraint: CustomFurnitureConstraint = "furnitureTop";
  let draftBoardTopOffsetMm = 0;
  const boundaryUndoStack: CustomFurnitureBoundaryEditState[] = [];
  const boundaryRedoStack: CustomFurnitureBoundaryEditState[] = [];
  let draftLine: THREE.Line | null = null;
  let draftBoardPreviewRoot: THREE.Group | null = null;
  let boundaryEditRoot: THREE.Group | null = null;
  const editorIsolationMaterials = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();

  const nextFurnitureId = () => {
    const id = `cf${args.getCounter()}`;
    args.setCounter(args.getCounter() + 1);
    return id;
  };

  const nextBoardId = (furniture: CustomFurnitureInstance) => `b${furniture.params.boards.length + 1}`;

  const findFurniture = (id = selectedFurnitureId) => args.customFurniture.find((item) => item.id === id) ?? null;
  const findActiveFurniture = () => findFurniture(resolveCustomFurnitureActiveFurnitureId(editorFurnitureId, selectedFurnitureId));
  const findSelectedBoard = () => {
    const furniture = findFurniture();
    if (!furniture || !selectedBoardId) return null;
    return furniture.params.boards.find((board) => board.id === selectedBoardId) ?? null;
  };

  const restoreEditorIsolation = () => {
    for (const [material, original] of editorIsolationMaterials) {
      material.transparent = original.transparent;
      material.opacity = original.opacity;
      material.depthWrite = original.depthWrite;
      material.needsUpdate = true;
    }
    editorIsolationMaterials.clear();
  };

  const dimMaterialForEditor = (material: THREE.Material) => {
    if (!editorIsolationMaterials.has(material)) {
      editorIsolationMaterials.set(material, {
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite
      });
    }
    material.transparent = true;
    material.opacity = Math.min(material.opacity, 0.22);
    material.depthWrite = false;
    material.needsUpdate = true;
  };

  const applyEditorIsolation = () => {
    restoreEditorIsolation();
    if (!editorFurnitureId) return;
    const activeFurniture = findFurniture(editorFurnitureId);
    if (!activeFurniture) return;
    for (const root of args.layoutRoot.children) {
      if (root === activeFurniture.root || root === boundaryEditRoot) continue;
      root.traverse((obj) => {
        const material = "material" in obj ? (obj.material as THREE.Material | THREE.Material[] | undefined) : undefined;
        if (Array.isArray(material)) for (const item of material) dimMaterialForEditor(item);
        else if (material) dimMaterialForEditor(material);
      });
    }
  };

  const clearDraft = () => {
    draftPoints = [];
    draftHoverPoint = null;
    draftHoverSegment = null;
    draftPickedVerticalBoardSegments = [];
    verticalBoardSketchSourceBoards = [];
    if (draftLine) {
      args.layoutRoot.remove(draftLine);
      draftLine.geometry.dispose();
      (draftLine.material as THREE.Material).dispose();
      draftLine = null;
    }
    if (draftBoardPreviewRoot) {
      args.layoutRoot.remove(draftBoardPreviewRoot);
      disposeObject3D(draftBoardPreviewRoot);
      draftBoardPreviewRoot = null;
    }
  };

  const ensureBoundaryEditRoot = () => {
    if (!boundaryEditRoot) {
      boundaryEditRoot = new THREE.Group();
      boundaryEditRoot.name = "customFurnitureBoundaryEdit";
      boundaryEditRoot.visible = false;
      boundaryEditRoot.renderOrder = 110;
      args.layoutRoot.add(boundaryEditRoot);
    }
    return boundaryEditRoot;
  };

  const disposeChildren = (root: THREE.Group) => {
    for (const child of [...root.children]) {
      root.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
          return;
        }
        if (!("geometry" in obj) || !(obj.geometry instanceof THREE.BufferGeometry)) return;
        obj.geometry.dispose();
        const material = "material" in obj ? (obj.material as THREE.Material | THREE.Material[] | undefined) : undefined;
        if (Array.isArray(material)) for (const mat of material) mat.dispose();
        else material?.dispose();
      });
    }
  };

  const pointToWorld = (point: CustomFurniturePlanPoint, y = 0.062) => new THREE.Vector3(point.x / 1000, y, point.z / 1000);

  const addBoundaryLineVisual = (root: THREE.Group, a: CustomFurniturePlanPoint, b: CustomFurniturePlanPoint, color: number, opacity = 0.95) => {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([pointToWorld(a), pointToWorld(b)]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
    );
    line.renderOrder = 120;
    root.add(line);
  };

  const addBoundarySegmentVisual = (root: THREE.Group, segment: CustomFurnitureBoundarySegment, color: number, opacity = 0.95) => {
    const points = segment.arcPoints && segment.arcPoints.length >= 2 ? segment.arcPoints : [segment.a, segment.b];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points.map((point) => pointToWorld(point))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
    );
    line.renderOrder = 120;
    root.add(line);
  };

  const boundaryPointRadiusWorld = (selected: boolean) => {
    const camera = args.getCamera();
    const rect = args.renderer.domElement.getBoundingClientRect();
    const px = selected ? 4 : 2.5;
    if (camera instanceof THREE.OrthographicCamera) {
      return Math.max(0.002, ((camera.top - camera.bottom) / Math.max(0.0001, camera.zoom)) * (px / Math.max(1, rect.height)));
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = Math.max(0.5, camera.position.distanceTo(new THREE.Vector3(0, 0, 0)));
      const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
      return Math.max(0.002, visibleHeight * (px / Math.max(1, rect.height)));
    }
    return selected ? 0.006 : 0.004;
  };

  const addBoundaryPointVisual = (root: THREE.Group, point: CustomFurniturePlanPoint, selected: boolean, colorOverride?: number) => {
    const geom = new THREE.CircleGeometry(boundaryPointRadiusWorld(selected), 12);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ color: colorOverride ?? (selected ? 0xffd166 : 0xffffff), transparent: true, opacity: 0.95, depthTest: false })
    );
    mesh.position.copy(pointToWorld(point, 0.07));
    mesh.renderOrder = 125;
    root.add(mesh);
  };

  const parseBoundaryDimensionEdit = (value: unknown): CustomFurnitureBoundaryDimensionEdit | null => {
    if (!value || typeof value !== "object") return null;
    const edit = value as Partial<CustomFurnitureBoundaryDimensionEdit>;
    return edit.kind === "parallelSegmentDistance" &&
      typeof edit.segmentIndex === "number" &&
      typeof edit.referenceSegmentIndex === "number"
      ? (edit as CustomFurnitureBoundaryDimensionEdit)
      : edit.kind === "filletRadius" && typeof edit.filletId === "string"
        ? (edit as CustomFurnitureBoundaryDimensionEdit)
        : edit.kind === "cutPosition" && typeof edit.cutId === "string"
          ? (edit as CustomFurnitureBoundaryDimensionEdit)
          : null;
  };

  const createBoundaryDimensionLine = (pointsMm: Array<{ x: number; y: number; z: number }>) => {
    const vertices: number[] = [];
    for (let index = 0; index < pointsMm.length - 1; index += 2) {
      vertices.push(
        mmToM(pointsMm[index]!.x),
        mmToM(pointsMm[index]!.y),
        mmToM(pointsMm[index]!.z),
        mmToM(pointsMm[index + 1]!.x),
        mmToM(pointsMm[index + 1]!.y),
        mmToM(pointsMm[index + 1]!.z)
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const line = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xc98d00, depthTest: false, depthWrite: false })
    );
    line.renderOrder = 130;
    return line;
  };

  const createBoundaryDimensionSprite = (text: string, edit: CustomFurnitureBoundaryDimensionEdit) => {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 84;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '400 42px ISOCPEUR, "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
      ctx.fillStyle = "#1f252b";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
    sprite.scale.set(0.52, 0.18, 1);
    sprite.renderOrder = 132;
    sprite.userData.customFurnitureBoundaryDimensionEdit = edit;
    return sprite;
  };

  const addBoundaryFilletRadiusDimension = (root: THREE.Group, segment: CustomFurnitureBoundarySegment) => {
    const fillet = segment.fillet;
    if (!fillet || segment.filletRole !== "arc") return false;
    const mid = { x: (segment.a.x + segment.b.x) / 2, z: (segment.a.z + segment.b.z) / 2 };
    const y = 92;
    const dimRoot = new THREE.Group();
    dimRoot.add(createBoundaryDimensionLine([{ x: fillet.center.x, y, z: fillet.center.z }, { x: mid.x, y, z: mid.z }]));
    const sprite = createBoundaryDimensionSprite(`R${Math.round(fillet.radiusMm)}`, { kind: "filletRadius", filletId: fillet.id });
    sprite.position.set(mmToM((fillet.center.x + mid.x) / 2), mmToM(y), mmToM((fillet.center.z + mid.z) / 2));
    dimRoot.add(sprite);
    root.add(dimRoot);
    return true;
  };

  const addBoundaryCutPositionDimension = (root: THREE.Group, segment: CustomFurnitureBoundarySegment) => {
    const cut = segment.cut;
    if (!cut) return false;
    const dx = cut.originalB.x - cut.originalA.x;
    const dz = cut.originalB.z - cut.originalA.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) return false;
    const dir = { x: dx / length, z: dz / length };
    const normal = { x: -dir.z, z: dir.x };
    const center = {
      x: cut.originalA.x + dir.x * cut.centerDistanceMm,
      z: cut.originalA.z + dir.z * cut.centerDistanceMm
    };
    const offset = 95;
    const a = { x: cut.originalA.x + normal.x * offset, z: cut.originalA.z + normal.z * offset };
    const b = { x: center.x + normal.x * offset, z: center.z + normal.z * offset };
    const y = 92;
    const dimRoot = new THREE.Group();
    dimRoot.add(createBoundaryDimensionLine([{ x: a.x, y, z: a.z }, { x: b.x, y, z: b.z }, { x: center.x, y, z: center.z }, { x: b.x, y, z: b.z }]));
    const sprite = createBoundaryDimensionSprite(`${Math.round(cut.centerDistanceMm)}`, { kind: "cutPosition", cutId: cut.id });
    sprite.position.set(mmToM((a.x + b.x) / 2 + normal.x * 45), mmToM(y), mmToM((a.z + b.z) / 2 + normal.z * 45));
    dimRoot.add(sprite);
    root.add(dimRoot);
    return true;
  };

  const addBoundarySegmentDimension = (root: THREE.Group, segmentIndex: number, segment: CustomFurnitureBoundarySegment) => {
    if (addBoundaryFilletRadiusDimension(root, segment)) return;
    if (addBoundaryCutPositionDimension(root, segment)) return;
    const dimension = resolveCustomFurnitureParallelBoundaryDimension(getEditablePlanLineSegments(), segmentIndex);
    if (!dimension) return;
    const { dir, normal } = dimension;
    const tick = 42;
    const ext = 70;
    const a = dimension.selectedPoint;
    const b = dimension.referencePoint;
    const y = 92;
    const dimRoot = new THREE.Group();
    dimRoot.add(
      createBoundaryDimensionLine([
        { x: a.x, y, z: a.z },
        { x: b.x, y, z: b.z },
        { x: a.x - dir.x * ext, y, z: a.z - dir.z * ext },
        { x: a.x + dir.x * ext, y, z: a.z + dir.z * ext },
        { x: b.x - dir.x * ext, y, z: b.z - dir.z * ext },
        { x: b.x + dir.x * ext, y, z: b.z + dir.z * ext },
        { x: a.x - normal.x * tick * 0.5 - dir.x * tick * 0.5, y, z: a.z - normal.z * tick * 0.5 - dir.z * tick * 0.5 },
        { x: a.x + normal.x * tick * 0.5 + dir.x * tick * 0.5, y, z: a.z + normal.z * tick * 0.5 + dir.z * tick * 0.5 },
        { x: b.x - normal.x * tick * 0.5 - dir.x * tick * 0.5, y, z: b.z - normal.z * tick * 0.5 - dir.z * tick * 0.5 },
        { x: b.x + normal.x * tick * 0.5 + dir.x * tick * 0.5, y, z: b.z + normal.z * tick * 0.5 + dir.z * tick * 0.5 }
      ])
    );
    const sprite = createBoundaryDimensionSprite(`${Math.round(dimension.distanceMm)}`, {
      kind: "parallelSegmentDistance",
      segmentIndex,
      referenceSegmentIndex: dimension.referenceSegmentIndex
    });
    sprite.position.set(mmToM((a.x + b.x) / 2 + dir.x * 55), mmToM(y), mmToM((a.z + b.z) / 2 + dir.z * 55));
    dimRoot.add(sprite);
    root.add(dimRoot);
  };

  const ensureBoundarySelectRectEl = () => {
    if (!boundarySelectRectEl) {
      boundarySelectRectEl = document.createElement("div");
      boundarySelectRectEl.style.position = "absolute";
      boundarySelectRectEl.style.display = "none";
      boundarySelectRectEl.style.pointerEvents = "none";
      boundarySelectRectEl.style.border = "1px solid rgba(255, 209, 102, 0.95)";
      boundarySelectRectEl.style.background = "rgba(255, 209, 102, 0.08)";
      boundarySelectRectEl.style.zIndex = "30";
      (args.renderer.domElement.parentElement ?? document.body).appendChild(boundarySelectRectEl);
    }
    return boundarySelectRectEl;
  };

  const hideBoundarySelectRect = () => {
    boundarySelectRectEl?.style.setProperty("display", "none");
  };

  const updateBoundarySelectRectEl = () => {
    if (!boundarySelectRect) return;
    boundarySelectRect.mode = boundarySelectRect.currentX >= boundarySelectRect.startX ? "contain" : "touch";
    if (boundarySelectRect.mode === "contain") {
      ensureBoundarySelectRectEl().style.border = "1px solid rgba(92, 140, 255, 0.95)";
      ensureBoundarySelectRectEl().style.background = "rgba(92, 140, 255, 0.10)";
    } else {
      ensureBoundarySelectRectEl().style.border = "1px solid rgba(61, 220, 151, 0.95)";
      ensureBoundarySelectRectEl().style.background = "rgba(61, 220, 151, 0.10)";
    }
    const x0 = Math.min(boundarySelectRect.startX, boundarySelectRect.currentX);
    const y0 = Math.min(boundarySelectRect.startY, boundarySelectRect.currentY);
    const x1 = Math.max(boundarySelectRect.startX, boundarySelectRect.currentX);
    const y1 = Math.max(boundarySelectRect.startY, boundarySelectRect.currentY);
    const el = ensureBoundarySelectRectEl();
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    el.style.width = `${Math.max(0, x1 - x0)}px`;
    el.style.height = `${Math.max(0, y1 - y0)}px`;
    el.style.display = "block";
  };

  const renderBoundaryEdit = () => {
    const root = ensureBoundaryEditRoot();
    disposeChildren(root);
    const editingBoardSketch = isVerticalBoardSketchEditMode();
    const editableSegments = getEditablePlanLineSegments();
    for (let index = 0; index < editableSegments.length; index += 1) {
      const segment = editableSegments[index]!;
      const selected = selectedBoundarySegmentIndexes.has(index) || selectedBoundarySegmentIndex === index;
      const toolReference =
        (boundaryDrawTool === "align" && boundaryAlignReferenceSegmentIndex === index) ||
        (boundaryDrawTool === "trim" && boundaryTrimFirstSegmentIndex === index) ||
        (boundaryDrawTool === "fillet" && boundaryFilletFirstSegmentIndex === index) ||
        (boundaryDrawTool === "cut" && boundaryCutSegmentIndex === index);
      const hovered = hoverBoundarySegmentIndex === index && (boundaryDrawTool === "align" || boundaryDrawTool === "trim" || boundaryDrawTool === "fillet" || boundaryDrawTool === "cut");
      addBoundarySegmentVisual(
        root,
        segment,
        toolReference ? 0x8cff9b : hovered ? 0xffffff : selected ? 0xffd166 : 0x00e5ff,
        toolReference || hovered || selected ? 1 : 0.95
      );
      addBoundaryPointVisual(root, segment.a, selectedBoundaryVertex?.segmentIndex === index && selectedBoundaryVertex.endpoint === "a");
      addBoundaryPointVisual(root, segment.b, selectedBoundaryVertex?.segmentIndex === index && selectedBoundaryVertex.endpoint === "b");
    }
    const dimensionIndexes = new Set(selectedBoundarySegmentIndexes);
    if (selectedBoundarySegmentIndex != null) dimensionIndexes.add(selectedBoundarySegmentIndex);
    for (const index of dimensionIndexes) {
      const segment = editableSegments[index];
      if (segment) addBoundarySegmentDimension(root, index, segment);
    }
    if (boundaryTrackedPoint) {
      addBoundaryPointVisual(root, boundaryTrackedPoint, true, 0x8cff9b);
      if (boundaryTrackedAlignedPoint && floorPointDistMm(boundaryTrackedPoint, boundaryTrackedAlignedPoint) > 2) {
        addBoundaryLineVisual(root, boundaryTrackedPoint, boundaryTrackedAlignedPoint, 0x8cff9b, 0.42);
        addBoundaryPointVisual(root, boundaryTrackedAlignedPoint, false, 0x8cff9b);
      }
    }
    if (boundaryEditActive && boundaryFirst && boundaryHover) {
      if (boundaryDrawTool === "rectangle") {
        const points = applyDrawOffset(makeCustomFurnitureRectBoundary(boundaryFirst, boundaryHover), true);
        for (let index = 0; index < points.length; index += 1) addBoundaryLineVisual(root, points[index]!, points[(index + 1) % points.length]!, 0xffd166, 0.74);
      } else if (boundaryDrawTool === "polygon") {
        const points = applyDrawOffset(makeCustomFurniturePolygonBoundary(boundaryFirst, boundaryHover), true);
        for (let index = 0; index < points.length; index += 1) addBoundaryLineVisual(root, points[index]!, points[(index + 1) % points.length]!, 0xffd166, 0.74);
      } else if (boundaryDrawTool === "circle") {
        const points = applyDrawOffset(makeCustomFurnitureCircleBoundary(boundaryFirst, boundaryHover), true);
        for (let index = 0; index < points.length; index += 1) addBoundaryLineVisual(root, points[index]!, points[(index + 1) % points.length]!, 0xffd166, 0.74);
      } else if (boundaryDrawTool === "arc" && draftPoints.length === 2) {
        const points = applyDrawOffset(makeArcBoundary(draftPoints[0]!, draftPoints[1]!, boundaryHover), false);
        for (let index = 0; index < points.length - 1; index += 1) addBoundaryLineVisual(root, points[index]!, points[index + 1]!, 0xffd166, 0.74);
      } else {
        const points = applyDrawOffset([boundaryFirst, boundaryHover], false);
        addBoundaryLineVisual(root, points[0]!, points[1]!, 0xffd166, 0.74);
      }
    }
    root.visible = boundaryEditActive || editingBoardSketch;
  };

  const clearBoundaryTracking = () => {
    boundaryTrackingCandidate = null;
    boundaryTrackedPoint = null;
    boundaryTrackedAlignedPoint = null;
    if (boundaryTrackingTimer) {
      clearTimeout(boundaryTrackingTimer);
      boundaryTrackingTimer = null;
    }
  };

  const clearBoundaryDraft = () => {
    boundarySegments = [];
    boundaryFirst = null;
    boundaryHover = null;
    hoverBoundarySegmentIndex = null;
    selectedBoundarySegmentIndex = null;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundaryVertex = null;
    boundaryDrag = null;
    boundarySelectRect = null;
    hoverBoundarySegmentIndex = null;
    boundaryTrimFirstSegmentIndex = null;
    boundaryAlignReferenceSegmentIndex = null;
    boundaryFilletFirstSegmentIndex = null;
    boundaryCutSegmentIndex = null;
    hideBoundarySelectRect();
    boundarySnap = null;
    clearBoundaryTracking();
    draftPoints = [];
    draftHoverPoint = null;
    draftHoverSegment = null;
    draftPickedVerticalBoardSegments = [];
    boundaryUndoStack.splice(0, boundaryUndoStack.length);
    boundaryRedoStack.splice(0, boundaryRedoStack.length);
    args.drawSnapOverlay.hide();
    args.hideHoverCursor();
    renderBoundaryEdit();
  };

  const resetBoundaryInProgress = () => {
    boundaryFirst = null;
    boundaryHover = null;
    hoverBoundarySegmentIndex = null;
    draftPoints = [];
    draftHoverPoint = null;
    draftHoverSegment = null;
    draftPickedVerticalBoardSegments = [];
    boundaryTrimFirstSegmentIndex = null;
    boundaryAlignReferenceSegmentIndex = null;
    boundaryFilletFirstSegmentIndex = null;
    boundaryCutSegmentIndex = null;
    boundarySnap = null;
    clearBoundaryTracking();
    args.drawSnapOverlay.hide();
    args.hideHoverCursor();
    renderBoundaryEdit();
  };

  const captureBoundaryEditState = (): CustomFurnitureBoundaryEditState => ({
    segments: boundarySegments,
    first: boundaryFirst,
    hover: boundaryHover,
    draftPoints,
    selectedSegmentIndex: selectedBoundarySegmentIndex,
    selectedSegmentIndexes: Array.from(selectedBoundarySegmentIndexes),
    selectedVertex: selectedBoundaryVertex
  });

  const restoreBoundaryEditState = (state: CustomFurnitureBoundaryEditState) => {
    const next = cloneCustomFurnitureBoundaryEditState(state);
    boundarySegments = next.segments;
    boundaryFirst = next.first;
    boundaryHover = next.hover;
    draftPoints = next.draftPoints;
    selectedBoundarySegmentIndex = next.selectedSegmentIndex;
    selectedBoundarySegmentIndexes.clear();
    for (const index of next.selectedSegmentIndexes ?? []) selectedBoundarySegmentIndexes.add(index);
    if (next.selectedSegmentIndex != null && selectedBoundarySegmentIndexes.size === 0) {
      selectedBoundarySegmentIndexes.add(next.selectedSegmentIndex);
    }
    selectedBoundaryVertex = next.selectedVertex;
    boundaryDrag = null;
    boundarySelectRect = null;
    hideBoundarySelectRect();
    boundarySnap = null;
    args.drawSnapOverlay.hide();
    args.hideHoverCursor();
    renderBoundaryEdit();
    args.refreshProps();
  };

  const pushBoundaryUndoState = () => {
    boundaryUndoStack.push(cloneCustomFurnitureBoundaryEditState(captureBoundaryEditState()));
    if (boundaryUndoStack.length > 100) boundaryUndoStack.shift();
    boundaryRedoStack.splice(0, boundaryRedoStack.length);
  };

  const undoBoundaryEdit = () => {
    if (!boundaryEditActive) return false;
    const previous = popCustomFurnitureBoundaryUndoState(captureBoundaryEditState(), boundaryUndoStack, boundaryRedoStack);
    if (!previous) return false;
    restoreBoundaryEditState(previous);
    args.setStatus(`Furniture boundary: undo. ${boundarySegments.length} line(s).`);
    return true;
  };

  const redoBoundaryEdit = () => {
    if (!boundaryEditActive) return false;
    const next = popCustomFurnitureBoundaryRedoState(captureBoundaryEditState(), boundaryUndoStack, boundaryRedoStack);
    if (!next) return false;
    restoreBoundaryEditState(next);
    args.setStatus(`Furniture boundary: redo. ${boundarySegments.length} line(s).`);
    return true;
  };

  const handleBoundaryEscape = () => {
    if (!boundaryEditActive) return false;
    const escapeAction = resolveCustomFurnitureBoundaryEscapeAction(
      boundaryDrawTool,
      !!boundaryFirst || !!boundaryHover || draftPoints.length > 0
    );
    if (escapeAction === "cancelDraft") {
      resetBoundaryInProgress();
      args.setStatus("Furniture boundary: current line canceled.");
    } else if (escapeAction === "selectTool") {
      activeTool = "boundary";
      boundaryDrawTool = "select";
      resetBoundaryInProgress();
      args.setLayoutSelectTool?.();
      buildBoundaryTopbar();
      args.refreshProps();
      args.setStatus("Furniture boundary: Select tool active.");
    } else {
      selectedBoundarySegmentIndex = null;
      selectedBoundarySegmentIndexes.clear();
      selectedBoundaryVertex = null;
      boundaryTrimFirstSegmentIndex = null;
      boundaryAlignReferenceSegmentIndex = null;
      boundaryFilletFirstSegmentIndex = null;
      boundaryCutSegmentIndex = null;
      boundaryMoveActive = false;
      boundarySnap = null;
      args.drawSnapOverlay.hide();
      args.hideHoverCursor();
      buildBoundaryTopbar();
      renderBoundaryEdit();
      args.refreshProps();
      args.setStatus("Furniture boundary: selection cleared. Use Finish or Cancel to leave boundary editing.");
    }
    return true;
  };

  const handleEscapeKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" && ev.code !== "Escape") return false;
    if (!handleBoundaryEscape()) return false;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    return true;
  };

  const buildDraftLine = () => {
    if (!draftLine) {
      draftLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x49a7ff, transparent: true, opacity: 0.95, depthTest: false })
      );
      draftLine.renderOrder = 80;
      args.layoutRoot.add(draftLine);
    }
    const rawPreviewPoints =
      activeTool === "verticalBoard"
        ? boundaryFirst && draftHoverPoint && boundaryDrawTool === "rectangle"
          ? [...makeCustomFurnitureRectBoundary(boundaryFirst, draftHoverPoint), boundaryFirst]
          : boundaryFirst && draftHoverPoint && boundaryDrawTool === "polygon"
            ? [...makeCustomFurniturePolygonBoundary(boundaryFirst, draftHoverPoint), makeCustomFurniturePolygonBoundary(boundaryFirst, draftHoverPoint)[0]!]
            : boundaryFirst && draftHoverPoint && boundaryDrawTool === "circle"
              ? [...makeCustomFurnitureCircleBoundary(boundaryFirst, draftHoverPoint), makeCustomFurnitureCircleBoundary(boundaryFirst, draftHoverPoint)[0]!]
              : draftPoints.length === 2 && draftHoverPoint && boundaryDrawTool === "arc"
                ? makeArcBoundary(draftPoints[0]!, draftPoints[1]!, draftHoverPoint)
                : draftPoints.length > 0
          ? makeCustomFurnitureVerticalBoardDraftPreview(draftPoints, draftHoverPoint)
          : draftHoverSegment
            ? getCustomFurnitureSegmentPathPoints(draftHoverSegment)
            : []
        : activeTool === "horizontalBoard" && boundaryFirst && draftHoverPoint && boundaryDrawTool === "rectangle"
          ? [...makeCustomFurnitureRectBoundary(boundaryFirst, draftHoverPoint), boundaryFirst]
          : activeTool === "horizontalBoard" && boundaryFirst && draftHoverPoint && boundaryDrawTool === "polygon"
            ? [...makeCustomFurniturePolygonBoundary(boundaryFirst, draftHoverPoint), makeCustomFurniturePolygonBoundary(boundaryFirst, draftHoverPoint)[0]!]
            : activeTool === "horizontalBoard" && boundaryFirst && draftHoverPoint && boundaryDrawTool === "circle"
              ? [...makeCustomFurnitureCircleBoundary(boundaryFirst, draftHoverPoint), makeCustomFurnitureCircleBoundary(boundaryFirst, draftHoverPoint)[0]!]
              : activeTool === "horizontalBoard" && draftPoints.length === 2 && draftHoverPoint && boundaryDrawTool === "arc"
                ? makeArcBoundary(draftPoints[0]!, draftPoints[1]!, draftHoverPoint)
                : boundaryEditActive && draftPoints.length >= 3
                  ? [...draftPoints, draftPoints[0]!]
                  : draftPoints;
    const previewPoints = activeTool === "verticalBoard" || activeTool === "horizontalBoard" ? applyDrawOffset(rawPreviewPoints, false) : rawPreviewPoints;
    const points = previewPoints.map((point) => new THREE.Vector3(mmToM(point.x), 0.025, mmToM(point.z)));
    draftLine.geometry.dispose();
    draftLine.geometry = new THREE.BufferGeometry().setFromPoints(points.length > 1 ? points : [new THREE.Vector3(), new THREE.Vector3()]);
    renderDraftBoardPreview(
      activeTool === "verticalBoard" && previewPoints.length >= 2
        ? { a: previewPoints[0]!, b: previewPoints[previewPoints.length - 1]!, arcPoints: previewPoints.length > 2 ? previewPoints : undefined }
        : null
    );
  };

  const setBoundaryDrawTool = (tool: CustomFurnitureBoundaryDrawTool) => {
    releaseCustomFurnitureButtonMagnetCapture(document);
    boundaryEditActive = true;
    activeTool = "boundary";
    boundaryDrawTool = tool;
    hoverBoundarySegmentIndex = null;
    if (tool !== "align") boundaryAlignReferenceSegmentIndex = null;
    if (tool !== "trim") boundaryTrimFirstSegmentIndex = null;
    if (tool !== "fillet") boundaryFilletFirstSegmentIndex = null;
    if (tool !== "cut") boundaryCutSegmentIndex = null;
    resetBoundaryInProgress();
    args.syncViewerCursor?.();
    buildCustomFurnitureTopbar();
    const label =
      tool === "select"
        ? "Furniture boundary: Select - click boundary lines or drag empty floorplan space for selection rectangle."
        : tool === "trim"
          ? "Furniture boundary: Trim/Extend - click first line, then second line to create a shared corner."
          : tool === "align"
            ? "Furniture boundary: Align - click reference line first, then the line that should move."
            : tool === "fillet"
              ? "Furniture boundary: Fillet - click first corner line, click second corner line, then enter radius."
              : tool === "cut"
                ? "Furniture boundary: Cut - click the line, then click the exact cut position."
        : tool === "rectangle"
        ? "Furniture boundary: Rectangle - click first and opposite corner, then Finish."
        : tool === "polygon"
          ? "Furniture boundary: Polygon - click center and one corner, then Finish."
        : tool === "circle"
          ? "Furniture boundary: Circle - click center and radius, then Finish."
          : tool === "arc"
            ? "Furniture boundary: Arc - click start, arc point and end, then Finish."
            : tool === "pickLines"
              ? "Furniture boundary: Pick Lines - click traced boundary points."
              : tool === "spline"
                ? "Furniture boundary: Spline - click smooth boundary points, then Finish."
                : "Furniture boundary: click boundary line points, then Finish.";
    args.setStatus(label);
    args.refreshProps();
  };

  const pointsToSegments = (points: CustomFurniturePlanPoint[], closed: boolean): CustomFurnitureBoundarySegment[] => {
    if (points.length < 2) return [];
    const segments: CustomFurnitureBoundarySegment[] = [];
    const count = closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index += 1) {
      const a = points[index]!;
      const b = points[(index + 1) % points.length]!;
      if (floorPointDistMm(a, b) >= 2) segments.push({ a: { ...a }, b: { ...b } });
    }
    return segments;
  };

  const applyDrawOffset = (points: CustomFurniturePlanPoint[], closed = false) =>
    offsetCustomFurniturePlanPath(points, drawOffsetMm, drawOffsetDirection, closed);

  const offsetBoundarySegments = (segments: CustomFurnitureBoundarySegment[]) =>
    segments.map((segment) => {
      const path = applyDrawOffset(getCustomFurnitureSegmentPathPoints(segment), false);
      return {
        ...segment,
        a: path[0]!,
        b: path[path.length - 1]!,
        ...(path.length > 2 ? { arcPoints: path } : { arcPoints: undefined })
      };
    });

  const offsetSegmentsByDelta = (segments: CustomFurnitureBoundarySegment[], deltaMm: number) =>
    segments.map((segment) => {
      const path = offsetPlanLinePath(getCustomFurnitureSegmentPathPoints(segment), deltaMm, 1, false);
      return {
        ...segment,
        a: { ...path[0]! },
        b: { ...path[path.length - 1]! },
        ...(path.length > 2 ? { arcPoints: path } : { arcPoints: undefined })
      };
    });

  const shiftEditableSketchForOffsetChange = (previousOffsetMm: number, nextOffsetMm: number) => {
    const previous = previousOffsetMm * drawOffsetDirection;
    const next = nextOffsetMm * drawOffsetDirection;
    const delta = next - previous;
    if (Math.abs(delta) < 0.5 || !isVerticalBoardSketchEditMode()) return;
    setEditablePlanLineSegments(offsetSegmentsByDelta(getEditablePlanLineSegments(), delta));
    renderBoundaryEdit();
    buildDraftLine();
  };

  const isVerticalBoardSketchEditMode = () =>
    activeTool === "verticalBoard" && verticalBoardDrawMode === "line" && (boundaryDrawTool === "select" || boundaryDrawTool === "trim" || boundaryDrawTool === "align");

  const getEditablePlanLineSegments = () => (isVerticalBoardSketchEditMode() ? draftPickedVerticalBoardSegments : boundarySegments);

  const setEditablePlanLineSegments = (segments: CustomFurnitureBoundarySegment[]) => {
    if (isVerticalBoardSketchEditMode()) draftPickedVerticalBoardSegments = segments;
    else boundarySegments = segments;
  };

  const resetPlanLineEditRefs = () => {
    selectedBoundarySegmentIndex = null;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundaryVertex = null;
    boundaryTrimFirstSegmentIndex = null;
    boundaryAlignReferenceSegmentIndex = null;
    hoverBoundarySegmentIndex = null;
  };

  const resetSharedDrawInProgress = () => {
    boundaryFirst = null;
    boundaryHover = null;
    draftPoints = [];
    draftHoverPoint = null;
    draftHoverSegment = null;
    boundarySnap = null;
    clearBoundaryTracking();
    args.drawSnapOverlay.hide();
    args.hideHoverCursor();
    renderBoundaryEdit();
    buildDraftLine();
  };

  const flipDrawOffsetDirection = () => {
    drawOffsetDirection *= -1;
    if (activeTool === "verticalBoard" || activeTool === "horizontalBoard") buildDraftLine();
    if (boundaryEditActive) renderBoundaryEdit();
    buildCustomFurnitureTopbar();
    args.setStatus(`Draw offset direction: ${drawOffsetDirection > 0 ? "positive" : "negative"}.`);
  };

  const getActivePlanSegments = () => {
    if (boundaryEditActive) return boundarySegments;
    const furniture = findActiveFurniture();
    const furnitureSegments = furniture ? getCustomFurniturePlanSegmentsForParams(furniture.params) : [];
    return activeTool === "verticalBoard" ? [...furnitureSegments, ...draftPickedVerticalBoardSegments] : furnitureSegments;
  };

  const addBoundarySegments = (segments: CustomFurnitureBoundarySegment[]) => {
    if (segments.length === 0) return;
    pushBoundaryUndoState();
    boundarySegments.push(...segments);
    selectedBoundarySegmentIndex = segments.length > 0 ? boundarySegments.length - segments.length : selectedBoundarySegmentIndex;
    selectedBoundarySegmentIndexes.clear();
    if (selectedBoundarySegmentIndex != null) selectedBoundarySegmentIndexes.add(selectedBoundarySegmentIndex);
    selectedBoundaryVertex = null;
    boundaryFirst = null;
    boundaryHover = null;
    draftPoints = [];
    renderBoundaryEdit();
    args.refreshProps();
  };

  const rememberBoundaryTrackingPoint = (point: CustomFurniturePlanPoint, base?: CustomFurniturePlanPoint | null) => {
    if (base && floorPointDistMm(point, base) <= 3) return;
    if (boundaryTrackedPoint && floorPointDistMm(boundaryTrackedPoint, point) <= 3) return;
    if (boundaryTrackingCandidate && floorPointDistMm(boundaryTrackingCandidate, point) <= 3) return;
    boundaryTrackingCandidate = { ...point };
    if (boundaryTrackingTimer) clearTimeout(boundaryTrackingTimer);
    boundaryTrackingTimer = setTimeout(() => {
      if (!boundaryTrackingCandidate) return;
      boundaryTrackedPoint = { ...boundaryTrackingCandidate };
      boundaryTrackedAlignedPoint = null;
      boundaryTrackingTimer = null;
      renderBoundaryEdit();
    }, 180);
  };

  const updateBoundaryTrackingFromSnap = (snap: PlanSnapResult | null, base?: CustomFurniturePlanPoint | null) => {
    if (!snap || snap.kind === "none") return false;
    if (snap.kind !== "endpoint" && snap.kind !== "corner" && snap.kind !== "midpoint") return false;
    rememberBoundaryTrackingPoint({ x: Math.round(snap.point.x * 1000), z: Math.round(snap.point.z * 1000) }, base);
    return true;
  };

  const boundarySnapCandidate = (
    raw: THREE.Vector3,
    rect: DOMRect,
    point: THREE.Vector3,
    kind: Exclude<PlanSnapResult["kind"], "none">,
    a?: THREE.Vector3 | null,
    b?: THREE.Vector3 | null
  ) => {
    const rawScreen = worldToScreen(raw, args.getCamera(), rect);
    const pointScreen = worldToScreen(point, args.getCamera(), rect);
    const px = Math.hypot(rawScreen.x - pointScreen.x, rawScreen.y - pointScreen.y);
    return { point, kind, a: a ?? null, b: b ?? null, px };
  };

  const resolveBoundarySegmentSnap = (raw: THREE.Vector3, rect: DOMRect, base?: CustomFurniturePlanPoint | null): PlanSnapResult | null => {
    const candidates: Array<ReturnType<typeof boundarySnapCandidate>> = [];
    const baseWorld = base ? pointToWorld(base, 0).setY(0) : null;
    for (const segment of getActivePlanSegments()) {
      const a = pointToWorld(segment.a, 0).setY(0);
      const b = pointToWorld(segment.b, 0).setY(0);
      const ab = b.clone().sub(a);
      const denom = ab.lengthSq();
      if (denom < 1e-12) continue;
      candidates.push(boundarySnapCandidate(raw, rect, a.clone(), "endpoint"));
      candidates.push(boundarySnapCandidate(raw, rect, b.clone(), "endpoint"));
      candidates.push(boundarySnapCandidate(raw, rect, a.clone().lerp(b, 0.5), "midpoint", a, b));
      const t = Math.max(0, Math.min(1, raw.clone().sub(a).dot(ab) / denom));
      candidates.push(boundarySnapCandidate(raw, rect, a.clone().addScaledVector(ab, t), "edge", a, b));
      if (baseWorld) {
        const perpendicularT = baseWorld.clone().sub(a).dot(ab) / denom;
        if (perpendicularT >= 0 && perpendicularT <= 1) {
          candidates.push(boundarySnapCandidate(raw, rect, a.clone().addScaledVector(ab, perpendicularT), "perpendicular", a, b));
        }
      }
    }
    const limits: Record<Exclude<PlanSnapResult["kind"], "none">, number> = {
      corner: 30,
      endpoint: 28,
      midpoint: 18,
      perpendicular: 24,
      edge: 16,
      axis: 16
    };
    const rank: Record<Exclude<PlanSnapResult["kind"], "none">, number> = {
      corner: 0,
      endpoint: 1,
      perpendicular: 2,
      midpoint: 3,
      edge: 4,
      axis: 5
    };
    const best = candidates
      .filter((candidate) => candidate.px <= limits[candidate.kind])
      .sort((left, right) => left.px - right.px || rank[left.kind] - rank[right.kind])[0];
    if (!best) return null;
    return {
      point: best.point.clone(),
      kind: best.kind,
      a: best.a?.clone() ?? null,
      b: best.b?.clone() ?? null,
      binding: null
    };
  };

  const makeArcBoundary = (a: CustomFurniturePlanPoint, b: CustomFurniturePlanPoint, c: CustomFurniturePlanPoint): CustomFurniturePlanPoint[] => {
    const det = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z));
    if (Math.abs(det) < 1e-5) return [a, b, c];
    const a2 = a.x * a.x + a.z * a.z;
    const b2 = b.x * b.x + b.z * b.z;
    const c2 = c.x * c.x + c.z * c.z;
    const cx = (a2 * (b.z - c.z) + b2 * (c.z - a.z) + c2 * (a.z - b.z)) / det;
    const cz = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / det;
    const start = Math.atan2(a.z - cz, a.x - cx);
    const mid = Math.atan2(b.z - cz, b.x - cx);
    const end = Math.atan2(c.z - cz, c.x - cx);
    const normalize = (angle: number) => (angle + Math.PI * 2) % (Math.PI * 2);
    const isBetweenCcw = (from: number, through: number, to: number) => {
      const total = normalize(to - from);
      const part = normalize(through - from);
      return part <= total;
    };
    const ccw = isBetweenCcw(start, mid, end);
    const delta = ccw ? normalize(end - start) : -normalize(start - end);
    const radius = Math.hypot(a.x - cx, a.z - cz);
    const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
    return Array.from({ length: steps + 1 }, (_, index) => {
      const angle = start + (delta * index) / steps;
      return { x: Math.round(cx + Math.cos(angle) * radius), z: Math.round(cz + Math.sin(angle) * radius) };
    });
  };

  const appendBoundaryPoint = (point: CustomFurniturePlanPoint, stopChainAfterSegment = false) => {
    if (boundaryDrawTool === "select") return;
    if (boundaryDrawTool === "rectangle") {
      if (!boundaryFirst) {
        boundaryFirst = point;
        boundaryHover = point;
        renderBoundaryEdit();
        args.refreshProps();
        return;
      }
      addBoundarySegments(pointsToSegments(applyDrawOffset(makeCustomFurnitureRectBoundary(boundaryFirst, point), true), true));
      return;
    }
    if (boundaryDrawTool === "polygon") {
      if (!boundaryFirst) {
        boundaryFirst = point;
        boundaryHover = point;
        renderBoundaryEdit();
        args.refreshProps();
        return;
      }
      addBoundarySegments(pointsToSegments(applyDrawOffset(makeCustomFurniturePolygonBoundary(boundaryFirst, point), true), true));
      return;
    }
    if (boundaryDrawTool === "circle") {
      if (!boundaryFirst) {
        boundaryFirst = point;
        boundaryHover = point;
        renderBoundaryEdit();
        args.refreshProps();
        return;
      }
      addBoundarySegments(pointsToSegments(applyDrawOffset(makeCustomFurnitureCircleBoundary(boundaryFirst, point), true), true));
      return;
    }
    if (boundaryDrawTool === "arc") {
      draftPoints.push(point);
      boundaryFirst = point;
      boundaryHover = point;
      if (draftPoints.length === 3) addBoundarySegments(pointsToSegments(applyDrawOffset(makeArcBoundary(draftPoints[0]!, draftPoints[1]!, draftPoints[2]!), false), false));
      else {
        renderBoundaryEdit();
        args.refreshProps();
      }
      return;
    }
    if (!boundaryFirst) {
      boundaryFirst = point;
      boundaryHover = point;
      selectedBoundarySegmentIndex = null;
      selectedBoundarySegmentIndexes.clear();
      selectedBoundaryVertex = null;
      renderBoundaryEdit();
      args.refreshProps();
      return;
    }
    if (floorPointDistMm(boundaryFirst, point) < 2) return;
    pushBoundaryUndoState();
    const offsetPoints = applyDrawOffset([boundaryFirst, point], false);
    boundarySegments.push({ a: { ...offsetPoints[0]! }, b: { ...offsetPoints[1]! } });
    selectedBoundarySegmentIndex = boundarySegments.length - 1;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(selectedBoundarySegmentIndex);
    selectedBoundaryVertex = null;
    boundaryFirst = stopChainAfterSegment ? null : point;
    boundaryHover = stopChainAfterSegment ? null : point;
    if (stopChainAfterSegment) clearBoundaryTracking();
    renderBoundaryEdit();
    args.refreshProps();
  };

  const addVerticalSketchSegments = (segments: CustomFurnitureBoundarySegment[]) => {
    if (segments.length === 0) return;
    draftPickedVerticalBoardSegments.push(...segments);
    selectedBoundarySegmentIndex = draftPickedVerticalBoardSegments.length - 1;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(selectedBoundarySegmentIndex);
    selectedBoundaryVertex = null;
    boundaryFirst = null;
    boundaryHover = null;
    draftPoints = [];
    draftHoverPoint = null;
    renderBoundaryEdit();
    buildDraftLine();
    args.refreshProps();
  };

  const appendBoardDrawPoint = (point: CustomFurniturePlanPoint, stopChainAfterSegment = false) => {
    if (boundaryDrawTool === "select") return;
    if (activeTool === "verticalBoard") {
      if (boundaryDrawTool === "rectangle") {
        if (!boundaryFirst) {
          boundaryFirst = point;
          draftHoverPoint = point;
          buildDraftLine();
          return;
        }
        addVerticalSketchSegments(pointsToSegments(applyDrawOffset(makeCustomFurnitureRectBoundary(boundaryFirst, point), true), true));
        return;
      }
      if (boundaryDrawTool === "polygon") {
        if (!boundaryFirst) {
          boundaryFirst = point;
          draftHoverPoint = point;
          buildDraftLine();
          return;
        }
        addVerticalSketchSegments(pointsToSegments(applyDrawOffset(makeCustomFurniturePolygonBoundary(boundaryFirst, point), true), true));
        return;
      }
      if (boundaryDrawTool === "circle") {
        if (!boundaryFirst) {
          boundaryFirst = point;
          draftHoverPoint = point;
          buildDraftLine();
          return;
        }
        addVerticalSketchSegments(pointsToSegments(applyDrawOffset(makeCustomFurnitureCircleBoundary(boundaryFirst, point), true), true));
        return;
      }
      if (boundaryDrawTool === "arc") {
        draftPoints.push(point);
        draftHoverPoint = point;
        if (draftPoints.length === 3) addVerticalSketchSegments(pointsToSegments(applyDrawOffset(makeArcBoundary(draftPoints[0]!, draftPoints[1]!, draftPoints[2]!), false), false));
        else buildDraftLine();
        return;
      }
      if (!boundaryFirst) {
        boundaryFirst = point;
        draftPoints = [point];
        draftHoverPoint = point;
        buildDraftLine();
        return;
      }
      if (floorPointDistMm(boundaryFirst, point) < 2) return;
      const offsetPoints = applyDrawOffset([boundaryFirst, point], false);
      addVerticalSketchSegments([{ a: { ...offsetPoints[0]! }, b: { ...offsetPoints[1]! } }]);
      boundaryFirst = stopChainAfterSegment ? null : point;
      draftPoints = stopChainAfterSegment ? [] : [point];
      if (stopChainAfterSegment) clearBoundaryTracking();
      return;
    }

    if (activeTool === "horizontalBoard") {
      if (boundaryDrawTool === "rectangle") {
        if (!boundaryFirst) {
          boundaryFirst = point;
          draftHoverPoint = point;
          buildDraftLine();
          return;
        }
        draftPoints = makeCustomFurnitureRectBoundary(boundaryFirst, point);
        boundaryFirst = null;
        draftHoverPoint = null;
        buildDraftLine();
        return;
      }
      if (boundaryDrawTool === "polygon") {
        if (!boundaryFirst) {
          boundaryFirst = point;
          draftHoverPoint = point;
          buildDraftLine();
          return;
        }
        draftPoints = makeCustomFurniturePolygonBoundary(boundaryFirst, point);
        boundaryFirst = null;
        draftHoverPoint = null;
        buildDraftLine();
        return;
      }
      if (boundaryDrawTool === "circle") {
        if (!boundaryFirst) {
          boundaryFirst = point;
          draftHoverPoint = point;
          buildDraftLine();
          return;
        }
        draftPoints = makeCustomFurnitureCircleBoundary(boundaryFirst, point);
        boundaryFirst = null;
        draftHoverPoint = null;
        buildDraftLine();
        return;
      }
      if (boundaryDrawTool === "arc") {
        draftPoints.push(point);
        draftHoverPoint = point;
        if (draftPoints.length === 3) {
          draftPoints = makeArcBoundary(draftPoints[0]!, draftPoints[1]!, draftPoints[2]!);
          draftHoverPoint = null;
        }
        buildDraftLine();
        return;
      }
      draftPoints.push(point);
      buildDraftLine();
    }
  };

  const syncCounterFromIds = () => {
    let next = args.getCounter();
    for (const item of args.customFurniture) {
      const match = /^cf(\d+)$/.exec(item.id);
      if (match) next = Math.max(next, Number(match[1]) + 1);
    }
    args.setCounter(next);
  };

  const getFurnitureBaseMm = (params: CustomFurnitureParams) => params.baseOffsetMm;
  const getFurnitureTopMm = (params: CustomFurnitureParams) => params.topOffsetMm;

  const makeDefaultParams = (boundary: CustomFurniturePlanPoint[], segments?: CustomFurnitureBoundarySegment[]): CustomFurnitureParams => ({
    name: `Custom furniture ${args.getCounter()}`,
    baseConstraint: "projectBase",
    baseOffsetMm: 0,
    topConstraint: "absolute",
    topOffsetMm: 720,
    boundary: sanitizeCustomFurniturePlanPolygon(boundary),
    boundarySegments: segments ? cloneCustomFurnitureBoundarySegments(segments) : undefined,
    boards: []
  });

  const makeVerticalBoardProfile = (furniture: CustomFurnitureInstance, a: CustomFurniturePlanPoint, b: CustomFurniturePlanPoint) =>
    makeCustomFurnitureVerticalBoardProfile(furniture.params, a, b, {
      baseConstraint: draftBoardBaseConstraint,
      baseOffsetMm: draftBoardBaseOffsetMm,
      topConstraint: draftBoardTopConstraint,
      topOffsetMm: draftBoardTopOffsetMm
    });

  const makeVerticalBoardProfileForPath = (furniture: CustomFurnitureInstance, path: CustomFurniturePlanPoint[]) =>
    makeCustomFurnitureVerticalBoardProfileForLength(furniture.params, customFurniturePlanPathLengthMm(path), {
      baseConstraint: draftBoardBaseConstraint,
      baseOffsetMm: draftBoardBaseOffsetMm,
      topConstraint: draftBoardTopConstraint,
      topOffsetMm: draftBoardTopOffsetMm
    });

  const syncVerticalBoardProfileToConstraints = (furniture: CustomFurnitureInstance, board: CustomFurnitureBoardParams) => {
    if (board.workplane.type !== "vertical") return;
    const path = board.workplane.pathMm && board.workplane.pathMm.length >= 2 ? board.workplane.pathMm : [board.workplane.aMm, board.workplane.bMm];
    board.profile = makeCustomFurnitureVerticalBoardProfileForLength(furniture.params, customFurniturePlanPathLengthMm(path), {
      baseConstraint: board.baseConstraint,
      baseOffsetMm: board.baseOffsetMm,
      topConstraint: board.topConstraint,
      topOffsetMm: board.topOffsetMm
    });
  };

  const verticalBoardSegmentFromBoard = (board: CustomFurnitureBoardParams): CustomFurnitureBoundarySegment | null => {
    if (board.workplane.type !== "vertical") return null;
    const path = board.workplane.pathMm && board.workplane.pathMm.length >= 2 ? board.workplane.pathMm : [board.workplane.aMm, board.workplane.bMm];
    if (path.length < 2) return null;
    return {
      a: { ...path[0]! },
      b: { ...path[path.length - 1]! },
      ...(path.length > 2 ? { arcPoints: path.map((point) => ({ ...point })) } : {})
    };
  };

  const makeVerticalBoardFromSegment = (
    furniture: CustomFurnitureInstance,
    segment: CustomFurnitureBoundarySegment,
    opts?: { source?: CustomFurnitureBoardParams; applyOffset?: boolean }
  ): CustomFurnitureBoardParams => {
    const source = opts?.source;
    const rawPath = getCustomFurnitureSegmentPathPoints(segment);
    const path = opts?.applyOffset === true ? applyDrawOffset(rawPath, false) : rawPath;
    const a = path[0]!;
    const b = path[path.length - 1]!;
    return {
      id: source?.id ?? nextBoardId(furniture),
      name: source?.name ?? `Board ${furniture.params.boards.length + 1}`,
      kind: "vertical",
      workplane: { type: "vertical", aMm: a, bMm: b, pathMm: path.length > 2 ? path : undefined, mirrored: source?.workplane.type === "vertical" ? source.workplane.mirrored : false },
      profile: path.length > 2 ? makeVerticalBoardProfileForPath(furniture, path) : makeVerticalBoardProfile(furniture, a, b),
      thicknessMm: source?.thicknessMm ?? draftBoardThicknessMm,
      materialId: source?.materialId ?? draftBoardMaterialId,
      baseConstraint: source?.baseConstraint ?? draftBoardBaseConstraint,
      baseOffsetMm: source?.baseOffsetMm ?? draftBoardBaseOffsetMm,
      topConstraint: source?.topConstraint ?? draftBoardTopConstraint,
      topOffsetMm: source?.topOffsetMm ?? draftBoardTopOffsetMm,
      justification: source?.justification ?? draftBoardJustification,
      edgeBanding: cloneJson(source?.edgeBanding ?? [])
    };
  };

  const makeDraftVerticalBoard = (
    furniture: CustomFurnitureInstance,
    segment: CustomFurnitureBoundarySegment,
    id = "__draftVerticalBoard"
  ): CustomFurnitureBoardParams => {
    const path = getCustomFurnitureSegmentPathPoints(segment);
    const a = path[0]!;
    const b = path[path.length - 1]!;
    return {
      id,
      name: "Vertical board draft",
      kind: "vertical",
      workplane: { type: "vertical", aMm: a, bMm: b, pathMm: path.length > 2 ? path : undefined, mirrored: false },
      profile: path.length > 2 ? makeVerticalBoardProfileForPath(furniture, path) : makeVerticalBoardProfile(furniture, a, b),
      thicknessMm: draftBoardThicknessMm,
      materialId: draftBoardMaterialId,
      baseConstraint: draftBoardBaseConstraint,
      baseOffsetMm: draftBoardBaseOffsetMm,
      topConstraint: draftBoardTopConstraint,
      topOffsetMm: draftBoardTopOffsetMm,
      justification: draftBoardJustification,
      edgeBanding: []
    };
  };

  const renderDraftBoardPreview = (currentSegment: CustomFurnitureBoundarySegment | null) => {
    if (draftBoardPreviewRoot) {
      args.layoutRoot.remove(draftBoardPreviewRoot);
      disposeObject3D(draftBoardPreviewRoot);
      draftBoardPreviewRoot = null;
    }
    const furniture = findActiveFurniture();
    if (activeTool !== "verticalBoard" || !furniture) return;
    const segments = cloneCustomFurnitureBoundarySegments(draftPickedVerticalBoardSegments);
    if (currentSegment) segments.push(currentSegment);
    if (segments.length === 0) return;
    const root = new THREE.Group();
    root.name = "customFurnitureVerticalBoardDraftPreview";
    root.renderOrder = 82;
    for (let index = 0; index < segments.length; index += 1) {
      const source = verticalBoardSketchSourceBoards[index];
      const board = source
        ? makeVerticalBoardFromSegment(furniture, segments[index]!, { source, applyOffset: false })
        : makeDraftVerticalBoard(furniture, segments[index]!, `__draftVerticalBoard_${index}`);
      const selected = selectedBoundarySegmentIndexes.has(index) || selectedBoundarySegmentIndex === index;
      const previewMaterial = makeMeshMaterial(args.catalog, board.materialId, false);
      previewMaterial.transparent = true;
      previewMaterial.opacity = selected ? 0.52 : 0.38;
      previewMaterial.depthWrite = false;
      const mesh = new THREE.Mesh(makeCustomFurnitureBoardGeometry(board), previewMaterial);
      mesh.renderOrder = 82;
      root.add(mesh);
      const outline = new THREE.LineSegments(
        makeCustomFurnitureBoardOutlineGeometry(board, mesh.geometry),
        new THREE.LineBasicMaterial({ color: selected ? 0xffd166 : 0x49a7ff, transparent: true, opacity: 0.96, depthTest: false })
      );
      outline.renderOrder = 83;
      root.add(outline);
    }
    draftBoardPreviewRoot = root;
    args.layoutRoot.add(root);
  };

  const createBoardObject = (furniture: CustomFurnitureInstance, board: CustomFurnitureBoardParams): CustomFurnitureBoardObject => {
    const selected = furniture.id === selectedFurnitureId && board.id === selectedBoardId;
    const root = new THREE.Group();
    root.name = `customFurnitureBoard_${furniture.id}_${board.id}`;
    root.userData.kind = "customFurnitureBoardRoot";
    root.userData.customFurnitureId = furniture.id;
    root.userData.customFurnitureBoardId = board.id;

    const mesh = new THREE.Mesh(makeCustomFurnitureBoardGeometry(board), makeMeshMaterial(args.catalog, board.materialId, selected));
    mesh.name = `customFurnitureBoardMesh_${furniture.id}_${board.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.kind = "customFurnitureBoard";
    mesh.userData.customFurnitureId = furniture.id;
    mesh.userData.customFurnitureBoardId = board.id;
    root.add(mesh);

    const outline = new THREE.LineSegments(
      makeCustomFurnitureBoardOutlineGeometry(board, mesh.geometry),
      new THREE.LineBasicMaterial({ color: selected ? 0xffc83d : 0x55636f, transparent: true, opacity: selected ? 1 : 0.72 })
    );
    outline.name = `customFurnitureBoardOutline_${furniture.id}_${board.id}`;
    outline.userData.kind = "customFurnitureBoardOutline";
    outline.userData.customFurnitureId = furniture.id;
    outline.userData.customFurnitureBoardId = board.id;
    root.add(outline);

    const edgeBandLines = new THREE.LineSegments(
      makeCustomFurnitureBoardEdgeGeometry(board, board.edgeBanding.map((edge) => edge.edgeIndex)),
      new THREE.LineBasicMaterial({ color: 0xff8c2a, linewidth: 2, depthTest: false })
    );
    edgeBandLines.renderOrder = 90;
    root.add(edgeBandLines);

    furniture.boardsRoot.add(root);
    return { boardId: board.id, root, mesh, outline, edgeBandLines };
  };

  const rebuildFurniture = (furniture: CustomFurnitureInstance) => {
    furniture.params.boundary = sanitizeCustomFurniturePlanPolygon(furniture.params.boundary);
    furniture.boundaryLine.geometry.dispose();
    furniture.boundaryLine.geometry = makeCustomFurnitureBoundaryGeometry(furniture.params.boundary, getFurnitureBaseMm(furniture.params) + 8);

    for (const boardObject of furniture.boardObjects.splice(0, furniture.boardObjects.length)) {
      furniture.boardsRoot.remove(boardObject.root);
      disposeObject3D(boardObject.root);
    }
    for (const board of furniture.params.boards) {
      board.profile = sanitizeCustomFurnitureProfile(board.profile);
      board.thicknessMm = Math.max(1, Math.round(board.thicknessMm));
      furniture.boardObjects.push(createBoardObject(furniture, board));
    }
    applyEditorIsolation();
  };

  const createCustomFurniture = (params: CustomFurnitureParams, opts?: { id?: string; skipHistory?: boolean }) => {
    const id = opts?.id ?? nextFurnitureId();
    const root = new THREE.Group();
    root.name = `customFurniture_${id}`;
    root.userData.kind = "customFurniture";
    root.userData.customFurnitureId = id;

    const boundaryLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x38a3ff, transparent: true, opacity: 0.9, depthTest: false })
    );
    boundaryLine.name = `customFurnitureBoundary_${id}`;
    boundaryLine.renderOrder = 70;
    root.add(boundaryLine);

    const boardsRoot = new THREE.Group();
    boardsRoot.name = `customFurnitureBoards_${id}`;
    root.add(boardsRoot);

    const furniture: CustomFurnitureInstance = {
      id,
      params: cloneJson(params),
      root,
      boundaryLine,
      boardsRoot,
      boardObjects: []
    };
    args.layoutRoot.add(root);
    args.customFurniture.push(furniture);
    selectedFurnitureId = id;
    selectedBoardId = null;
    syncCounterFromIds();
    rebuildFurniture(furniture);
    if (!opts?.skipHistory) args.commitHistory();
    args.refreshProps();
    return furniture;
  };

  const enterFurnitureEditor = (furnitureId: string, boardId: string | null = null) => {
    editorFurnitureId = furnitureId;
    selectedFurnitureId = furnitureId;
    selectedBoardId = boardId;
    activeTool = null;
    boundaryEditActive = false;
    boundaryEditFurnitureId = null;
    clearDraft();
    const furniture = findFurniture(furnitureId);
    if (furniture) rebuildFurniture(furniture);
    else applyEditorIsolation();
    args.ensureLayoutMode();
    args.ensureFloorplanViewerTab();
    args.setLayoutSelectTool?.();
    args.syncViewerCursor?.();
    buildCustomFurnitureTopbar();
    args.refreshProps();
    args.setStatus("Custom furniture editor: boundary accepted. Continue with boards, edge banding and furniture tools.");
  };

  const exitFurnitureEditor = () => {
    if (shouldCommitCustomFurnitureDraftBeforeLeaving(activeTool, boundaryEditActive)) {
      const previousTool = activeTool;
      finishDraft();
      if (activeTool === previousTool) return;
    }
    editorFurnitureId = null;
    boundaryEditFurnitureId = null;
    activeTool = null;
    boundaryEditActive = false;
    clearBoundaryDraft();
    clearDraft();
    restoreEditorIsolation();
    for (const furniture of args.customFurniture) {
      furniture.root.visible = true;
      furniture.boardsRoot.visible = true;
      rebuildFurniture(furniture);
    }
    args.syncViewerCursor?.();
    args.restoreStandardTopbar();
    args.refreshProps();
    args.setStatus("Custom furniture editor closed.");
  };

  const addBoard = (furniture: CustomFurnitureInstance, board: CustomFurnitureBoardParams, opts?: { skipHistory?: boolean }) => {
    furniture.params.boards.push(cloneJson(board));
    selectedFurnitureId = furniture.id;
    selectedBoardId = board.id;
    rebuildFurniture(furniture);
    if (!opts?.skipHistory) args.commitHistory();
    args.refreshProps();
  };

  const removeSelected = (opts?: { skipHistory?: boolean }) => {
    if (boundaryEditActive && deleteBoundarySelection()) return true;
    const furniture = findFurniture();
    if (!furniture) return false;
    if (selectedBoardId) {
      const index = furniture.params.boards.findIndex((board) => board.id === selectedBoardId);
      if (index < 0) return false;
      furniture.params.boards.splice(index, 1);
      selectedBoardId = null;
      rebuildFurniture(furniture);
      if (!opts?.skipHistory) args.commitHistory();
      args.refreshProps();
      return true;
    }
    const index = args.customFurniture.findIndex((item) => item.id === furniture.id);
    if (index < 0) return false;
    args.layoutRoot.remove(furniture.root);
    disposeObject3D(furniture.root);
    args.customFurniture.splice(index, 1);
    selectedFurnitureId = null;
    if (editorFurnitureId === furniture.id) {
      editorFurnitureId = null;
      restoreEditorIsolation();
    }
    if (!opts?.skipHistory) args.commitHistory();
    args.refreshProps();
    return true;
  };

  const activateTool = (tool: CustomFurnitureTool) => {
    args.ensureLayoutMode();
    args.ensureFloorplanViewerTab();
    args.setLayoutSelectTool?.();
    args.clearAppSelection();
    activeTool = tool;
    if (tool === "boundary") {
      boundaryEditActive = true;
      boundaryDrawTool = "boundaryLine";
      clearBoundaryDraft();
    }
    clearDraft();
    args.syncViewerCursor?.();
    buildCustomFurnitureTopbar();
    args.refreshProps();
    const label =
      tool === "boundary"
        ? "Furniture boundary: Line - first click starts, second click places a visible segment. Axis snap appears only near horizontal or vertical."
        : tool === "horizontalBoard"
          ? "Horizontal board: click polygon points, then Finish."
          : tool === "verticalBoard"
            ? "Vertical board: click start point, click end point, then Accept."
            : "Edge banding: click board edges.";
    args.setStatus(label);
  };

  const enterNew = () => activateTool("boundary");
  const editFurnitureBoundary = () => {
    const furniture = findFurniture(editorFurnitureId ?? selectedFurnitureId);
    if (!furniture) return args.setStatus("Select custom furniture first.");
    editorFurnitureId = furniture.id;
    selectedFurnitureId = furniture.id;
    selectedBoardId = null;
    boundaryEditFurnitureId = furniture.id;
    activeTool = "boundary";
    boundaryEditActive = true;
    boundaryDrawTool = "select";
    boundarySegments =
      furniture.params.boundarySegments && furniture.params.boundarySegments.length > 0
        ? cloneCustomFurnitureBoundarySegments(furniture.params.boundarySegments)
        : floorBoundaryToSegments(furniture.params.boundary);
    boundaryFirst = null;
    boundaryHover = null;
    hoverBoundarySegmentIndex = null;
    selectedBoundarySegmentIndex = null;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundaryVertex = null;
    draftPoints = [];
    boundaryUndoStack.splice(0, boundaryUndoStack.length);
    boundaryRedoStack.splice(0, boundaryRedoStack.length);
    clearDraft();
    renderBoundaryEdit();
    applyEditorIsolation();
    args.syncViewerCursor?.();
    buildCustomFurnitureTopbar();
    args.refreshProps();
    args.setStatus("Furniture boundary edit: select or modify boundary lines, then Finish Boundary.");
  };
  const startHorizontalBoard = () => {
    if (!findActiveFurniture()) return args.setStatus("Create or select custom furniture first.");
    activateTool("horizontalBoard");
  };
  const loadVerticalBoardSketchFromFurniture = (furniture: CustomFurnitureInstance) => {
    verticalBoardSketchSourceBoards = furniture.params.boards.filter((board) => board.workplane.type === "vertical").map((board) => cloneJson(board));
    draftPickedVerticalBoardSegments = verticalBoardSketchSourceBoards
      .map((board) => verticalBoardSegmentFromBoard(board))
      .filter((segment): segment is CustomFurnitureBoundarySegment => !!segment);
    resetPlanLineEditRefs();
    buildDraftLine();
    renderBoundaryEdit();
  };
  const startVerticalBoard = () => {
    const furniture = findActiveFurniture();
    if (!furniture) return args.setStatus("Create or select custom furniture first.");
    verticalBoardDrawMode = "line";
    boundaryDrawTool = "line";
    resetPlanLineEditRefs();
    activateTool("verticalBoard");
    loadVerticalBoardSketchFromFurniture(furniture);
  };
  const setVerticalBoardDrawMode = (mode: CustomFurnitureVerticalBoardDrawMode) => {
    verticalBoardDrawMode = mode;
    boundaryDrawTool = mode === "pickLine" ? "pickLines" : "line";
    resetPlanLineEditRefs();
    clearDraft();
    args.drawSnapOverlay.hide();
    args.hideHoverCursor();
    buildCustomFurnitureTopbar();
    args.refreshProps();
    args.setStatus(
      mode === "pickLine"
        ? "Vertical board Pick Line: click an existing layout line to copy it as the board path, then Accept."
        : "Vertical board Line: click start point, click end point, then Accept."
    );
  };
  const setBoardDrawTool = (tool: CustomFurnitureSharedDrawToolId) => {
    if (activeTool === "verticalBoard") {
      verticalBoardDrawMode = tool === "pickLines" ? "pickLine" : "line";
      boundaryDrawTool = tool === "boundaryLine" ? "line" : tool;
      resetSharedDrawInProgress();
      resetPlanLineEditRefs();
      buildCustomFurnitureTopbar();
      args.refreshProps();
      args.setStatus(tool === "pickLines" ? "Vertical board Pick Line: click existing lines, then Accept." : `Vertical board ${tool}: draw the board path, then Accept.`);
      return;
    }
    if (activeTool === "horizontalBoard") {
      boundaryDrawTool = tool === "boundaryLine" ? "line" : tool;
      resetSharedDrawInProgress();
      buildCustomFurnitureTopbar();
      args.refreshProps();
      args.setStatus(`Horizontal board ${tool}: draw the profile, then Accept.`);
    }
  };
  const startEdgeBanding = () => {
    if (!findActiveFurniture()) return args.setStatus("Create or select custom furniture first.");
    activateTool("edgeBand");
  };

  const addVerticalBoardFromSegment = (furniture: CustomFurnitureInstance, segment: CustomFurnitureBoundarySegment, opts?: { skipHistory?: boolean }) => {
    addBoard(
      furniture,
      makeVerticalBoardFromSegment(furniture, segment, { applyOffset: true }),
      opts
    );
  };

  const finishDraft = () => {
    if (!activeTool && !boundaryEditActive) return;
    const furniture = boundaryEditActive ? findFurniture() : findActiveFurniture();
    if (boundaryEditActive || isVerticalBoardSketchEditMode()) {
      const boundary = customFurnitureBoundarySegmentsToBoundary(boundarySegments);
      if (!boundary || boundary.length < 3) {
        args.setStatus("Furniture boundary: lines are not a closed loop yet.");
        return;
      }
      let acceptedFurniture = boundaryEditFurnitureId ? findFurniture(boundaryEditFurnitureId) : null;
      if (acceptedFurniture) {
        acceptedFurniture.params.boundary = sanitizeCustomFurniturePlanPolygon(boundary);
        acceptedFurniture.params.boundarySegments = cloneCustomFurnitureBoundarySegments(boundarySegments);
        rebuildFurniture(acceptedFurniture);
        args.commitHistory();
      } else {
        acceptedFurniture = createCustomFurniture(makeDefaultParams(boundary, boundarySegments));
      }
      activeTool = null;
      boundaryEditActive = false;
      boundaryEditFurnitureId = null;
      clearBoundaryDraft();
      enterFurnitureEditor(acceptedFurniture.id);
      return;
    } else if (activeTool === "horizontalBoard" && furniture) {
      const profile = sanitizeCustomFurniturePlanPolygon(applyDrawOffset(draftPoints, true)).map((point) => ({ x: point.x, y: point.z }));
      if (profile.length < 3) {
        args.setStatus("Horizontal board needs at least 3 points.");
        return;
      }
      addBoard(furniture, {
        id: nextBoardId(furniture),
        name: `Board ${furniture.params.boards.length + 1}`,
        kind: "horizontal",
        workplane: { type: "horizontal", elevationMm: getFurnitureBaseMm(furniture.params) },
        profile,
        thicknessMm: 18,
        materialId: firstMaterial(args.catalog, "board", args.catalog.kitchenDefaults.carcassMaterialId),
        baseConstraint: "furnitureBase",
        baseOffsetMm: 0,
        topConstraint: "furnitureTop",
        topOffsetMm: 0,
        justification: "positive",
        edgeBanding: []
      });
    } else if (activeTool === "verticalBoard" && furniture) {
      if (draftPickedVerticalBoardSegments.length > 0) {
        const sourceIds = new Set(verticalBoardSketchSourceBoards.map((board) => board.id));
        if (sourceIds.size > 0) furniture.params.boards = furniture.params.boards.filter((board) => !sourceIds.has(board.id));
        for (let index = 0; index < draftPickedVerticalBoardSegments.length; index += 1) {
          const source = verticalBoardSketchSourceBoards[index];
          furniture.params.boards.push(makeVerticalBoardFromSegment(furniture, draftPickedVerticalBoardSegments[index]!, { source, applyOffset: false }));
        }
        selectedFurnitureId = furniture.id;
        selectedBoardId = furniture.params.boards.at(-1)?.id ?? null;
        rebuildFurniture(furniture);
        args.commitHistory();
      } else if (draftPoints.length < 2) {
        args.setStatus("Vertical board needs start and end point.");
        return;
      } else {
        addVerticalBoardFromSegment(furniture, { a: draftPoints[0]!, b: draftPoints[1]! });
      }
    }
    activeTool = null;
    boundaryEditActive = false;
    clearBoundaryDraft();
    clearDraft();
    args.syncViewerCursor?.();
    if (editorFurnitureId) {
      buildCustomFurnitureTopbar();
      applyEditorIsolation();
    } else {
      args.restoreStandardTopbar();
    }
    args.refreshProps();
  };

  const cancelTool = () => {
    activeTool = null;
    boundaryEditActive = false;
    boundaryEditFurnitureId = null;
    clearBoundaryDraft();
    clearDraft();
    args.syncViewerCursor?.();
    if (editorFurnitureId) {
      buildCustomFurnitureTopbar();
      applyEditorIsolation();
    } else {
      restoreEditorIsolation();
      args.restoreStandardTopbar();
    }
    args.refreshProps();
    args.setStatus(editorFurnitureId ? "Custom furniture editor: tool canceled." : "Custom furniture: canceled.");
  };

  const addRibbonButton = (
    group: HTMLElement,
    opts: {
      title: string;
      iconSvg: string;
      label: string;
      onClick?: () => void;
      variant?: "success" | "danger";
      active?: boolean;
      disabled?: boolean;
    }
  ) => {
    const button = args.tb.toolButton(group, {
      title: opts.title,
      iconSvg: opts.iconSvg,
      label: opts.label,
      variant: opts.variant,
      onClick: opts.onClick ?? (() => args.setStatus(`${opts.label}: planned.`))
    });
    button.classList.toggle("active", !!opts.active);
    button.disabled = !!opts.disabled;
    if (opts.disabled) button.classList.add("cf-ribbon-disabled");
    return button;
  };

  const buildSharedDrawGroup = (row: HTMLElement, context: CustomFurnitureDrawToolbarContext) => {
    const draw = args.tb.addGroup("Draw", { row });
    draw.classList.add("cf-shared-draw-tools");
    draw.parentElement?.classList.add("cf-shared-draw-group");
    const onClick = (tool: CustomFurnitureSharedDrawToolId) => {
      if (context === "boundary") {
        return setBoundaryDrawTool(tool);
      }
      if (context === "verticalBoard") {
        return setBoardDrawTool(tool);
      }
      return setBoardDrawTool(tool);
    };
    for (const tool of getCustomFurnitureSharedDrawToolIds()) {
      const button = addRibbonButton(draw, { ...getCustomFurnitureSharedDrawToolButton({ tool, context, boundaryDrawTool, verticalBoardDrawMode, icons: CUSTOM_FURNITURE_SHARED_DRAW_ICONS }), onClick: () => onClick(tool) });
      button.dataset.drawTool = tool;
    }
    const offsetWrap = document.createElement("label");
    offsetWrap.className = "cf-draw-offset";
    offsetWrap.title = "Draw offset. Press Space while drawing to flip direction.";
    const offsetText = document.createElement("span");
    offsetText.textContent = `Offset ${drawOffsetDirection > 0 ? "+" : "-"}`;
    const offsetInput = document.createElement("input");
    offsetInput.type = "number";
    offsetInput.step = "1";
    offsetInput.value = String(drawOffsetMm);
    offsetInput.addEventListener("pointerdown", (event) => event.stopPropagation());
    offsetInput.addEventListener("click", (event) => event.stopPropagation());
    offsetInput.addEventListener("change", () => {
      const previousOffset = drawOffsetMm;
      drawOffsetMm = resolveCustomFurnitureDrawOffsetMm(offsetInput.value);
      offsetInput.value = String(drawOffsetMm);
      shiftEditableSketchForOffsetChange(previousOffset, drawOffsetMm);
      buildDraftLine();
      if (boundaryEditActive) renderBoundaryEdit();
    });
    offsetWrap.append(offsetText, offsetInput);
    draw.appendChild(offsetWrap);
  };

  function buildBoundaryTopbar() {
    args.tb.clear();
    const row = args.tb.addRow({ title: "Custom furniture boundary", className: "topbar-custom-boundary-ribbon" });
    const clipboard = args.tb.addGroup("Clipboard", { row });
    addRibbonButton(clipboard, { title: "Paste", iconSvg: args.icons.board, label: "Paste", disabled: true });
    addRibbonButton(clipboard, { title: "Cut", iconSvg: args.icons.cancel, label: "Cut", disabled: true });
    addRibbonButton(clipboard, { title: "Copy", iconSvg: args.icons.board, label: "Copy", disabled: true });

    const geometry = args.tb.addGroup("Geometry", { row });
    addRibbonButton(geometry, { title: "Join", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.line, label: "Join", disabled: true });
    addRibbonButton(geometry, { title: "Cope", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.rect, label: "Cope", disabled: true });

    const controls = args.tb.addGroup("Controls", { row });
    addRibbonButton(controls, { title: "Activate", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.pin, label: "Activate", onClick: () => args.setStatus("Furniture boundary: drawing is active.") });

    const modify = args.tb.addGroup("Modify", { row });
    addRibbonButton(modify, {
      title: "Move",
      iconSvg: args.icons.board,
      label: "Move",
      active: boundaryMoveActive,
      onClick: () => {
        boundaryMoveActive = !boundaryMoveActive;
        buildBoundaryTopbar();
        args.setStatus(
          boundaryMoveActive
            ? "Furniture boundary: Move ON - drag a selected line to move it with pinned connected endpoints."
            : "Furniture boundary: Move OFF - dragging whole lines is disabled; endpoints remain editable."
        );
      }
    });
    addRibbonButton(modify, { title: "Rotate", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.arc, label: "Rotate", disabled: true });
    addRibbonButton(modify, {
      title: "Align",
      iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.span,
      label: "Align",
      active: boundaryDrawTool === "align",
      onClick: () => setBoundaryDrawTool("align")
    });
    addRibbonButton(modify, {
      title: "Trim / Extend",
      iconSvg: args.icons.edge,
      label: "Trim",
      active: boundaryDrawTool === "trim",
      onClick: () => setBoundaryDrawTool("trim")
    });
    addRibbonButton(modify, {
      title: "Fillet",
      iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.arc,
      label: "Fillet",
      active: boundaryDrawTool === "fillet",
      onClick: () => setBoundaryDrawTool("fillet")
    });
    addRibbonButton(modify, {
      title: "Cut line",
      iconSvg: args.icons.cancel,
      label: "Cut",
      active: boundaryDrawTool === "cut",
      onClick: () => setBoundaryDrawTool("cut")
    });
    addRibbonButton(modify, { title: "Delete selected boundary line", iconSvg: args.icons.cancel, label: "Delete", onClick: () => deleteBoundarySelection() });

    const view = args.tb.addGroup("View", { row });
    addRibbonButton(view, { title: "View", iconSvg: args.icons.furniture, label: "View", onClick: () => args.ensureFloorplanViewerTab() });

    const measure = args.tb.addGroup("Measure", { row });
    addRibbonButton(measure, { title: "Measure", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.span, label: "Measure", disabled: true });

    const create = args.tb.addGroup("Create", { row });
    addRibbonButton(create, { title: "Create form", iconSvg: args.icons.horizontal, label: "Create", disabled: true });

    const mode = args.tb.addGroup("Mode", { row });
    addRibbonButton(mode, { title: "Finish Boundary", iconSvg: args.icons.done, label: "Finish", variant: "success", onClick: finishDraft });
    addRibbonButton(mode, { title: "Cancel Boundary", iconSvg: args.icons.cancel, label: "Cancel", variant: "danger", onClick: cancelTool });

    buildSharedDrawGroup(row, "boundary");
  }

  function buildCustomFurnitureTopbar() {
    args.tb.clear();
    if (boundaryEditActive) {
      buildBoundaryTopbar();
      return;
    }
    const row = args.tb.addRow({ title: "Custom furniture", className: "topbar-custom-furniture-ribbon" });
    const boundary = args.tb.addGroup("Boundary", { row });
    if (editorFurnitureId) {
      args.tb.toolButton(boundary, { title: "Edit furniture boundary", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.boundary, label: "Edit Boundary", onClick: editFurnitureBoundary });
    } else {
      args.tb.toolButton(boundary, { title: "Furniture Boundary", iconSvg: args.icons.furniture, label: "Boundary", onClick: enterNew });
    }
    const boards = args.tb.addGroup("Boards", { row });
    args.tb.toolButton(boards, { title: "Horizontal Board", iconSvg: args.icons.horizontal, label: "Horizontal", onClick: startHorizontalBoard });
    args.tb.toolButton(boards, { title: "Vertical Board", iconSvg: args.icons.vertical, label: "Vertical", onClick: startVerticalBoard });
    args.tb.toolButton(boards, { title: "Worktop", iconSvg: args.icons.horizontal, label: "Worktop", onClick: () => args.setStatus("Worktop: planned as polygon board kind=worktop.") });
    const production = args.tb.addGroup("Production", { row });
    args.tb.toolButton(production, { title: "Edge Banding", iconSvg: args.icons.edge, label: "Edges", onClick: startEdgeBanding });
    args.tb.toolButton(production, { title: "Joint", iconSvg: args.icons.board, label: "Joint", onClick: () => args.setStatus("Joint: planned for confirmat, dowels, domino, lamello and eccentric connectors.") });
    args.tb.toolButton(production, { title: "Edge Cut", iconSvg: args.icons.edge, label: "Edge Cut", onClick: () => args.setStatus("Edge Cut: planned for presets and custom cuts.") });
    args.tb.toolButton(production, { title: "Round Corner", iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.arc, label: "Round", onClick: () => args.setStatus("Corner Round: planned for board corner rounding.") });
    args.tb.addSpacer({ row });
    const assemblies = args.tb.addGroup("Assemblies", { row });
    args.tb.toolButton(assemblies, { title: "Drawer", iconSvg: args.icons.board, label: "Drawer", onClick: () => args.setStatus("Drawer: planned for drawer modules and fronts.") });
    args.tb.toolButton(assemblies, { title: "Components", iconSvg: args.icons.board, label: "Components", onClick: () => args.setStatus("Components: planned for legs, hinges, handles and runners.") });
    args.tb.toolButton(assemblies, { title: "Modify Cut", iconSvg: args.icons.cancel, label: "Cut", onClick: () => args.setStatus("Modify Cut: planned for movable linked cut lines.") });
    if (activeTool === "verticalBoard") buildSharedDrawGroup(row, "verticalBoard");
    if (activeTool === "horizontalBoard") buildSharedDrawGroup(row, "horizontalBoard");
    if (activeTool === "verticalBoard" && verticalBoardDrawMode === "line") {
      const modify = args.tb.addGroup("Modify", { row });
      addRibbonButton(modify, {
        title: "Select vertical board sketch lines",
        iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.boundary,
        label: "Select",
        active: boundaryDrawTool === "select",
        onClick: () => {
          boundaryDrawTool = "select";
          resetPlanLineEditRefs();
          renderBoundaryEdit();
          buildCustomFurnitureTopbar();
          args.setStatus("Vertical board sketch: select, drag rectangle, move endpoints, or delete lines before Accept.");
        }
      });
      addRibbonButton(modify, {
        title: "Move selected sketch line",
        iconSvg: args.icons.board,
        label: "Move",
        active: boundaryMoveActive,
        onClick: () => {
          boundaryDrawTool = "select";
          boundaryMoveActive = !boundaryMoveActive;
          renderBoundaryEdit();
          buildCustomFurnitureTopbar();
          args.setStatus(boundaryMoveActive ? "Vertical board sketch: Move ON." : "Vertical board sketch: Move OFF.");
        }
      });
      addRibbonButton(modify, {
        title: "Align sketch line",
        iconSvg: CUSTOM_FURNITURE_TOOLBAR_ICONS.span,
        label: "Align",
        active: boundaryDrawTool === "align",
        onClick: () => {
          boundaryDrawTool = "align";
          boundaryAlignReferenceSegmentIndex = null;
          renderBoundaryEdit();
          buildCustomFurnitureTopbar();
          args.setStatus("Vertical board sketch Align: click reference line, then line to move.");
        }
      });
      addRibbonButton(modify, {
        title: "Trim / Extend sketch lines",
        iconSvg: args.icons.edge,
        label: "Trim",
        active: boundaryDrawTool === "trim",
        onClick: () => {
          boundaryDrawTool = "trim";
          boundaryTrimFirstSegmentIndex = null;
          renderBoundaryEdit();
          buildCustomFurnitureTopbar();
          args.setStatus("Vertical board sketch Trim: click first line, then second line.");
        }
      });
      addRibbonButton(modify, { title: "Delete selected sketch lines", iconSvg: args.icons.cancel, label: "Delete", onClick: () => deleteBoundarySelection() });
    }
    const finish = args.tb.addGroup("Action", { row });
    if (activeTool) args.tb.toolButton(finish, { title: "Accept current tool", iconSvg: args.icons.done, label: "Accept", variant: "success", onClick: finishDraft });
    args.tb.toolButton(finish, { title: "Close Custom Furniture Editor", iconSvg: args.icons.done, label: "Close", variant: "success", onClick: exitFurnitureEditor });
    args.tb.toolButton(finish, { title: "Cancel current tool", iconSvg: args.icons.cancel, label: "Cancel", variant: "danger", onClick: cancelTool });
  }

  const tryMountActiveCustomFurnitureProps = () => {
    const furniture = findFurniture();
    if (activeTool || boundaryEditActive) {
      return mountCustomFurnitureActiveToolProps({
        props: args.props,
        catalog: args.catalog,
        activeTool,
        boundaryEditActive,
        boundarySegmentsCount: boundarySegments.length,
        boundaryHasFirstPoint: !!boundaryFirst,
        draftPointsCount: draftPoints.length,
        constraintOptions,
        verticalBoardDraft: {
          materialId: draftBoardMaterialId,
          thicknessMm: draftBoardThicknessMm,
          justification: draftBoardJustification,
          baseConstraint: draftBoardBaseConstraint,
          baseOffsetMm: draftBoardBaseOffsetMm,
          topConstraint: draftBoardTopConstraint,
          topOffsetMm: draftBoardTopOffsetMm
        },
        onVerticalBoardDraftChange: (next) => {
          if (next.materialId !== undefined) draftBoardMaterialId = next.materialId;
          if (next.thicknessMm !== undefined) draftBoardThicknessMm = next.thicknessMm;
          if (next.justification !== undefined) draftBoardJustification = next.justification;
          if (next.baseConstraint !== undefined) draftBoardBaseConstraint = next.baseConstraint;
          if (next.baseOffsetMm !== undefined) draftBoardBaseOffsetMm = next.baseOffsetMm;
          if (next.topConstraint !== undefined) draftBoardTopConstraint = next.topConstraint;
          if (next.topOffsetMm !== undefined) draftBoardTopOffsetMm = next.topOffsetMm;
          buildDraftLine();
        }
      });
    }
    if (!furniture) return false;
    const board = findSelectedBoard();
    if (board) {
      mountCustomFurnitureBoardProps({
        props: args.props,
        catalog: args.catalog,
        furniture,
        board,
        constraintOptions,
        syncVerticalBoardProfileToConstraints,
        rebuildFurniture,
        commitHistory: args.commitHistory,
        refreshProps: args.refreshProps
      });
    } else {
      mountCustomFurnitureProps({
        props: args.props,
        furniture,
        constraintOptions,
        rebuildFurniture,
        commitHistory: args.commitHistory,
        refreshProps: args.refreshProps
      });
    }
    return true;
  };

  const selectFurniture = (furnitureId: string | null, boardId: string | null = null) => {
    selectedFurnitureId = furnitureId;
    selectedBoardId = boardId;
    args.clearAppSelection();
    for (const furniture of args.customFurniture) rebuildFurniture(furniture);
    args.refreshProps();
  };

  const pickCustomFurniturePlanLine = (clientX: number, clientY: number) => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    const mouse = { x: clientX - rect.left, y: clientY - rect.top };
    let best: { furniture: CustomFurnitureInstance; px: number } | null = null;
    for (const furniture of args.customFurniture) {
      for (const segment of getCustomFurniturePlanSegmentsForParams(furniture.params)) {
        const a = worldToScreen(pointToWorld(segment.a), args.getCamera(), rect);
        const b = worldToScreen(pointToWorld(segment.b), args.getCamera(), rect);
        const px = distPxPointToSeg(mouse.x, mouse.y, a.x, a.y, b.x, b.y);
        if (px <= 12 && (!best || px < best.px)) best = { furniture, px };
      }
    }
    return best?.furniture ?? null;
  };

  const getBoardMeshes = () => args.customFurniture.flatMap((furniture) => furniture.boardObjects.map((boardObject) => boardObject.mesh));

  const pickBoard = (clientX: number, clientY: number) => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, args.getCamera());
    const hit = raycaster.intersectObjects(getBoardMeshes(), false)[0] ?? null;
    if (!hit) return null;
    const furnitureId = typeof hit.object.userData.customFurnitureId === "string" ? hit.object.userData.customFurnitureId : null;
    const boardId = typeof hit.object.userData.customFurnitureBoardId === "string" ? hit.object.userData.customFurnitureBoardId : null;
    const furniture = furnitureId ? findFurniture(furnitureId) : null;
    const board = furniture && boardId ? furniture.params.boards.find((item) => item.id === boardId) ?? null : null;
    return furniture && board ? { furniture, board, point: hit.point } : null;
  };

  const groundHit = (clientX: number, clientY: number) => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, args.getCamera());
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, point)) return null;
    return { point, rect };
  };

  const resolveBoundaryPoint = (clientX: number, clientY: number, opts?: { base?: CustomFurniturePlanPoint | null; allowAxis?: boolean }) => {
    const hit = groundHit(clientX, clientY);
    if (!hit) return null;
    const snapped = args.snapPoint2D(hit.point, hit.rect, args.getCamera(), 24, {
      kindPriority: ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"],
      sticky: boundarySnap,
      preferNearest: true
    });
    const externalSnap =
      snapped.kind !== "none" ? snapped : args.keepStickyPlanSnap(hit.point, boundarySnap, args.getCamera(), hit.rect, 28);
    const localSnap = resolveBoundarySegmentSnap(hit.point, hit.rect, opts?.base ?? null);
    const snapDistance = (snap: PlanSnapResult | null) => {
      if (!snap || snap.kind === "none") return Number.POSITIVE_INFINITY;
      const rawScreen = worldToScreen(hit.point, args.getCamera(), hit.rect);
      const snapScreen = worldToScreen(snap.point, args.getCamera(), hit.rect);
      return Math.hypot(rawScreen.x - snapScreen.x, rawScreen.y - snapScreen.y);
    };
    const activeSnap = snapDistance(localSnap) <= snapDistance(externalSnap) ? localSnap : externalSnap;
    const snappedToExistingBoundary = snapDistance(localSnap) <= snapDistance(externalSnap) && !!localSnap && localSnap.kind !== "none";
    boundarySnap = activeSnap;
    const trackingUpdated = updateBoundaryTrackingFromSnap(activeSnap, opts?.base ?? null);
    if (!trackingUpdated && boundaryTrackingTimer) {
      clearTimeout(boundaryTrackingTimer);
      boundaryTrackingTimer = null;
      boundaryTrackingCandidate = null;
    }
    const source = activeSnap ? activeSnap.point : hit.point;
    let point = { x: Math.round(source.x * 1000), z: Math.round(source.z * 1000) };
    let kind = activeSnap?.kind ?? "none";
    boundaryTrackedAlignedPoint = null;
    if (opts?.base && opts.allowAxis !== false && !activeSnap) {
      const combinedAxisPoint = resolveCustomFurnitureCombinedAxisSnap(point, boundaryTrackedPoint, opts.base, 60);
      if (combinedAxisPoint) {
        point = combinedAxisPoint.point;
        if (combinedAxisPoint.trackedAxis) boundaryTrackedAlignedPoint = { ...combinedAxisPoint.point };
        kind = "axis";
      }
    }
    const world = pointToWorld(point, 0.07);
    if (kind !== "none") {
      args.updateHoverCursor(worldToScreen(world, args.getCamera(), hit.rect), kind);
      args.drawSnapOverlay.showWorld(world, args.getCamera(), hit.rect, kind);
    } else {
      args.hideHoverCursor();
      args.drawSnapOverlay.hide();
    }
    return {
      point,
      rect: hit.rect,
      raw: hit.point,
      kind,
      stopLineChain: shouldStopCustomFurnitureLineChainOnSnap(!!opts?.base, snappedToExistingBoundary, activeSnap?.kind ?? "none")
    };
  };

  const pickBoundaryEditElement = (clientX: number, clientY: number) => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    const mouse = { x: clientX - rect.left, y: clientY - rect.top };
    const editableSegments = getEditablePlanLineSegments();
    let bestVertex: { ref: CustomFurnitureBoundaryVertexRef; px: number } | null = null;
    for (let index = 0; index < editableSegments.length; index += 1) {
      for (const endpoint of ["a", "b"] as const) {
        const screen = worldToScreen(pointToWorld(editableSegments[index]![endpoint]), args.getCamera(), rect);
        const px = Math.hypot(mouse.x - screen.x, mouse.y - screen.y);
        if (px <= 12 && (!bestVertex || px < bestVertex.px)) bestVertex = { ref: { segmentIndex: index, endpoint }, px };
      }
    }
    if (bestVertex) return { kind: "vertex" as const, ref: bestVertex.ref };

    let bestSegment: { segmentIndex: number; px: number } | null = null;
    for (let index = 0; index < editableSegments.length; index += 1) {
      const segment = editableSegments[index]!;
      const points = segment.arcPoints && segment.arcPoints.length >= 2 ? segment.arcPoints : [segment.a, segment.b];
      for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
        const a = worldToScreen(pointToWorld(points[pointIndex]!), args.getCamera(), rect);
        const b = worldToScreen(pointToWorld(points[pointIndex + 1]!), args.getCamera(), rect);
        const px = distPxPointToSeg(mouse.x, mouse.y, a.x, a.y, b.x, b.y);
        if (px <= 10 && (!bestSegment || px < bestSegment.px)) bestSegment = { segmentIndex: index, px };
      }
    }
    return bestSegment ? { kind: "segment" as const, segmentIndex: bestSegment.segmentIndex } : null;
  };

  const pickBoundarySegmentOnly = (clientX: number, clientY: number) => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    const mouse = { x: clientX - rect.left, y: clientY - rect.top };
    const editableSegments = getEditablePlanLineSegments();
    let bestSegment: { segmentIndex: number; px: number } | null = null;
    for (let index = 0; index < editableSegments.length; index += 1) {
      const segment = editableSegments[index]!;
      const points = segment.arcPoints && segment.arcPoints.length >= 2 ? segment.arcPoints : [segment.a, segment.b];
      for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
        const a = worldToScreen(pointToWorld(points[pointIndex]!), args.getCamera(), rect);
        const b = worldToScreen(pointToWorld(points[pointIndex + 1]!), args.getCamera(), rect);
        const px = distPxPointToSeg(mouse.x, mouse.y, a.x, a.y, b.x, b.y);
        if (px <= 12 && (!bestSegment || px < bestSegment.px)) bestSegment = { segmentIndex: index, px };
      }
    }
    return bestSegment;
  };

  const pickVerticalBoardSourceLine = (clientX: number, clientY: number): CustomFurnitureBoundarySegment | null => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    const mouse = { x: clientX - rect.left, y: clientY - rect.top };
    let best: { segment: CustomFurnitureBoundarySegment; px: number } | null = null;
    for (const segment of getActivePlanSegments()) {
      for (const piece of getCustomFurnitureBoundarySegmentPieces(segment)) {
        const a = worldToScreen(pointToWorld(piece.a), args.getCamera(), rect);
        const b = worldToScreen(pointToWorld(piece.b), args.getCamera(), rect);
        const px = distPxPointToSeg(mouse.x, mouse.y, a.x, a.y, b.x, b.y);
        if (px <= 12 && (!best || px < best.px)) best = { segment: cloneCustomFurnitureBoundarySegments([segment])[0]!, px };
      }
    }
    const hit = groundHit(clientX, clientY);
    if (hit) {
      const snap = args.snapPoint2D(hit.point, hit.rect, args.getCamera(), 18, {
        kindPriority: ["edge", "midpoint", "perpendicular", "endpoint", "corner"],
        preferNearest: true
      });
      if (snap.kind !== "none" && snap.a && snap.b) {
        const a = worldToScreen(snap.a, args.getCamera(), hit.rect);
        const b = worldToScreen(snap.b, args.getCamera(), hit.rect);
        const px = distPxPointToSeg(mouse.x, mouse.y, a.x, a.y, b.x, b.y);
        if (px <= 18 && (!best || px < best.px)) {
          best = {
            segment: {
              a: { x: Math.round(snap.a.x * 1000), z: Math.round(snap.a.z * 1000) },
              b: { x: Math.round(snap.b.x * 1000), z: Math.round(snap.b.z * 1000) }
            },
            px
          };
        }
      }
    }
    return best?.segment ?? null;
  };

  const pickBoundaryDimensionEdit = (clientX: number, clientY: number) => {
    const root = ensureBoundaryEditRoot();
    const rect = args.renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, args.getCamera());
    const hit = raycaster
      .intersectObjects(root.children, true)
      .find((item) => parseBoundaryDimensionEdit(item.object.userData.customFurnitureBoundaryDimensionEdit));
    return parseBoundaryDimensionEdit(hit?.object.userData.customFurnitureBoundaryDimensionEdit);
  };

  const moveBoundaryVertex = (startSegments: CustomFurnitureBoundarySegment[], startPoint: CustomFurniturePlanPoint, nextPoint: CustomFurniturePlanPoint) => {
    setEditablePlanLineSegments(cloneCustomFurnitureBoundarySegments(startSegments).map((segment) => ({
      a: floorPointDistMm(segment.a, startPoint) <= 3 ? { ...nextPoint } : { ...segment.a },
      b: floorPointDistMm(segment.b, startPoint) <= 3 ? { ...nextPoint } : { ...segment.b }
    })));
  };

  const moveBoundarySegment = (
    startSegments: CustomFurnitureBoundarySegment[],
    segmentIndex: number,
    startWorld: CustomFurniturePlanPoint,
    nextWorld: CustomFurniturePlanPoint
  ) => {
    const segment = startSegments[segmentIndex];
    if (!segment) return;
    const dx = nextWorld.x - startWorld.x;
    const dz = nextWorld.z - startWorld.z;
    const nextA = { x: segment.a.x + dx, z: segment.a.z + dz };
    const nextB = { x: segment.b.x + dx, z: segment.b.z + dz };
    setEditablePlanLineSegments(cloneCustomFurnitureBoundarySegments(startSegments).map((item, index) =>
      index === segmentIndex
        ? {
            a: { ...nextA },
            b: { ...nextB }
          }
        : {
            a: floorPointDistMm(item.a, segment.a) <= 3 ? { ...nextA } : floorPointDistMm(item.a, segment.b) <= 3 ? { ...nextB } : { ...item.a },
            b: floorPointDistMm(item.b, segment.a) <= 3 ? { ...nextA } : floorPointDistMm(item.b, segment.b) <= 3 ? { ...nextB } : { ...item.b }
      }
    ));
  };

  const getBoundaryDimensionValue = (edit: CustomFurnitureBoundaryDimensionEdit) => {
    const editableSegments = getEditablePlanLineSegments();
    if (edit.kind === "filletRadius") {
      return editableSegments.find((segment) => segment.fillet?.id === edit.filletId)?.fillet?.radiusMm ?? null;
    }
    if (edit.kind === "cutPosition") {
      return editableSegments.find((segment) => segment.cut?.id === edit.cutId)?.cut?.centerDistanceMm ?? null;
    }
    const dimension = resolveCustomFurnitureParallelBoundaryDimension(editableSegments, edit.segmentIndex);
    return dimension && dimension.referenceSegmentIndex === edit.referenceSegmentIndex ? Math.round(dimension.distanceMm) : null;
  };

  const applyBoundaryDimensionValue = (edit: CustomFurnitureBoundaryDimensionEdit, next: number) => {
    const current = getBoundaryDimensionValue(edit);
    if (current === null || !Number.isFinite(next)) return;
    if (boundaryEditActive) pushBoundaryUndoState();
    const editableSegments = getEditablePlanLineSegments();
      if (edit.kind === "filletRadius") {
      const fillet = editableSegments.find((segment) => segment.fillet?.id === edit.filletId)?.fillet;
      if (!fillet) return;
      const withoutFillet = editableSegments.filter((segment) => segment.fillet?.id !== edit.filletId);
      const recreated = createCustomFurnitureBoundaryFilletSegments(
        { a: fillet.corner, b: fillet.otherA },
        { a: fillet.corner, b: fillet.otherB },
        next,
        fillet.id
      );
      if (!recreated) return;
      setEditablePlanLineSegments([...cloneCustomFurnitureBoundarySegments(withoutFillet), ...recreated]);
      selectedBoundarySegmentIndex = getEditablePlanLineSegments().findIndex((segment) => segment.fillet?.id === edit.filletId);
    } else if (edit.kind === "cutPosition") {
      setEditablePlanLineSegments(moveCustomFurnitureBoundaryCut(editableSegments, edit.cutId, next));
      selectedBoundarySegmentIndex = getEditablePlanLineSegments().findIndex((segment) => segment.cut?.id === edit.cutId);
    } else {
      setEditablePlanLineSegments(moveCustomFurnitureBoundarySegmentToParallelDistance(
        editableSegments,
        edit.segmentIndex,
        edit.referenceSegmentIndex,
        next
      ));
      selectedBoundarySegmentIndex = edit.segmentIndex;
    }
    selectedBoundarySegmentIndexes.clear();
    if (selectedBoundarySegmentIndex != null && selectedBoundarySegmentIndex >= 0) selectedBoundarySegmentIndexes.add(selectedBoundarySegmentIndex);
    selectedBoundaryVertex = null;
    boundaryFirst = null;
    boundaryHover = null;
    draftPoints = [];
    if (boundaryEditActive) boundaryRedoStack.splice(0, boundaryRedoStack.length);
    renderBoundaryEdit();
    buildDraftLine();
    args.refreshProps();
    args.setStatus(`${isVerticalBoardSketchEditMode() ? "Vertical board sketch" : "Furniture boundary"}: dimension set to ${Math.round(next)} mm.`);
  };

  const openBoundaryDimensionInput = (edit: CustomFurnitureBoundaryDimensionEdit, clientX: number, clientY: number) => {
    const current = getBoundaryDimensionValue(edit);
    if (current === null) return;
    const host = args.renderer.domElement.parentElement ?? document.body;
    host.querySelector(".custom-furniture-dimension-edit")?.remove();
    const rect = host.getBoundingClientRect();
    const input = document.createElement("input");
    input.className = "custom-furniture-dimension-edit";
    input.type = "number";
    input.step = "1";
    input.value = String(current);
    input.style.position = "absolute";
    input.style.left = `${clientX - rect.left - 42}px`;
    input.style.top = `${clientY - rect.top - 16}px`;
    input.style.width = "84px";
    input.style.height = "28px";
    input.style.zIndex = "50";
    input.style.padding = "2px 6px";
    input.style.border = "2px solid #c98d00";
    input.style.background = "#fff8d7";
    input.style.color = "#2c2100";
    input.style.font = "600 13px Arial";
    input.style.textAlign = "center";
    input.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const next = Math.max(1, Math.round(Number(input.value.trim().replace(",", "."))));
      input.remove();
      if (Number.isFinite(next)) applyBoundaryDimensionValue(edit, next);
    };
    const cancel = () => {
      committed = true;
      input.remove();
    };
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
      if (event.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
    host.appendChild(input);
    input.focus();
    input.select();
  };

  const deleteBoundarySelection = () => {
    const selectedIndexes = new Set(selectedBoundarySegmentIndexes);
    if (selectedBoundarySegmentIndex != null) selectedIndexes.add(selectedBoundarySegmentIndex);
    if (selectedIndexes.size === 0) return false;
    if (boundaryEditActive) pushBoundaryUndoState();
    setEditablePlanLineSegments(getEditablePlanLineSegments().filter((_, index) => !selectedIndexes.has(index)));
    selectedBoundarySegmentIndex = null;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundaryVertex = null;
    if (boundaryEditActive) resetBoundaryInProgress();
    else {
      boundaryTrimFirstSegmentIndex = null;
      boundaryAlignReferenceSegmentIndex = null;
      hoverBoundarySegmentIndex = null;
      renderBoundaryEdit();
      buildDraftLine();
    }
    args.refreshProps();
    return true;
  };

  const handleBoundaryTrimPick = (segmentIndex: number) => {
    selectedBoundaryVertex = null;
    selectedBoundarySegmentIndex = segmentIndex;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(segmentIndex);
    if (boundaryTrimFirstSegmentIndex === null || boundaryTrimFirstSegmentIndex === segmentIndex) {
      boundaryTrimFirstSegmentIndex = segmentIndex;
      renderBoundaryEdit();
      args.refreshProps();
      args.setStatus("Furniture boundary Trim: first line selected. Click the second line to create the corner.");
      return;
    }
    const editableSegments = getEditablePlanLineSegments();
    const before = JSON.stringify(cloneCustomFurnitureBoundarySegments(editableSegments));
    if (boundaryEditActive) pushBoundaryUndoState();
    setEditablePlanLineSegments(trimExtendCustomFurnitureBoundarySegmentsToCorner(editableSegments, boundaryTrimFirstSegmentIndex, segmentIndex));
    if (boundaryEditActive && JSON.stringify(cloneCustomFurnitureBoundarySegments(getEditablePlanLineSegments())) === before) boundaryUndoStack.pop();
    boundaryTrimFirstSegmentIndex = null;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(segmentIndex);
    renderBoundaryEdit();
    buildDraftLine();
    args.refreshProps();
    args.setStatus(`${isVerticalBoardSketchEditMode() ? "Vertical board sketch" : "Furniture boundary"} Trim: lines were trimmed/extended to a shared corner.`);
  };

  const handleBoundaryAlignPick = (segmentIndex: number) => {
    selectedBoundaryVertex = null;
    selectedBoundarySegmentIndex = segmentIndex;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(segmentIndex);
    if (boundaryAlignReferenceSegmentIndex === null || boundaryAlignReferenceSegmentIndex === segmentIndex) {
      boundaryAlignReferenceSegmentIndex = segmentIndex;
      renderBoundaryEdit();
      args.refreshProps();
      args.setStatus("Furniture boundary Align: reference line selected. Click the line that should move.");
      return;
    }
    const editableSegments = getEditablePlanLineSegments();
    const before = JSON.stringify(cloneCustomFurnitureBoundarySegments(editableSegments));
    if (boundaryEditActive) pushBoundaryUndoState();
    setEditablePlanLineSegments(alignCustomFurnitureBoundarySegmentToReference(editableSegments, boundaryAlignReferenceSegmentIndex, segmentIndex));
    if (boundaryEditActive && JSON.stringify(cloneCustomFurnitureBoundarySegments(getEditablePlanLineSegments())) === before) boundaryUndoStack.pop();
    boundaryAlignReferenceSegmentIndex = null;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(segmentIndex);
    renderBoundaryEdit();
    buildDraftLine();
    args.refreshProps();
    args.setStatus(`${isVerticalBoardSketchEditMode() ? "Vertical board sketch" : "Furniture boundary"} Align: selected line moved to the reference line.`);
  };

  const handleBoundaryFilletPick = (segmentIndex: number) => {
    selectedBoundaryVertex = null;
    selectedBoundarySegmentIndex = segmentIndex;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(segmentIndex);
    if (boundaryFilletFirstSegmentIndex === null || boundaryFilletFirstSegmentIndex === segmentIndex) {
      boundaryFilletFirstSegmentIndex = segmentIndex;
      renderBoundaryEdit();
      args.refreshProps();
      args.setStatus("Furniture boundary Fillet: first line selected. Click the second line sharing the same corner.");
      return;
    }
    const radiusValue = window.prompt("Fillet radius mm", "100");
    const radius = Math.round(Number(radiusValue?.replace(",", ".")));
    if (!Number.isFinite(radius) || radius <= 0) return;
    const before = JSON.stringify(cloneCustomFurnitureBoundarySegments(boundarySegments));
    pushBoundaryUndoState();
    boundarySegments = applyCustomFurnitureBoundaryFillet(
      boundarySegments,
      boundaryFilletFirstSegmentIndex,
      segmentIndex,
      radius,
      `fillet_${Date.now()}`
    );
    if (JSON.stringify(cloneCustomFurnitureBoundarySegments(boundarySegments)) === before) boundaryUndoStack.pop();
    boundaryFilletFirstSegmentIndex = null;
    selectedBoundarySegmentIndex = boundarySegments.findIndex((segment) => segment.fillet?.radiusMm === radius && segment.filletRole === "arc");
    selectedBoundarySegmentIndexes.clear();
    if (selectedBoundarySegmentIndex >= 0) selectedBoundarySegmentIndexes.add(selectedBoundarySegmentIndex);
    renderBoundaryEdit();
    args.refreshProps();
    args.setStatus("Furniture boundary Fillet: radius inserted.");
  };

  const handleBoundaryCutPick = (segmentIndex: number, point: CustomFurniturePlanPoint) => {
    if (boundaryCutSegmentIndex === null || boundaryCutSegmentIndex !== segmentIndex) {
      boundaryCutSegmentIndex = segmentIndex;
      selectedBoundarySegmentIndex = segmentIndex;
      selectedBoundarySegmentIndexes.clear();
      selectedBoundarySegmentIndexes.add(segmentIndex);
      renderBoundaryEdit();
      args.refreshProps();
      args.setStatus("Furniture boundary Cut: line selected. Click the exact cut position on that line.");
      return;
    }
    pushBoundaryUndoState();
    boundarySegments = applyCustomFurnitureBoundaryCut(boundarySegments, segmentIndex, point, 20, `cut_${Date.now()}`);
    boundaryCutSegmentIndex = null;
    selectedBoundarySegmentIndex = segmentIndex;
    selectedBoundarySegmentIndexes.clear();
    selectedBoundarySegmentIndexes.add(segmentIndex);
    renderBoundaryEdit();
    args.refreshProps();
    args.setStatus("Furniture boundary Cut: gap inserted and dimension is editable.");
  };

  const handlePointerDown = (ev: PointerEvent) => {
    if (args.S.mode !== "layout" || ev.button !== 0) return;
    releaseCustomFurnitureButtonMagnetCapture(document);
    if (args.getViewerToolMode?.() === "pan") return;
    if (boundaryEditActive) {
      const dimensionEdit = pickBoundaryDimensionEdit(ev.clientX, ev.clientY);
      if (dimensionEdit) {
        openBoundaryDimensionInput(dimensionEdit, ev.clientX, ev.clientY);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (boundaryDrawTool === "trim" || boundaryDrawTool === "align" || boundaryDrawTool === "fillet") {
        const picked = pickBoundarySegmentOnly(ev.clientX, ev.clientY);
        if (picked) {
          if (boundaryDrawTool === "trim") handleBoundaryTrimPick(picked.segmentIndex);
          else if (boundaryDrawTool === "align") handleBoundaryAlignPick(picked.segmentIndex);
          else handleBoundaryFilletPick(picked.segmentIndex);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        args.setStatus(
          boundaryDrawTool === "trim"
            ? "Furniture boundary Trim: click a boundary line."
            : boundaryDrawTool === "align"
              ? "Furniture boundary Align: click a boundary line."
              : "Furniture boundary Fillet: click a boundary line."
        );
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const resolved = resolveBoundaryPoint(ev.clientX, ev.clientY, { base: boundaryFirst, allowAxis: !ev.shiftKey });
      if (!resolved) return;
      if (boundaryDrawTool === "cut") {
        const picked = pickBoundaryEditElement(ev.clientX, ev.clientY);
        const segmentIndex = boundaryCutSegmentIndex ?? (picked?.kind === "segment" ? picked.segmentIndex : null);
        if (segmentIndex != null) handleBoundaryCutPick(segmentIndex, resolved.point);
        else args.setStatus("Furniture boundary Cut: click a boundary line first.");
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (boundaryDrawTool === "select") {
        const picked = pickBoundaryEditElement(ev.clientX, ev.clientY);
        if (shouldCustomFurnitureSelectToolPassThroughEmptyPointer(boundaryDrawTool, !!picked, !!boundaryDrag)) {
          const rect = args.renderer.domElement.getBoundingClientRect();
          boundarySelectRect = {
            active: false,
            pointerId: ev.pointerId,
            startX: ev.clientX - rect.left,
            startY: ev.clientY - rect.top,
            currentX: ev.clientX - rect.left,
            currentY: ev.clientY - rect.top,
            mode: "contain"
          };
          hideBoundarySelectRect();
          try {
            args.renderer.domElement.setPointerCapture(ev.pointerId);
          } catch {
            // ignore
          }
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (picked?.kind === "vertex") {
          const editableSegments = getEditablePlanLineSegments();
          selectedBoundarySegmentIndex = picked.ref.segmentIndex;
          selectedBoundarySegmentIndexes.clear();
          selectedBoundarySegmentIndexes.add(picked.ref.segmentIndex);
          selectedBoundaryVertex = picked.ref;
          boundaryDrag = {
            kind: "vertex",
            pointerId: ev.pointerId,
            ref: picked.ref,
            startPoint: { ...editableSegments[picked.ref.segmentIndex]![picked.ref.endpoint] },
            startSegments: cloneJson(editableSegments)
          };
          args.renderer.domElement.setPointerCapture(ev.pointerId);
          renderBoundaryEdit();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (picked?.kind === "segment") {
          if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
            if (selectedBoundarySegmentIndexes.has(picked.segmentIndex)) selectedBoundarySegmentIndexes.delete(picked.segmentIndex);
            else selectedBoundarySegmentIndexes.add(picked.segmentIndex);
            selectedBoundarySegmentIndex = picked.segmentIndex;
          } else {
            selectedBoundarySegmentIndexes.clear();
            selectedBoundarySegmentIndexes.add(picked.segmentIndex);
            selectedBoundarySegmentIndex = picked.segmentIndex;
          }
          selectedBoundaryVertex = null;
          if (boundaryMoveActive) {
            boundaryDrag = {
              kind: "segment",
              pointerId: ev.pointerId,
              segmentIndex: picked.segmentIndex,
              startWorld: { ...resolved.point },
              startSegments: cloneJson(getEditablePlanLineSegments())
            };
            args.renderer.domElement.setPointerCapture(ev.pointerId);
          }
          renderBoundaryEdit();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      }
      appendBoundaryPoint(resolved.point, resolved.stopLineChain);
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (activeTool === "horizontalBoard" || activeTool === "verticalBoard") {
      if (activeTool === "verticalBoard" && verticalBoardDrawMode === "pickLine") {
        const picked = pickVerticalBoardSourceLine(ev.clientX, ev.clientY);
        if (!picked) {
          args.setStatus("Vertical board Pick Line: no line found under cursor.");
          return;
        }
        draftPickedVerticalBoardSegments.push(offsetBoundarySegments(cloneCustomFurnitureBoundarySegments([picked]))[0]!);
        draftPoints = [];
        draftHoverPoint = null;
        draftHoverSegment = null;
        buildDraftLine();
        renderBoundaryEdit();
        args.setStatus(`Vertical board line copied (${draftPickedVerticalBoardSegments.length}). Pick another line or click Accept.`);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const resolved = resolveBoundaryPoint(ev.clientX, ev.clientY, {
        base: activeTool === "verticalBoard" ? draftPoints[0] ?? null : draftPoints.at(-1) ?? null,
        allowAxis: true
      });
      if (!resolved) return;
      appendBoardDrawPoint(resolved.point, resolved.stopLineChain);
      args.setStatus(
        activeTool === "verticalBoard"
          ? draftPickedVerticalBoardSegments.length > 0
            ? "Vertical board sketch updated. Draw another line, edit it, or click Accept."
            : "Vertical board: click the next point."
          : "Horizontal board sketch updated. Continue drawing or click Accept."
      );
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (activeTool === "edgeBand") {
      const hit = pickBoard(ev.clientX, ev.clientY);
      if (!hit) return;
      const edgeIndex = nearestBoardProfileEdge(hit.board, hit.point);
      if (edgeIndex == null) return;
      const existingIndex = hit.board.edgeBanding.findIndex((edge) => edge.edgeIndex === edgeIndex);
      if (existingIndex >= 0) hit.board.edgeBanding.splice(existingIndex, 1);
      else hit.board.edgeBanding.push({ edgeIndex, materialId: firstMaterial(args.catalog, "edge") });
      selectedFurnitureId = hit.furniture.id;
      selectedBoardId = hit.board.id;
      rebuildFurniture(hit.furniture);
      args.commitHistory();
      args.refreshProps();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const hit = pickBoard(ev.clientX, ev.clientY);
    if (!hit) return;
    selectFurniture(hit.furniture.id, hit.board.id);
  };

  const handleDoubleClick = (ev: MouseEvent) => {
    const hit = pickBoard(ev.clientX, ev.clientY);
    if (hit) {
      enterFurnitureEditor(hit.furniture.id, hit.board.id);
      args.setStatus("Custom furniture editor opened. Custom board selected.");
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const furniture = pickCustomFurniturePlanLine(ev.clientX, ev.clientY);
    if (!furniture) return;
    enterFurnitureEditor(furniture.id);
    args.setStatus("Custom furniture editor opened.");
    ev.preventDefault();
    ev.stopPropagation();
  };

  const handlePointerMove = (ev: PointerEvent) => {
    if (args.S.mode !== "layout") return;
    releaseCustomFurnitureButtonMagnetCapture(document);
    if (args.getViewerToolMode?.() === "pan" || (ev.buttons & 4) === 4) return;
    if (!boundaryEditActive && !isVerticalBoardSketchEditMode() && (activeTool === "verticalBoard" || activeTool === "horizontalBoard")) {
      if (activeTool === "verticalBoard" && verticalBoardDrawMode === "pickLine") {
        const picked = pickVerticalBoardSourceLine(ev.clientX, ev.clientY);
        draftHoverSegment = picked;
        if (picked) {
          const rect = args.renderer.domElement.getBoundingClientRect();
          const mid = pointToWorld({ x: (picked.a.x + picked.b.x) / 2, z: (picked.a.z + picked.b.z) / 2 }, 0.07);
          args.updateHoverCursor(worldToScreen(mid, args.getCamera(), rect), "edge");
        } else {
          args.hideHoverCursor();
        }
        buildDraftLine();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const resolved = resolveBoundaryPoint(ev.clientX, ev.clientY, {
        base: activeTool === "verticalBoard" ? draftPoints[0] ?? null : draftPoints.at(-1) ?? null,
        allowAxis: true
      });
      if (!resolved) return;
      draftHoverPoint = resolved.point;
      draftHoverSegment = null;
      if (draftPoints.length > 0) buildDraftLine();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (!boundaryEditActive && !isVerticalBoardSketchEditMode()) return;
    if (boundarySelectRect && boundarySelectRect.pointerId === ev.pointerId) {
      const rect = args.renderer.domElement.getBoundingClientRect();
      boundarySelectRect.currentX = ev.clientX - rect.left;
      boundarySelectRect.currentY = ev.clientY - rect.top;
      const dx = boundarySelectRect.currentX - boundarySelectRect.startX;
      const dy = boundarySelectRect.currentY - boundarySelectRect.startY;
      if (!boundarySelectRect.active && (Math.abs(dx) >= 6 || Math.abs(dy) >= 6)) {
        boundarySelectRect.active = true;
        const el = ensureBoundarySelectRectEl();
        el.style.border = "1px solid rgba(92, 140, 255, 0.95)";
        el.style.background = "rgba(92, 140, 255, 0.10)";
        el.style.left = `${boundarySelectRect.startX}px`;
        el.style.top = `${boundarySelectRect.startY}px`;
        el.style.width = "0px";
        el.style.height = "0px";
        el.style.display = "block";
      }
      if (boundarySelectRect.active) updateBoundarySelectRectEl();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if ((boundaryDrawTool === "align" || boundaryDrawTool === "trim" || boundaryDrawTool === "fillet" || (boundaryDrawTool === "cut" && boundaryCutSegmentIndex === null)) && !boundaryDrag) {
      const picked = pickBoundarySegmentOnly(ev.clientX, ev.clientY);
      hoverBoundarySegmentIndex = picked?.segmentIndex ?? null;
      if (picked) {
        const rect = args.renderer.domElement.getBoundingClientRect();
        const segment = getEditablePlanLineSegments()[picked.segmentIndex]!;
        const mid = pointToWorld({ x: (segment.a.x + segment.b.x) / 2, z: (segment.a.z + segment.b.z) / 2 }, 0.07);
        args.updateHoverCursor(worldToScreen(mid, args.getCamera(), rect), "edge");
      } else {
        args.hideHoverCursor();
      }
      renderBoundaryEdit();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (boundaryDrawTool === "select" && !boundaryDrag) return;
    const dragBase =
      boundaryDrag?.kind === "vertex"
        ? boundaryDrag.startPoint
        : boundaryDrag?.kind === "segment"
          ? boundaryDrag.startWorld
          : boundaryFirst;
    const resolved = resolveBoundaryPoint(ev.clientX, ev.clientY, { base: dragBase, allowAxis: !ev.shiftKey });
    if (!resolved) return;

    if (boundaryDrag && boundaryDrag.pointerId === ev.pointerId) {
      if (boundaryDrag.kind === "vertex") {
        moveBoundaryVertex(boundaryDrag.startSegments, boundaryDrag.startPoint, resolved.point);
      } else {
        moveBoundarySegment(boundaryDrag.startSegments, boundaryDrag.segmentIndex, boundaryDrag.startWorld, resolved.point);
      }
      renderBoundaryEdit();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    boundaryHover = resolved.point;
    renderBoundaryEdit();
    ev.preventDefault();
    ev.stopPropagation();
  };

  const handlePointerUp = (ev: PointerEvent) => {
    if ((boundaryEditActive || isVerticalBoardSketchEditMode()) && boundarySelectRect && boundarySelectRect.pointerId === ev.pointerId) {
      const selectRect = boundarySelectRect;
      boundarySelectRect = null;
      hideBoundarySelectRect();
      selectedBoundaryVertex = null;
      if (selectRect.active) {
        const canvasRect = args.renderer.domElement.getBoundingClientRect();
        const selected = selectCustomFurnitureBoundarySegmentsInRect(
          getEditablePlanLineSegments(),
          { x0: selectRect.startX, y0: selectRect.startY, x1: selectRect.currentX, y1: selectRect.currentY },
          (point) => worldToScreen(pointToWorld(point), args.getCamera(), canvasRect),
          selectRect.mode
        );
        if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) selectedBoundarySegmentIndexes.clear();
        for (const index of selected) selectedBoundarySegmentIndexes.add(index);
        selectedBoundarySegmentIndex = selected.at(-1) ?? null;
      } else {
        selectedBoundarySegmentIndex = null;
        selectedBoundarySegmentIndexes.clear();
      }
      renderBoundaryEdit();
      args.refreshProps();
      try {
        args.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if ((!boundaryEditActive && !isVerticalBoardSketchEditMode()) || !boundaryDrag || boundaryDrag.pointerId !== ev.pointerId) return;
    const startState: CustomFurnitureBoundaryEditState = {
      segments: boundaryDrag.startSegments,
      first: boundaryFirst,
      hover: boundaryHover,
      draftPoints,
      selectedSegmentIndex: selectedBoundarySegmentIndex,
      selectedSegmentIndexes: Array.from(selectedBoundarySegmentIndexes),
      selectedVertex: selectedBoundaryVertex
    };
    if (boundaryEditActive && JSON.stringify(cloneCustomFurnitureBoundarySegments(boundaryDrag.startSegments)) !== JSON.stringify(cloneCustomFurnitureBoundarySegments(boundarySegments))) {
      boundaryUndoStack.push(cloneCustomFurnitureBoundaryEditState(startState));
      if (boundaryUndoStack.length > 100) boundaryUndoStack.shift();
      boundaryRedoStack.splice(0, boundaryRedoStack.length);
    }
    boundaryDrag = null;
    boundarySnap = null;
    args.drawSnapOverlay.hide();
    args.hideHoverCursor();
    renderBoundaryEdit();
    buildDraftLine();
    try {
      args.renderer.domElement.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    ev.preventDefault();
    ev.stopPropagation();
  };

  const handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.code === "Space" && (activeTool || boundaryEditActive) && !(ev.target instanceof HTMLInputElement) && !(ev.target instanceof HTMLTextAreaElement)) {
      flipDrawOffsetDirection();
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return;
    }
    if ((ev.key === "Escape" || ev.code === "Escape") && activeTool && !boundaryEditActive) {
      boundaryDrawTool = "select";
      resetPlanLineEditRefs();
      resetSharedDrawInProgress();
      args.setLayoutSelectTool?.();
      args.syncViewerCursor?.();
      buildCustomFurnitureTopbar();
      args.refreshProps();
      args.setStatus(`${activeTool === "verticalBoard" ? "Vertical board" : activeTool === "horizontalBoard" ? "Horizontal board" : "Custom furniture"}: Select tool active.`);
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return;
    }
    if (!boundaryEditActive && !isVerticalBoardSketchEditMode()) return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const key = ev.key.toLowerCase();
      const handled =
        key === "z"
          ? ev.shiftKey
            ? redoBoundaryEdit()
            : undoBoundaryEdit()
          : key === "y"
            ? redoBoundaryEdit()
            : false;
      if (handled) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      }
      return;
    }
    if (boundaryEditActive && handleEscapeKey(ev)) return;
    if (ev.key === "Delete" || ev.key === "Backspace") {
      if (deleteBoundarySelection()) {
        args.setStatus(`${isVerticalBoardSketchEditMode() ? "Vertical board sketch" : "Furniture boundary"}: selected line deleted.`);
        ev.preventDefault();
      }
    }
  };

  args.renderer.domElement.addEventListener("pointerdown", handlePointerDown, true);
  args.renderer.domElement.addEventListener("pointermove", handlePointerMove, true);
  args.renderer.domElement.addEventListener("pointerup", handlePointerUp, true);
  args.renderer.domElement.addEventListener("dblclick", handleDoubleClick, true);
  window.addEventListener("keydown", handleKeyDown, true);

  const restoreCustomFurnitureFromSnapshot = (items: CustomFurnitureSnapshotItem[], nextCounter?: number) => {
    restoreEditorIsolation();
    clearBoundaryDraft();
    clearDraft();
    boundaryEditActive = false;
    for (const furniture of args.customFurniture.splice(0, args.customFurniture.length)) {
      args.layoutRoot.remove(furniture.root);
      disposeObject3D(furniture.root);
    }
    selectedFurnitureId = null;
    selectedBoardId = null;
    editorFurnitureId = null;
    boundaryEditFurnitureId = null;
    args.setCounter(nextCounter ?? 1);
    for (const item of items) {
      createCustomFurniture(cloneJson(item.params), { id: item.id, skipHistory: true });
    }
    selectedFurnitureId = null;
    selectedBoardId = null;
    syncCounterFromIds();
    args.refreshProps();
  };

  const getSaveItems = (): CustomFurnitureSnapshotItem[] =>
    args.customFurniture.map((item) => ({ id: item.id, params: cloneJson(item.params) }));

  const commitActiveDraft = () => {
    if (!shouldCommitCustomFurnitureDraftBeforeLeaving(activeTool, boundaryEditActive)) return true;
    const previousTool = activeTool;
    finishDraft();
    return activeTool !== previousTool;
  };

  const getVisibilityTargets = () => args.customFurniture.map((item) => ({ key: `customFurniture:${item.id}`, root: item.root }));
  const getSelectedVisibilityTargetKeys = () => (selectedFurnitureId ? [`customFurniture:${selectedFurnitureId}`] : []);

  return {
    addBoard,
    buildCustomFurnitureTopbar,
    commitActiveDraft,
    createCustomFurniture,
    deleteSelected: removeSelected,
    enterNew,
    getSaveItems,
    getSelectedVisibilityTargetKeys,
    getVisibilityTargets,
    handleEscapeKey,
    isCursorToolActive: () => boundaryEditActive || activeTool !== null,
    redoActiveEdit: redoBoundaryEdit,
    rebuildFurniture,
    restoreCustomFurnitureFromSnapshot,
    selectFurniture,
    startEdgeBanding,
    startHorizontalBoard,
    startVerticalBoard,
    tryMountActiveCustomFurnitureProps,
    undoActiveEdit: undoBoundaryEdit
  };
}
