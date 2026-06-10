import * as THREE from "three";
import type { WallEditHud } from "./measureTools";
import type { WallInstance } from "./localTypes";
import { wallEndpointWhich } from "./wallGeometryHelpers";

type WallEditDragContext = {
  wallEditHud: WallEditHud;
  walls: WallInstance[];
  renderer: THREE.WebGLRenderer;
  pointerNdc: THREE.Vector2;
  raycaster: THREE.Raycaster;
  groundPlane: THREE.Plane;
  wallJoinTolMm: number;
  getMode: () => "build" | "layout";
  getViewMode: () => "2d" | "3d";
  getLayoutTool: () => string;
  isMeasureEnabled: () => boolean;
  getSelectedKind: () => string | null;
  getSelectedWallId: () => string | null;
  getCamera: () => THREE.Camera;
};

export type WallEditDragSnapshot = NonNullable<WallEditHud["drag"]>;
type WallEditPoint = { x: number; z: number };

export function calculateWallMoveDragEndpoints(drag: WallEditDragSnapshot, hitPoint: THREE.Vector3) {
  const dx = hitPoint.x - drag.startWorld.x;
  const dz = hitPoint.z - drag.startWorld.z;
  return {
    nextA: { x: Math.round(drag.startA.x + dx * 1000), z: Math.round(drag.startA.z + dz * 1000) },
    nextB: { x: Math.round(drag.startB.x + dx * 1000), z: Math.round(drag.startB.z + dz * 1000) }
  };
}

function applyConnectedEndpoint(
  walls: WallInstance[],
  connected: Array<{ wallId: string; which: "a" | "b" }>,
  point: WallEditPoint,
  touched: Set<string>
) {
  for (const connection of connected) {
    const wall = walls.find((item) => item.id === connection.wallId) ?? null;
    if (!wall) continue;
    if (connection.which === "a") wall.params.aMm = point;
    else wall.params.bMm = point;
    touched.add(wall.id);
  }
}

export function applyWallEditDragEndpointUpdate(args: {
  drag: WallEditDragSnapshot;
  nextA?: WallEditPoint;
  nextB?: WallEditPoint;
  wall: WallInstance;
  walls: WallInstance[];
}) {
  const touched = new Set<string>();
  touched.add(args.wall.id);

  if (args.nextA) {
    args.wall.params.aMm = args.nextA;
    applyConnectedEndpoint(args.walls, args.drag.connectedA, args.nextA, touched);
  }
  if (args.nextB) {
    args.wall.params.bMm = args.nextB;
    applyConnectedEndpoint(args.walls, args.drag.connectedB, args.nextB, touched);
  }

  return touched;
}

export function restoreWallEditDragEndpointSnapshot(args: {
  drag: WallEditDragSnapshot;
  wall: WallInstance;
  walls: WallInstance[];
}) {
  if (args.drag.kind === "move" || args.drag.kind === "a") {
    args.wall.params.aMm = { x: args.drag.startA.x, z: args.drag.startA.z };
    applyConnectedEndpoint(args.walls, args.drag.connectedA, { x: args.drag.startA.x, z: args.drag.startA.z }, new Set());
  }
  if (args.drag.kind === "move" || args.drag.kind === "b") {
    args.wall.params.bMm = { x: args.drag.startB.x, z: args.drag.startB.z };
    applyConnectedEndpoint(args.walls, args.drag.connectedB, { x: args.drag.startB.x, z: args.drag.startB.z }, new Set());
  }
}

export function updateWallEditHudDragPointerMove(args: {
  drag: WallEditDragSnapshot;
  fromMmPoint: (point: WallEditPoint) => THREE.Vector3;
  hasModuleWallOverlap: () => boolean;
  hitPoint: THREE.Vector3;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  shiftKey: boolean;
  snapAxisXZ: (anchor: THREE.Vector3, point: THREE.Vector3, enabled: boolean) => THREE.Vector3;
  snapPoint2D: (point: THREE.Vector3) => { kind: string; point: THREE.Vector3 };
  toMmPoint: (point: THREE.Vector3) => WallEditPoint;
  wall: WallInstance;
  walls: WallInstance[];
}) {
  if (args.drag.kind === "move") {
    const { nextA, nextB } = calculateWallMoveDragEndpoints(args.drag, args.hitPoint);
    const touched = applyWallEditDragEndpointUpdate({
      drag: args.drag,
      nextA,
      nextB,
      wall: args.wall,
      walls: args.walls
    });

    for (const id of touched) {
      const wall = args.walls.find((item) => item.id === id) ?? null;
      if (wall) args.rebuildWall(wall);
    }
    args.rebuildWallPlanMesh();

    if (args.hasModuleWallOverlap()) {
      restoreWallEditDragEndpointSnapshot({ drag: args.drag, wall: args.wall, walls: args.walls });
      for (const wall of args.walls) args.rebuildWall(wall);
      args.rebuildWallPlanMesh();
    }
    return;
  }

  const which = args.drag.kind;
  const other = which === "a" ? args.fromMmPoint(args.drag.startB) : args.fromMmPoint(args.drag.startA);
  const snapped = args.snapPoint2D(args.hitPoint);
  const shouldAxisSnap = !args.shiftKey && snapped.kind === "none";
  const p0 = snapped.kind !== "none" ? snapped.point : args.hitPoint;
  const point = shouldAxisSnap ? args.snapAxisXZ(other, p0, true) : p0;
  const pointMm = args.toMmPoint(point);

  const touched = applyWallEditDragEndpointUpdate({
    drag: args.drag,
    nextA: which === "a" ? pointMm : undefined,
    nextB: which === "b" ? pointMm : undefined,
    wall: args.wall,
    walls: args.walls
  });
  for (const id of touched) {
    const wall = args.walls.find((item) => item.id === id) ?? null;
    if (wall) args.rebuildWall(wall);
  }
  args.rebuildWallPlanMesh();

  if (args.hasModuleWallOverlap()) {
    restoreWallEditDragEndpointSnapshot({ drag: args.drag, wall: args.wall, walls: args.walls });
    for (const wall of args.walls) args.rebuildWall(wall);
    args.rebuildWallPlanMesh();
  }
}

export function finishWallEditHudDragPointerUp(args: {
  autoJoinAtMmPoint: (point: { x: number; z: number }) => void;
  commitHistory: () => void;
  mountProps: () => void;
  pointerId: number;
  rebuildWallPlanMesh: () => void;
  releasePointerCapture: (pointerId: number) => void;
  wallEditHud: WallEditHud;
  walls: WallInstance[];
}) {
  if (!args.wallEditHud.drag || args.wallEditHud.drag.pointerId !== args.pointerId) return false;

  const drag = args.wallEditHud.drag;
  args.wallEditHud.drag = null;
  const wall = args.walls.find((item) => item.id === drag.wallId) ?? null;
  if (wall) {
    args.autoJoinAtMmPoint(wall.params.aMm);
    args.autoJoinAtMmPoint(wall.params.bMm);
  }
  args.rebuildWallPlanMesh();
  args.mountProps();
  args.commitHistory();
  args.releasePointerCapture(args.pointerId);
  return true;
}

export function createWallEditDragController(ctx: WallEditDragContext) {
  const beginWallDrag = (ev: PointerEvent, wallId: string, kind: "a" | "b" | "move") => {
    if (ctx.getMode() !== "layout" || ctx.getViewMode() !== "2d") return;
    if (ctx.getLayoutTool() !== "select") return;
    if (ctx.isMeasureEnabled()) return;

    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) return;

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    ctx.pointerNdc.set(x, y);
    ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.getCamera());
    const hitPoint = new THREE.Vector3();
    if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

    const gatherConnected = (point: { x: number; z: number }) => {
      const out: Array<{ wallId: string; which: "a" | "b" }> = [];
      for (const other of ctx.walls) {
        if (other.id === wallId) continue;
        const which = wallEndpointWhich(other, point, ctx.wallJoinTolMm);
        if (which) out.push({ wallId: other.id, which });
      }
      return out;
    };

    ctx.wallEditHud.drag = {
      wallId,
      kind,
      pointerId: ev.pointerId,
      startWorld: hitPoint.clone(),
      startA: { ...wall.params.aMm },
      startB: { ...wall.params.bMm },
      connectedA: gatherConnected(wall.params.aMm),
      connectedB: gatherConnected(wall.params.bMm)
    };

    try {
      ctx.renderer.domElement.setPointerCapture(ev.pointerId);
    } catch {
      // Pointer capture can fail if the browser already released this pointer.
    }

    ev.preventDefault();
    ev.stopPropagation();
  };

  const installHandleListeners = () => {
    ctx.wallEditHud.handleA.addEventListener("pointerdown", (ev) => {
      if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
      beginWallDrag(ev, ctx.getSelectedWallId()!, "a");
    });
    ctx.wallEditHud.handleB.addEventListener("pointerdown", (ev) => {
      if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
      beginWallDrag(ev, ctx.getSelectedWallId()!, "b");
    });
    ctx.wallEditHud.handleMid.addEventListener("pointerdown", (ev) => {
      if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
      beginWallDrag(ev, ctx.getSelectedWallId()!, "move");
    });
  };

  return {
    beginWallDrag,
    installHandleListeners
  };
}
