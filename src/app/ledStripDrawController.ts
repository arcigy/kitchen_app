import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { LedStripGroup, LedStripPointMm } from "../layout/ledStripTypes";

type LedDrawState = { active: boolean; groupId: string | null; points: LedStripPointMm[]; preview: THREE.Line | null };

export type LedStripDrawControllerContext = {
  S: AppState;
  layoutRoot: THREE.Object3D;
  commitHistory: () => void;
  mountProps: () => void;
  setStatus: (message: string) => void;
};

const toMm = (point: THREE.Vector3): LedStripPointMm => ({ x: Math.round(point.x * 1000), y: Math.round(point.y * 1000), z: Math.round(point.z * 1000) });

export function createLedStripDrawController(ctx: LedStripDrawControllerContext) {
  const root = new THREE.Group();
  root.name = "ledStripRoot";
  ctx.layoutRoot.add(root);
  const state: LedDrawState = { active: false, groupId: null, points: [], preview: null };

  const disposePreview = () => {
    if (!state.preview) return;
    root.remove(state.preview);
    state.preview.geometry.dispose();
    (state.preview.material as THREE.Material).dispose();
    state.preview = null;
  };
  const refresh = () => {
    root.clear();
    for (const group of ctx.S.ledStripGroups) for (const run of group.runs) {
      const geometry = new THREE.BufferGeometry().setFromPoints(run.points.map((point) => new THREE.Vector3(point.x / 1000, point.y / 1000, point.z / 1000)));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffc107 }));
      line.name = `ledStrip:${group.id}:${run.id}`;
      line.userData = { kind: "ledStrip", ledStripGroupId: group.id, ledStripRunId: run.id };
      root.add(line);
    }
    if (state.preview) root.add(state.preview);
  };
  const updatePreview = (point: THREE.Vector3) => {
    if (!state.active || state.points.length === 0) return;
    disposePreview();
    const geometry = new THREE.BufferGeometry().setFromPoints([...state.points, toMm(point)].map((item) => new THREE.Vector3(item.x / 1000, item.y / 1000, item.z / 1000)));
    state.preview = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: 0xffc107, dashSize: 0.06, gapSize: 0.03 }));
    state.preview.computeLineDistances();
    root.add(state.preview);
  };
  const startCustom = () => {
    disposePreview();
    state.active = true; state.groupId = null; state.points = [];
    ctx.setStatus("LED pásik: klikni počiatočný bod. Esc ukončí kreslenie.");
    ctx.mountProps();
  };
  const point = (world: THREE.Vector3) => {
    if (!state.active) return false;
    const next = toMm(world);
    if (state.points.length && Math.hypot(next.x - state.points.at(-1)!.x, next.y - state.points.at(-1)!.y, next.z - state.points.at(-1)!.z) < 1) return false;
    state.points.push(next);
    if (!state.groupId) {
      if (state.points.length === 1) { ctx.setStatus("LED pásik: klikni ďalší bod."); return true; }
      const id = `led${ctx.S.ledStripCounter++}`;
      const group: LedStripGroup = { id, params: { name: `LED pásik ${ctx.S.ledStripGroups.length + 1}`, mode: "custom", heightMm: next.y, offsetMm: 0, lightingComponentId: null, profileWidthMm: null }, runs: [{ id: `${id}-run1`, points: structuredClone(state.points) }] };
      ctx.S.ledStripGroups.push(group); state.groupId = id;
    } else {
      const group = ctx.S.ledStripGroups.find((item) => item.id === state.groupId)!;
      group.runs[0]!.points = structuredClone(state.points);
    }
    ctx.commitHistory(); refresh();
    ctx.setStatus("LED pásik: ďalší bod, alebo Esc pre ukončenie skupiny.");
    return true;
  };
  const escape = () => {
    const hadGroup = !!state.groupId;
    state.active = false; state.groupId = null; state.points = []; disposePreview();
    if (hadGroup) ctx.setStatus("LED pásik: skupina dokončená. Vyber nový režim pre ďalší pásik.");
    else ctx.setStatus("LED pásik: kreslenie zrušené.");
    ctx.mountProps();
    return hadGroup;
  };
  return { root, state, startCustom, point, updatePreview, escape, refresh, disposePreview };
}
