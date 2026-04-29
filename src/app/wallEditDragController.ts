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
