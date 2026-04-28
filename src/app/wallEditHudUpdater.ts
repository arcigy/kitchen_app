import * as THREE from "three";
import type { LayoutTool } from "../layout/appState";
import type { SelectedKind, WallInstance } from "./localTypes";
import type { MeasureState, WallEditHud } from "./measureTools";

type ScreenPoint = { x: number; y: number };

type WallEditHudUpdaterContext = {
  cam: () => THREE.Camera;
  clamp: (value: number, min: number, max: number) => number;
  fromMmPoint: (point: { x: number; z: number }) => THREE.Vector3;
  hideWallEditHud: () => void;
  layoutTool: LayoutTool;
  measureState: Pick<MeasureState, "enabled">;
  mmDist: (a: { x: number; z: number }, b: { x: number; z: number }) => number;
  mode: "build" | "layout";
  renderer: THREE.WebGLRenderer;
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  viewMode: "2d" | "3d";
  wallEditHud: WallEditHud;
  walls: WallInstance[];
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => ScreenPoint;
};

export function createWallEditHudUpdater(ctx: WallEditHudUpdaterContext) {
  const updateWallEditHud = () => {
    if (ctx.mode !== "layout" || ctx.viewMode !== "2d" || ctx.layoutTool !== "select") {
      ctx.hideWallEditHud();
      return;
    }
    if (ctx.measureState.enabled) {
      ctx.hideWallEditHud();
      return;
    }
    if (ctx.wallEditHud.drag) {
      // keep HUD visible during drag
    }

    if (ctx.selectedKind !== "wall" || !ctx.selectedWallId) {
      ctx.hideWallEditHud();
      return;
    }
    const w = ctx.walls.find((x) => x.id === ctx.selectedWallId) ?? null;
    if (!w) {
      ctx.hideWallEditHud();
      return;
    }

    const a = ctx.fromMmPoint(w.params.aMm);
    const b = ctx.fromMmPoint(w.params.bMm);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const sa = ctx.worldToScreen(a, ctx.cam(), rect);
    const sb = ctx.worldToScreen(b, ctx.cam(), rect);
    const sm = ctx.worldToScreen(mid, ctx.cam(), rect);

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

    ctx.wallEditHud.handleA.style.left = `${sa.x}px`;
    ctx.wallEditHud.handleA.style.top = `${sa.y}px`;
    ctx.wallEditHud.handleA.style.display = "block";

    ctx.wallEditHud.handleB.style.left = `${sb.x}px`;
    ctx.wallEditHud.handleB.style.top = `${sb.y}px`;
    ctx.wallEditHud.handleB.style.display = "block";

    ctx.wallEditHud.handleMid.style.left = `${sm.x}px`;
    ctx.wallEditHud.handleMid.style.top = `${sm.y}px`;
    ctx.wallEditHud.handleMid.style.display = "block";

    const lenMm = Math.round(ctx.mmDist(w.params.aMm, w.params.bMm));
    ctx.wallEditHud.label.textContent = `${lenMm} mm`;

    // offset dimension line + label a bit perpendicular to wall direction in screen space
    const dir = b.clone().sub(a);
    const n = new THREE.Vector2(-dir.z, dir.x);
    if (n.lengthSq() > 1e-8) n.normalize();

    const off = { x: n.x * 18, y: n.y * 18 };
    const da = { x: sa.x + off.x, y: sa.y + off.y };
    const db = { x: sb.x + off.x, y: sb.y + off.y };
    const dm = { x: sm.x + off.x, y: sm.y + off.y };

    setLine(ctx.wallEditHud.lenLine, da, db);
    setLine(ctx.wallEditHud.lenExtA, sa, da);
    setLine(ctx.wallEditHud.lenExtB, sb, db);

    ctx.wallEditHud.label.style.left = `${dm.x}px`;
    ctx.wallEditHud.label.style.top = `${dm.y}px`;
    if (ctx.wallEditHud.input.style.display !== "block") {
      ctx.wallEditHud.label.style.display = "block";
    } else {
      ctx.wallEditHud.label.style.display = "none";
    }

    // Auto-dimension to nearest parallel wall (face-to-face)
    ctx.wallEditHud.offsetRefWallId = null;
    ctx.wallEditHud.offsetLine.style.display = "none";
    ctx.wallEditHud.offsetTickA.style.display = "none";
    ctx.wallEditHud.offsetTickB.style.display = "none";
    ctx.wallEditHud.offsetLabel.style.display = "none";

    const selDir = b.clone().sub(a);
    if (selDir.lengthSq() > 1e-8) {
      selDir.normalize();
      const selN = new THREE.Vector3(-selDir.z, 0, selDir.x).normalize();
      const tA = a.dot(selDir);
      const tB = b.dot(selDir);
      const minSel = Math.min(tA, tB);
      const maxSel = Math.max(tA, tB);

      let best: { w: WallInstance; dist: number; signed: number; overlapMin: number; overlapMax: number } | null = null;
      for (const other of ctx.walls) {
        if (other.id === w.id) continue;
        const oa = ctx.fromMmPoint(other.params.aMm);
        const ob = ctx.fromMmPoint(other.params.bMm);
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
        ctx.wallEditHud.offsetRefWallId = ref.id;

        const sign = best.signed >= 0 ? 1 : -1;
        const refA = ctx.fromMmPoint(ref.params.aMm);
        const refB = ctx.fromMmPoint(ref.params.bMm);
        const tRefA = refA.dot(selDir);
        const tRefB = refB.dot(selDir);
        const overlapT = (best.overlapMin + best.overlapMax) / 2;

        const selDen = tB - tA;
        const refDen = tRefB - tRefA;
        const uSel = Math.abs(selDen) < 1e-8 ? 0.5 : ctx.clamp((overlapT - tA) / selDen, 0, 1);
        const uRef = Math.abs(refDen) < 1e-8 ? 0.5 : ctx.clamp((overlapT - tRefA) / refDen, 0, 1);

        const pSel = a.clone().lerp(b, uSel);
        const pRef = refA.clone().lerp(refB, uRef);

        const tSel = w.params.thicknessMm / 1000;
        const tRef = ref.params.thicknessMm / 1000;
        const faceOffsetM = (tSel + tRef) / 2;
        const faceDistM = Math.max(0, best.dist - faceOffsetM);
        const faceDistMm = Math.round(faceDistM * 1000);

        const p0 = pSel.clone().addScaledVector(selN, (tSel / 2) * sign);
        const p1 = pRef.clone().addScaledVector(selN, (-tRef / 2) * sign);

        const s0 = ctx.worldToScreen(p0, ctx.cam(), rect);
        const s1 = ctx.worldToScreen(p1, ctx.cam(), rect);
        setLine(ctx.wallEditHud.offsetLine, s0, s1);

        const ddx = s1.x - s0.x;
        const ddy = s1.y - s0.y;
        const dlen = Math.max(0.001, Math.hypot(ddx, ddy));
        const ux = ddx / dlen;
        const uy = ddy / dlen;
        const vx = -uy;
        const vy = ux;
        const tick = 6;
        setLine(
          ctx.wallEditHud.offsetTickA,
          { x: s0.x - vx * tick, y: s0.y - vy * tick },
          { x: s0.x + vx * tick, y: s0.y + vy * tick }
        );
        setLine(
          ctx.wallEditHud.offsetTickB,
          { x: s1.x - vx * tick, y: s1.y - vy * tick },
          { x: s1.x + vx * tick, y: s1.y + vy * tick }
        );

        ctx.wallEditHud.offsetLabel.textContent = `${faceDistMm} mm`;
        ctx.wallEditHud.offsetLabel.style.left = `${(s0.x + s1.x) / 2 + vx * 16}px`;
        ctx.wallEditHud.offsetLabel.style.top = `${(s0.y + s1.y) / 2 + vy * 16}px`;
        if (ctx.wallEditHud.offsetInput.style.display !== "block") {
          ctx.wallEditHud.offsetLabel.style.display = "block";
        } else {
          ctx.wallEditHud.offsetLabel.style.display = "none";
        }
      }
    }
  };

  return { updateWallEditHud };
}
