import type { AppState, AlignWallLine, DimensionInstance, DimensionParams, DimensionRef } from "./appState";
import { commitHistory } from "./historyManager";

export interface DimensionHelpers {
  THREE: any;
  cam: () => any;
  hudLineThicknessM: (rect: DOMRect) => number;
  wallRefLineToCenterLine: (
    refA: any,
    refB: any,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) => { a: any; b: any };
  dimMat: any;
  dimMatSelected: any;
  dimPickMat: any;
  layoutRoot: any;
  getViewMode: () => "2d" | "3d";
  getSelectedKind: () => any;
  getSelectedDimensionId: () => string | null;
  setSelectedDimension: (id: string | null) => void;
  getDimPreview: () => { root: any; text: any } | null;
}

export const makeDimTextSprite = (S: AppState, helpers: DimensionHelpers, text: string) => {
  void S;
  const THREE = helpers.THREE;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");
  const pad = 2;
  const fontPx = 28;
  ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + pad * 2);
  const h = Math.ceil(fontPx + pad * 2);
  canvas.width = w;
  canvas.height = h;

  // redraw
  const ctx2 = canvas.getContext("2d")!;
  ctx2.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx2.textBaseline = "middle";
  ctx2.textAlign = "center";
  ctx2.fillStyle = "rgba(255,255,255,0.92)";
  ctx2.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.renderOrder = 90;
  spr.position.y = 0.055;
  (spr.userData as any).wPx = w;
  (spr.userData as any).hPx = h;
  return spr;
};

export const updateSpriteText = (S: AppState, helpers: DimensionHelpers, spr: any, text: string) => {
  if ((spr.userData as any).text === text) return;
  (spr.userData as any).text = text;
  const mat = spr.material as any;
  const old = (mat.map as any) ?? null;
  const next = makeDimTextSprite(S, helpers, text);
  const nextMat = next.material as any;
  mat.map = nextMat.map;
  mat.needsUpdate = true;
  nextMat.dispose();
  (spr.userData as any).wPx = (next.userData as any).wPx;
  (spr.userData as any).hPx = (next.userData as any).hPx;
  if (old) old.dispose();
};

export const makeDimBarMesh = (S: AppState, helpers: DimensionHelpers, mat: any) => {
  void S;
  const THREE = helpers.THREE;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.01, 0.01), mat);
  m.renderOrder = 75;
  m.position.y = 0.05;
  return m;
};

export const updateDimBar = (S: AppState, helpers: DimensionHelpers, mesh: any, a: any, b: any, thicknessM: number) => {
  void S;
  const THREE = helpers.THREE;
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-6) {
    mesh.visible = false;
    return;
  }
  const ang = Math.atan2(d.z, d.x);
  const mid = a.clone().addScaledVector(d, 0.5);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(len, 0.01, thicknessM);
  mesh.position.set(mid.x, 0.05, mid.z);
  mesh.rotation.set(0, ang, 0);
  mesh.visible = true;
};

export const orthoWorldPerPx = (S: AppState, helpers: DimensionHelpers, rect: DOMRect) => {
  void S;
  const THREE = helpers.THREE;
  const c = helpers.cam();
  if (!(c instanceof THREE.OrthographicCamera)) return null as number | null;
  const visibleHeight = Math.abs(c.top - c.bottom) / Math.max(1e-6, c.zoom);
  const worldPerPixel = visibleHeight / Math.max(1, rect.height);
  return worldPerPixel;
};

export const setSpriteScreenFixedScale = (S: AppState, helpers: DimensionHelpers, spr: any, rect: DOMRect) => {
  const wpp = orthoWorldPerPx(S, helpers, rect);
  if (!wpp) return;
  const wPx = Number((spr.userData as any).wPx ?? 60);
  const hPx = Number((spr.userData as any).hPx ?? 28);
  spr.scale.set(wpp * wPx, wpp * hPx, 1);
};

export const updateDimensionTextScale = (S: AppState, helpers: DimensionHelpers, rect: DOMRect) => {
  for (const d of S.dimensions) setSpriteScreenFixedScale(S, helpers, d.text as any, rect);
  const preview = helpers.getDimPreview();
  if (preview && preview.root.visible) setSpriteScreenFixedScale(S, helpers, preview.text as any, rect);
};

export const wallLineSegment = (S: AppState, helpers: DimensionHelpers, wallId: string, wallLine: AlignWallLine) => {
  const THREE = helpers.THREE;
  const w = S.walls.find((x: any) => x.id === wallId) ?? null;
  if (!w) return null as null | { a: any; b: any; dir: any };
  const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
  const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
  const just = w.params.justification ?? "center";
  const s = (w.params.exteriorSign ?? 1) as 1 | -1;
  const center = helpers.wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
  const d = center.b.clone().sub(center.a);
  if (d.lengthSq() < 1e-10) return null;
  d.normalize();
  const n = new THREE.Vector3(-d.z, 0, d.x);
  const half = Math.max(10, w.params.thicknessMm) / 2000;
  const exteriorA = center.a.clone().addScaledVector(n, s * half);
  const exteriorB = center.b.clone().addScaledVector(n, s * half);
  const interiorA = center.a.clone().addScaledVector(n, -s * half);
  const interiorB = center.b.clone().addScaledVector(n, -s * half);

  if (wallLine === "center") return { a: center.a, b: center.b, dir: d.clone() };
  if (wallLine === "exterior") return { a: exteriorA, b: exteriorB, dir: d.clone() };
  if (wallLine === "interior") return { a: interiorA, b: interiorB, dir: d.clone() };

  const endLen = Math.max(0.5, w.params.thicknessMm / 1000 + 0.25);
  if (wallLine === "endA")
    return {
      a: center.a.clone().addScaledVector(n, -endLen / 2),
      b: center.a.clone().addScaledVector(n, endLen / 2),
      dir: n.clone().normalize()
    };
  if (wallLine === "endB")
    return {
      a: center.b.clone().addScaledVector(n, -endLen / 2),
      b: center.b.clone().addScaledVector(n, endLen / 2),
      dir: n.clone().normalize()
    };
  return null;
};

export const dimValueMm = (S: AppState, helpers: DimensionHelpers, p: DimensionParams) => {
  const THREE = helpers.THREE;
  const la = wallLineSegment(S, helpers, p.a.wallId, p.a.wallLine);
  const lb = wallLineSegment(S, helpers, p.b.wallId, p.b.wallLine);
  if (!la || !lb) return null as null | { absMm: number; signedM: number; n: any; aPt: any; bPt: any };
  const aPt = la.a.clone().lerp(la.b, Math.max(0, Math.min(1, p.a.t)));
  const bPt = lb.a.clone().lerp(lb.b, Math.max(0, Math.min(1, p.b.t)));
  const dir = la.dir.clone().normalize();
  const n = new THREE.Vector3(-dir.z, 0, dir.x);
  const signedM = n.dot(bPt.clone().sub(aPt));
  return { absMm: Math.round(Math.abs(signedM) * 1000), signedM, n, aPt, bPt };
};

export const updateDimensionGeometry = (S: AppState, helpers: DimensionHelpers, d: DimensionInstance, rect: DOMRect | null = null) => {
  const THREE = helpers.THREE;
  const la = wallLineSegment(S, helpers, d.params.a.wallId, d.params.a.wallLine);
  const lb = wallLineSegment(S, helpers, d.params.b.wallId, d.params.b.wallLine);
  if (!la || !lb) {
    d.root.visible = false;
    return;
  }

  const aPt = la.a.clone().lerp(la.b, Math.max(0, Math.min(1, d.params.a.t)));
  const bPt = lb.a.clone().lerp(lb.b, Math.max(0, Math.min(1, d.params.b.t)));
  const dir = la.dir.clone().normalize();
  const n = new THREE.Vector3(-dir.z, 0, dir.x);

  const off = d.params.offsetM;
  const aDim = aPt.clone().addScaledVector(n, off);
  const bDim = bPt.clone().addScaledVector(n, off);

  const thick = rect ? helpers.hudLineThicknessM(rect) * 1.2 : 0.01;
  updateDimBar(S, helpers, d.ext1 as any, aPt, aDim, thick);
  updateDimBar(S, helpers, d.ext2 as any, bPt, bDim, thick);
  updateDimBar(S, helpers, d.dim as any, aDim, bDim, thick);

  const dimDir = bDim.clone().sub(aDim);
  const len = dimDir.length();
  const u = len > 1e-6 ? dimDir.clone().multiplyScalar(1 / len) : new THREE.Vector3(1, 0, 0);
  const tickDir = u.clone().add(n.clone().normalize()).normalize();
  const tickLen = rect ? Math.max(thick * 8, thick * 10) : 0.08;
  const t1a = aDim.clone().addScaledVector(tickDir, tickLen / 2);
  const t1b = aDim.clone().addScaledVector(tickDir, -tickLen / 2);
  const t2a = bDim.clone().addScaledVector(tickDir, tickLen / 2);
  const t2b = bDim.clone().addScaledVector(tickDir, -tickLen / 2);
  updateDimBar(S, helpers, d.tick1 as any, t1a, t1b, thick);
  updateDimBar(S, helpers, d.tick2 as any, t2a, t2b, thick);

  const mid = aDim.clone().add(bDim).multiplyScalar(0.5);
  (d.text as any).position.set(mid.x, 0.06, mid.z);
  const mm = Math.round(Math.abs(n.dot(bPt.clone().sub(aPt))) * 1000);
  updateSpriteText(S, helpers, d.text as any, `${mm}`);
  if (rect) setSpriteScreenFixedScale(S, helpers, d.text as any, rect);

  const angle = Math.atan2(bDim.z - aDim.z, bDim.x - aDim.x);
  const pickLen = Math.max(0.01, aDim.distanceTo(bDim));
  const pickThick = Math.max(0.05, rect ? thick * 10 : 0.08);
  (d.pick as any).geometry.dispose();
  (d.pick as any).geometry = new THREE.BoxGeometry(pickLen, 0.04, pickThick);
  (d.pick as any).position.set(mid.x, 0.05, mid.z);
  (d.pick as any).rotation.set(0, angle, 0);

  d.root.visible = helpers.getViewMode() === "2d";
};

export const updateAllDimensions = (S: AppState, helpers: DimensionHelpers, rect: DOMRect | null = null) => {
  for (const d of S.dimensions) updateDimensionGeometry(S, helpers, d, rect);
  if (rect) updateDimensionTextScale(S, helpers, rect);
  updateDimensionSelectionHighlights(S, helpers);
};

export const updateDimensionSelectionHighlights = (S: AppState, helpers: DimensionHelpers) => {
  const selectedKind = helpers.getSelectedKind();
  const selectedDimensionId = helpers.getSelectedDimensionId();
  for (const d of S.dimensions) {
    const sel = selectedKind === "dimension" && selectedDimensionId === d.id;
    const mat = sel ? helpers.dimMatSelected : helpers.dimMat;
    (d.ext1 as any).material = mat;
    (d.ext2 as any).material = mat;
    (d.dim as any).material = mat;
    (d.tick1 as any).material = mat;
    (d.tick2 as any).material = mat;
  }
};

export const createDimension = (S: AppState, helpers: DimensionHelpers, a: DimensionRef, b: DimensionRef, offsetM: number, opts?: { id?: string; skipHistory?: boolean }) => {
  const THREE = helpers.THREE;
  const id = opts?.id ?? `d${S.dimensionCounter++}`;
  const root = new THREE.Group();
  root.name = `dimension_${id}`;

  const ext1 = makeDimBarMesh(S, helpers, helpers.dimMat);
  const ext2 = makeDimBarMesh(S, helpers, helpers.dimMat);
  const dim = makeDimBarMesh(S, helpers, helpers.dimMat);
  const tick1 = makeDimBarMesh(S, helpers, helpers.dimMat);
  const tick2 = makeDimBarMesh(S, helpers, helpers.dimMat);
  const text = makeDimTextSprite(S, helpers, "0");

  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.08), helpers.dimPickMat);
  pick.userData.kind = "dimension";
  pick.userData.dimensionId = id;
  root.add(pick, ext1, ext2, dim, tick1, tick2, text);

  const inst: DimensionInstance = { id, params: { id, a, b, offsetM }, root, pick, ext1, ext2, dim, tick1, tick2, text };
  helpers.layoutRoot.add(root);
  S.dimensions.push(inst);
  updateDimensionGeometry(S, helpers, inst);
  if (!opts?.skipHistory) commitHistory(S);
  return inst;
};

export const disposeDimensionInstance = (S: AppState, helpers: DimensionHelpers, d: DimensionInstance) => {
  void S;
  void helpers;
  const meshes = [d.pick, d.ext1, d.ext2, d.dim, d.tick1, d.tick2];
  for (const m of meshes) {
    if ((m as any).geometry) (m as any).geometry.dispose();
  }
  const sm = (d.text as any).material as any;
  const tex = (sm.map as any) ?? null;
  if (tex) tex.dispose();
  sm.dispose();
};

export const deleteDimension = (S: AppState, helpers: DimensionHelpers, id: string, opts?: { skipHistory?: boolean }) => {
  const idx = S.dimensions.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const d = S.dimensions[idx];
  S.dimensions.splice(idx, 1);
  helpers.layoutRoot.remove(d.root);
  disposeDimensionInstance(S, helpers, d);
  if (helpers.getSelectedDimensionId() === id) helpers.setSelectedDimension(null);
  if (!opts?.skipHistory) commitHistory(S);
};
