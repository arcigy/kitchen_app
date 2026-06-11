import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AlignPickedLine } from "./localTypes";
import { clamp } from "./sharedUtils";
import type { TemporaryDimensionManagerPort } from "./temporaryDimensionManager";

export type TechnicalDimensionPoint = { x: number; y: number };

export type TechnicalDimensionRecord = {
  id: string;
  start: TechnicalDimensionPoint;
  end: TechnicalDimensionPoint;
  extensionStart: TechnicalDimensionPoint;
  extensionEnd: TechnicalDimensionPoint;
};

export type TechnicalDimensionState = {
  picked: AlignPickedLine[];
  hover: AlignPickedLine | null;
  preview: TechnicalDimensionRecord[];
};

type TechnicalDimensionManagerArgs = {
  temporaryDimensions: TemporaryDimensionManagerPort;
  renderer: THREE.WebGLRenderer;
  getCamera: () => THREE.Camera;
  getControls: () => OrbitControls;
  getMode: () => "build" | "layout";
  getViewMode: () => "3d" | "2d";
  getActiveViewerTab: () => string;
  clearToolHud: () => void;
  recordActivity?: (label: string) => void;
};

const linePointToDimensionPoint = (p: THREE.Vector3): TechnicalDimensionPoint => ({ x: p.x, y: -p.z });

const dimensionLineKey = (line: AlignPickedLine) => {
  const owner = line.wallId ?? line.instanceId ?? line.worktopId ?? "";
  const seg = line.segmentIndex ?? "";
  return [
    line.targetKind,
    owner,
    seg,
    line.lineRole,
    line.segA.x.toFixed(4),
    line.segA.z.toFixed(4),
    line.segB.x.toFixed(4),
    line.segB.z.toFixed(4)
  ].join(":");
};

const pointOnPickedLineAt = (line: AlignPickedLine, dir: THREE.Vector3, along: number) => {
  const base = line.p.dot(dir);
  return line.p.clone().addScaledVector(dir, along - base);
};

export function createTechnicalDimensionManager(args: TechnicalDimensionManagerArgs) {
  const dimensions: TechnicalDimensionRecord[] = [];
  let nextId = 1;
  const state: TechnicalDimensionState = {
    picked: [],
    hover: null,
    preview: []
  };

  const render = () => {
    const rect = args.renderer.domElement.getBoundingClientRect();
    args.temporaryDimensions.setSize(rect.width, rect.height);
    args.temporaryDimensions.clear();

    const activeCam = args.getCamera();
    const isFloorplan = args.getMode() === "layout" && args.getViewMode() === "2d" && args.getActiveViewerTab() === "floorplan";
    args.temporaryDimensions.setVisible(isFloorplan);
    if (!isFloorplan || !(activeCam instanceof THREE.OrthographicCamera)) return;

    const scaleX = (rect.width / Math.max(1e-9, Math.abs(activeCam.right - activeCam.left))) * activeCam.zoom;
    const scaleY = (rect.height / Math.max(1e-9, Math.abs(activeCam.top - activeCam.bottom))) * activeCam.zoom;
    const scale = Math.max(1e-6, Math.min(scaleX, scaleY));
    const target = args.getControls().target;
    args.temporaryDimensions.syncCamera(scale, -target.x, -target.z);

    for (const dim of dimensions) {
      args.temporaryDimensions.addPlacedDimension(dim.start, dim.end, dim.extensionStart, dim.extensionEnd);
    }
    for (const dim of state.preview) {
      args.temporaryDimensions.addPlacedDimension(dim.start, dim.end, dim.extensionStart, dim.extensionEnd);
    }
    args.temporaryDimensions.render();
  };

  const isLinePicked = (line: AlignPickedLine) =>
    state.picked.some((picked) => dimensionLineKey(picked) === dimensionLineKey(line));

  const buildFromPickedLines = (lines: AlignPickedLine[], placement: THREE.Vector3, idPrefix: string) => {
    if (lines.length < 2) return [] as TechnicalDimensionRecord[];
    const dir = lines[0]!.dir.clone().setY(0);
    if (dir.lengthSq() < 1e-10) return [] as TechnicalDimensionRecord[];
    dir.normalize();
    const normal = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const placementAlong = placement.dot(dir);

    const anchors = lines
      .map((line) => {
        const signed = line.p.clone().sub(lines[0]!.p).dot(normal);
        const aAlong = line.segA.dot(dir);
        const bAlong = line.segB.dot(dir);
        const edgeAlong = clamp(placementAlong, Math.min(aAlong, bAlong), Math.max(aAlong, bAlong));
        return {
          signed,
          anchor: pointOnPickedLineAt(line, dir, placementAlong),
          extension: pointOnPickedLineAt(line, dir, edgeAlong)
        };
      })
      .sort((a, b) => a.signed - b.signed);

    const dims: TechnicalDimensionRecord[] = [];
    for (let i = 0; i < anchors.length - 1; i += 1) {
      const a = anchors[i]!;
      const b = anchors[i + 1]!;
      if (a.anchor.distanceToSquared(b.anchor) < 1e-10) continue;
      dims.push({
        id: `${idPrefix}-${i}`,
        start: linePointToDimensionPoint(a.anchor),
        end: linePointToDimensionPoint(b.anchor),
        extensionStart: linePointToDimensionPoint(a.extension),
        extensionEnd: linePointToDimensionPoint(b.extension)
      });
    }
    return dims;
  };

  const commitDimensions = (next: TechnicalDimensionRecord[]) => {
    for (const dim of next) {
      dimensions.push({ ...dim, id: `dimension-${nextId++}` });
    }
    if (next.length > 0) args.recordActivity?.(next.length > 1 ? `${next.length} dimensions added` : "Dimension added");
  };

  const resetDraft = () => {
    state.picked = [];
    state.hover = null;
    state.preview = [];
    args.clearToolHud();
  };

  return {
    state,
    render,
    isLinePicked,
    buildFromPickedLines,
    commitDimensions,
    resetDraft,
    getSaveState: () => ({
      dimensions: dimensions.map((dimension) => ({ ...dimension })),
      nextId
    }),
    restoreSaveState(state: unknown) {
      const saved = state as { dimensions?: TechnicalDimensionRecord[]; nextId?: number } | null | undefined;
      dimensions.splice(0, dimensions.length);
      if (Array.isArray(saved?.dimensions)) {
        for (const dimension of saved.dimensions) {
          if (
            typeof dimension?.id === "string" &&
            dimension.start &&
            dimension.end &&
            dimension.extensionStart &&
            dimension.extensionEnd
          ) {
            dimensions.push({ ...dimension });
          }
        }
      }
      nextId = Math.max(Number.isFinite(saved?.nextId) ? Number(saved?.nextId) : 1, dimensions.length + 1, 1);
      resetDraft();
      render();
    }
  };
}
