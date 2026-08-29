import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import type { ModuleEditHud, WallEditHud } from "./measureTools";
import type { LayoutInstance, SelectedKind, WallInstance } from "./localTypes";
import {
  fromMmPoint,
  mmDist,
  toMmPoint,
  wallEndpointWhich
} from "./wallGeometryHelpers";

type EditHudContext = {
  S: AppState;
  wallEditHud: WallEditHud;
  moduleEditHud: ModuleEditHud;
  walls: WallInstance[];
  wallJoinTolMm: number;
  findInstance: (id: string) => LayoutInstance | null;
  getMode: () => "build" | "layout";
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  getLayoutTool: () => string;
  isWallDrawActive: () => boolean;
  getSelectedKind: () => SelectedKind;
  getSelectedWallId: () => string | null;
  getSelectedInstanceId: () => string | null;
  setWallEndpointMm: (wall: WallInstance, which: "a" | "b", point: { x: number; z: number }) => void;
  autoJoinAtMmPoint: (point: { x: number; z: number }) => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  rebuildInstance: (
    inst: LayoutInstance,
    opts?: { previousParams?: ModuleParams; preserveBackAnchor?: boolean; sourceKey?: string }
  ) => boolean;
  mountProps: () => void;
  commitHistory: () => void;
};

type EditableModuleWidthParams = ModuleParams & {
  width?: number;
  widthMm?: number;
};

export function createEditHudController(ctx: EditHudContext) {
  const hideWallEditHud = () => {
    ctx.wallEditHud.lenLine.style.display = "none";
    ctx.wallEditHud.lenExtA.style.display = "none";
    ctx.wallEditHud.lenExtB.style.display = "none";
    ctx.wallEditHud.offsetLine.style.display = "none";
    ctx.wallEditHud.offsetTickA.style.display = "none";
    ctx.wallEditHud.offsetTickB.style.display = "none";
    ctx.wallEditHud.handleA.style.display = "none";
    ctx.wallEditHud.handleB.style.display = "none";
    ctx.wallEditHud.handleMid.style.display = "none";
    ctx.wallEditHud.label.style.display = "none";
    ctx.wallEditHud.input.style.display = "none";
    ctx.wallEditHud.offsetLabel.style.display = "none";
    ctx.wallEditHud.offsetInput.style.display = "none";
    ctx.wallEditHud.offsetRefWallId = null;
  };

  const hideModuleEditHud = () => {
    ctx.moduleEditHud.widthLine.style.display = "none";
    ctx.moduleEditHud.widthExtA.style.display = "none";
    ctx.moduleEditHud.widthExtB.style.display = "none";
    ctx.moduleEditHud.label.style.display = "none";
    ctx.moduleEditHud.input.style.display = "none";
  };

  const getEditableModuleWidthMm = (inst: LayoutInstance) => {
    const params = inst.params as EditableModuleWidthParams;
    const raw = params.widthMm ?? params.width;
    return typeof raw === "number" && Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : null;
  };

  const setEditableModuleWidthMm = (inst: LayoutInstance, valueMm: number) => {
    const params = inst.params as EditableModuleWidthParams;
    if (typeof params.widthMm === "number") {
      params.widthMm = valueMm;
      return true;
    }
    if (typeof params.width === "number") {
      params.width = valueMm;
      return true;
    }
    return false;
  };

  const parseMm = (raw: string) => {
    const value = Number(String(raw).trim().replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(value) ? Math.round(value) : null;
  };

  const commitWallLengthMm = (raw: string) => {
    if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
    const wall = ctx.walls.find((x) => x.id === ctx.getSelectedWallId()) ?? null;
    if (!wall) return;

    const parsed = parseMm(raw);
    if (parsed == null) return;
    const lenMm = Math.max(1, parsed);

    const oldB = { ...wall.params.bMm };
    const a = fromMmPoint(wall.params.aMm);
    const b = fromMmPoint(wall.params.bMm);
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) d.set(1, 0, 0);
    d.normalize();
    const newB = a.clone().addScaledVector(d, lenMm / 1000);
    const newBMm = toMmPoint(newB);
    ctx.setWallEndpointMm(wall, "b", newBMm);

    for (const other of ctx.walls) {
      if (other.id === wall.id) continue;
      const which = wallEndpointWhich(other, oldB, ctx.wallJoinTolMm);
      if (which) ctx.setWallEndpointMm(other, which, newBMm);
    }

    ctx.autoJoinAtMmPoint(wall.params.aMm);
    ctx.autoJoinAtMmPoint(wall.params.bMm);
    ctx.rebuildWallPlanMesh();
    ctx.mountProps();
  };

  const commitWallOffsetMm = (raw: string) => {
    if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
    const wall = ctx.walls.find((x) => x.id === ctx.getSelectedWallId()) ?? null;
    const refId = ctx.wallEditHud.offsetRefWallId;
    const ref = refId ? ctx.walls.find((x) => x.id === refId) ?? null : null;
    if (!wall || !ref) return;

    const parsed = parseMm(raw);
    if (parsed == null) return;
    const desiredOffsetMm = Math.max(0, parsed);

    const a = fromMmPoint(wall.params.aMm);
    const b = fromMmPoint(wall.params.bMm);
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
    const desiredCenterDistM = desiredOffsetMm / 1000 + (wall.params.thicknessMm + ref.params.thicknessMm) / 2000;
    const desiredSigned = sign * desiredCenterDistM;
    const shift = signed - desiredSigned;

    const shiftMm = { x: Math.round(n.x * shift * 1000), z: Math.round(n.z * shift * 1000) };
    const oldA = { ...wall.params.aMm };
    const oldB = { ...wall.params.bMm };
    wall.params.aMm = { x: wall.params.aMm.x + shiftMm.x, z: wall.params.aMm.z + shiftMm.z };
    wall.params.bMm = { x: wall.params.bMm.x + shiftMm.x, z: wall.params.bMm.z + shiftMm.z };

    for (const other of ctx.walls) {
      if (other.id === wall.id) continue;
      const wa = wallEndpointWhich(other, oldA, ctx.wallJoinTolMm);
      if (wa) ctx.setWallEndpointMm(other, wa, wall.params.aMm);
      const wb = wallEndpointWhich(other, oldB, ctx.wallJoinTolMm);
      if (wb) ctx.setWallEndpointMm(other, wb, wall.params.bMm);
    }

    ctx.rebuildWall(wall);
    ctx.autoJoinAtMmPoint(wall.params.aMm);
    ctx.autoJoinAtMmPoint(wall.params.bMm);
    ctx.rebuildWallPlanMesh();
    ctx.mountProps();
  };

  const commitModuleWidthMm = (raw: string) => {
    if (ctx.getSelectedKind() !== "module" || !ctx.getSelectedInstanceId()) return;
    const inst = ctx.findInstance(ctx.getSelectedInstanceId()!) ?? null;
    if (!inst) return;
    const parsed = parseMm(raw);
    if (parsed == null) return;
    const widthMm = Math.max(1, parsed);
    const previousParams = structuredClone(inst.params) as ModuleParams;
    if (!setEditableModuleWidthMm(inst, widthMm)) return;
    const accepted = ctx.rebuildInstance(inst, {
      previousParams,
      preserveBackAnchor: true,
      sourceKey: typeof (inst.params as EditableModuleWidthParams).widthMm === "number" ? "widthMm" : "width"
    });
    if (!accepted) return;
    ctx.mountProps();
    ctx.commitHistory();
  };

  const installInlineEditors = () => {
    ctx.wallEditHud.label.addEventListener("pointerdown", (ev) => {
      if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
      if (ctx.getMode() !== "layout" || ctx.getViewMode() !== "2d") return;
      if (ctx.getLayoutTool() === "wall" && ctx.isWallDrawActive()) return;
      ev.preventDefault();
      ev.stopPropagation();

      const wall = ctx.walls.find((x) => x.id === ctx.getSelectedWallId()) ?? null;
      if (!wall) return;
      ctx.wallEditHud.input.value = String(Math.round(mmDist(wall.params.aMm, wall.params.bMm)));
      ctx.wallEditHud.input.style.left = ctx.wallEditHud.label.style.left;
      ctx.wallEditHud.input.style.top = ctx.wallEditHud.label.style.top;
      ctx.wallEditHud.input.style.transform = "translate(-50%, -50%)";
      ctx.wallEditHud.input.style.display = "block";
      ctx.wallEditHud.input.focus();
      ctx.wallEditHud.input.select();
    });

    ctx.wallEditHud.input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        commitWallLengthMm(ctx.wallEditHud.input.value);
        ctx.wallEditHud.input.blur();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        ctx.wallEditHud.input.style.display = "none";
        ctx.wallEditHud.input.blur();
        ev.preventDefault();
      }
    });
    ctx.wallEditHud.input.addEventListener("blur", () => {
      ctx.wallEditHud.input.style.display = "none";
    });

    ctx.wallEditHud.offsetLabel.addEventListener("pointerdown", (ev) => {
      if (ctx.getSelectedKind() !== "wall" || !ctx.getSelectedWallId()) return;
      if (ctx.getMode() !== "layout" || ctx.getViewMode() !== "2d") return;
      if (ctx.getLayoutTool() === "wall" && ctx.isWallDrawActive()) return;
      ev.preventDefault();
      ev.stopPropagation();

      ctx.wallEditHud.offsetInput.value = String(ctx.wallEditHud.offsetLabel.textContent?.replace(/[^0-9\-]/g, "") ?? "");
      ctx.wallEditHud.offsetInput.style.left = ctx.wallEditHud.offsetLabel.style.left;
      ctx.wallEditHud.offsetInput.style.top = ctx.wallEditHud.offsetLabel.style.top;
      ctx.wallEditHud.offsetInput.style.transform = "translate(-50%, -50%)";
      ctx.wallEditHud.offsetInput.style.display = "block";
      ctx.wallEditHud.offsetInput.focus();
      ctx.wallEditHud.offsetInput.select();
    });

    ctx.wallEditHud.offsetInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        commitWallOffsetMm(ctx.wallEditHud.offsetInput.value);
        ctx.wallEditHud.offsetInput.blur();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        ctx.wallEditHud.offsetInput.style.display = "none";
        ctx.wallEditHud.offsetInput.blur();
        ev.preventDefault();
      }
    });
    ctx.wallEditHud.offsetInput.addEventListener("blur", () => {
      ctx.wallEditHud.offsetInput.style.display = "none";
    });

    ctx.moduleEditHud.label.addEventListener("pointerdown", (ev) => {
      if (ctx.getSelectedKind() !== "module" || !ctx.getSelectedInstanceId()) return;
      if (ctx.getMode() !== "layout" || ctx.getViewMode() !== "2d" || ctx.getActiveViewerTab() !== "floorplan") return;
      ev.preventDefault();
      ev.stopPropagation();

      const inst = ctx.findInstance(ctx.getSelectedInstanceId()!) ?? null;
      const widthMm = inst ? getEditableModuleWidthMm(inst) : null;
      if (!inst || widthMm == null) return;
      ctx.moduleEditHud.input.value = String(widthMm);
      ctx.moduleEditHud.input.style.left = ctx.moduleEditHud.label.style.left;
      ctx.moduleEditHud.input.style.top = ctx.moduleEditHud.label.style.top;
      ctx.moduleEditHud.input.style.transform = "translate(-50%, -50%)";
      ctx.moduleEditHud.input.style.display = "block";
      ctx.moduleEditHud.input.focus();
      ctx.moduleEditHud.input.select();
    });

    ctx.moduleEditHud.input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        commitModuleWidthMm(ctx.moduleEditHud.input.value);
        ctx.moduleEditHud.input.blur();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        ctx.moduleEditHud.input.style.display = "none";
        ctx.moduleEditHud.input.blur();
        ev.preventDefault();
      }
    });
    ctx.moduleEditHud.input.addEventListener("blur", () => {
      ctx.moduleEditHud.input.style.display = "none";
    });
  };

  return {
    hideWallEditHud,
    hideModuleEditHud,
    getEditableModuleWidthMm,
    setEditableModuleWidthMm,
    installInlineEditors
  };
}
