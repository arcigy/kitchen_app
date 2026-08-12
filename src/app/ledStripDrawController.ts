import * as THREE from "three";
import type { AppState } from "../layout/appState";
import { validateLedStripGroup, type LedStripGroup, type LedStripPointMm } from "../layout/ledStripTypes";
import { deleteLedStripSegment, moveLedStripPoint, moveLedStripSegment } from "../layout/ledStripEditing";

type LedPointerEdit = { pointerId: number; pick: LedStripPick; anchor: LedStripPointMm; origin: LedStripPointMm; changed: boolean };
type LedDrawState = { active: boolean; groupId: string | null; selectedGroupId: string | null; selectedPick: LedStripPick | null; points: LedStripPointMm[]; preview: THREE.Line | null; pointerEdit: LedPointerEdit | null };

export type LedStripDrawControllerContext = {
  S: AppState;
  layoutRoot: THREE.Object3D;
  commitHistory: () => void;
  mountProps: () => void;
  setStatus: (message: string) => void;
};

export type LedStripPick = { groupId: string; runId: string; pointIndex: number | null; segmentIndex: number | null };

const toMm = (point: THREE.Vector3): LedStripPointMm => ({ x: Math.round(point.x * 1000), y: Math.round(point.y * 1000), z: Math.round(point.z * 1000) });

export function createLedStripDrawController(ctx: LedStripDrawControllerContext) {
  const root = new THREE.Group();
  root.name = "ledStripRoot";
  ctx.layoutRoot.add(root);
  const state: LedDrawState = { active: false, groupId: null, selectedGroupId: null, selectedPick: null, points: [], preview: null, pointerEdit: null };

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
      const vertices = new THREE.BufferGeometry().setFromPoints(run.points.map((point) => new THREE.Vector3(point.x / 1000, point.y / 1000, point.z / 1000)));
      const handles = new THREE.Points(vertices, new THREE.PointsMaterial({ color: 0xffc107, size: 0.025, sizeAttenuation: false }));
      handles.name = `ledStripPoints:${group.id}:${run.id}`;
      handles.userData = { kind: "ledStripPoint", ledStripGroupId: group.id, ledStripRunId: run.id };
      root.add(handles);
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
    state.active = true; state.groupId = null; state.selectedGroupId = null; state.selectedPick = null; state.points = [];
    ctx.setStatus("LED pásik: klikni počiatočný bod. Esc ukončí kreslenie.");
    ctx.mountProps();
  };
  const point = (world: THREE.Vector3) => {
    if (!state.active) return false;
    const next = toMm(world);
    if (state.points.length && Math.hypot(next.x - state.points.at(-1)!.x, next.y - state.points.at(-1)!.y, next.z - state.points.at(-1)!.z) < 1) return false;
    state.points.push(next);
    if (!state.groupId) {
      if (state.points.length === 1) {
        ctx.setStatus("LED pásik: klikni ďalší bod, alebo v Properties zadaj vertikálny smer a dĺžku.");
        ctx.mountProps();
        return true;
      }
      const id = `led${ctx.S.ledStripCounter++}`;
      const group: LedStripGroup = { id, params: { name: `LED pásik ${ctx.S.ledStripGroups.length + 1}`, mode: "custom", heightMm: next.y, offsetMm: 0, lightingComponentId: null, profileWidthMm: null }, runs: [{ id: `${id}-run1`, points: structuredClone(state.points) }] };
      ctx.S.ledStripGroups.push(group); state.groupId = id; state.selectedGroupId = id;
    } else {
      const group = ctx.S.ledStripGroups.find((item) => item.id === state.groupId)!;
      group.runs[0]!.points = structuredClone(state.points);
    }
    ctx.commitHistory(); refresh();
    ctx.setStatus("LED pásik: ďalší bod, alebo Esc pre ukončenie skupiny.");
    return true;
  };
  const escape = () => {
    const completedGroupId = state.groupId;
    const hadGroup = !!completedGroupId;
    state.active = false; state.groupId = null; state.selectedGroupId = completedGroupId; state.selectedPick = null; state.points = []; disposePreview();
    if (hadGroup) ctx.setStatus("LED pásik: skupina dokončená. Vyber nový režim pre ďalší pásik.");
    else ctx.setStatus("LED pásik: kreslenie zrušené.");
    ctx.mountProps();
    return hadGroup;
  };
  const addVertical = (direction: "up" | "down", lengthMm: number) => {
    if (!state.active || state.points.length === 0 || !Number.isFinite(lengthMm) || lengthMm <= 0) return false;
    const last = state.points.at(-1)!;
    return point(new THREE.Vector3(last.x / 1000, (last.y + (direction === "up" ? lengthMm : -lengthMm)) / 1000, last.z / 1000));
  };
  const selectGroup = (groupId: string | null) => {
    state.selectedGroupId = groupId && ctx.S.ledStripGroups.some((group) => group.id === groupId) ? groupId : null;
    state.selectedPick = null;
    ctx.mountProps();
  };
  const selectPick = (picked: LedStripPick) => {
    state.selectedGroupId = picked.groupId;
    state.selectedPick = picked;
    ctx.mountProps();
  };
  const replaceGroup = (groupId: string, replacement: LedStripGroup) => {
    const index = ctx.S.ledStripGroups.findIndex((group) => group.id === groupId);
    if (index < 0) return false;
    try {
      validateLedStripGroup(replacement);
    } catch {
      return false;
    }
    ctx.S.ledStripGroups[index] = replacement;
    return true;
  };
  const beginPointerEdit = (pointerId: number, picked: LedStripPick, world: THREE.Vector3) => {
    const group = ctx.S.ledStripGroups.find((item) => item.id === picked.groupId);
    const run = group?.runs.find((item) => item.id === picked.runId);
    if (!group || !run) return false;
    const anchor = toMm(world);
    const origin = picked.pointIndex != null
      ? run.points[picked.pointIndex]
      : picked.segmentIndex != null
        ? run.points[picked.segmentIndex]
        : run.points[0];
    if (!origin) return false;
    state.pointerEdit = { pointerId, pick: picked, anchor, origin: { ...origin }, changed: false };
    return true;
  };
  const updatePointerEdit = (pointerId: number, world: THREE.Vector3) => {
    const edit = state.pointerEdit;
    if (!edit || edit.pointerId !== pointerId) return false;
    const group = ctx.S.ledStripGroups.find((item) => item.id === edit.pick.groupId);
    if (!group) return false;
    const current = toMm(world);
    const delta = { x: current.x - edit.anchor.x, y: current.y - edit.anchor.y, z: current.z - edit.anchor.z };
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) return false;
    const next = edit.pick.pointIndex != null
      ? moveLedStripPoint(group, { runId: edit.pick.runId, pointIndex: edit.pick.pointIndex }, { x: edit.origin.x + delta.x, y: edit.origin.y + delta.y, z: edit.origin.z + delta.z })
      : edit.pick.segmentIndex != null
        ? moveLedStripSegment(group, { runId: edit.pick.runId, segmentIndex: edit.pick.segmentIndex }, delta)
        : {
            ...structuredClone(group),
            runs: group.runs.map((run) => ({ ...run, points: run.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z })) }))
          };
    if (!replaceGroup(group.id, next)) return false;
    edit.changed = true;
    refresh();
    return true;
  };
  const finishPointerEdit = (pointerId: number) => {
    const edit = state.pointerEdit;
    if (!edit || edit.pointerId !== pointerId) return false;
    state.pointerEdit = null;
    if (edit.changed) {
      ctx.commitHistory();
      ctx.mountProps();
    }
    return true;
  };
  const moveSelectedTo = (target: LedStripPointMm) => {
    const picked = state.selectedPick;
    const group = picked ? ctx.S.ledStripGroups.find((item) => item.id === picked.groupId) : null;
    if (!picked || !group || ![target.x, target.y, target.z].every(Number.isFinite)) return false;
    const run = group.runs.find((item) => item.id === picked.runId);
    const source = picked.pointIndex != null
      ? run?.points[picked.pointIndex]
      : picked.segmentIndex != null
        ? run?.points[picked.segmentIndex]
        : run?.points[0];
    if (!source) return false;
    const delta = { x: target.x - source.x, y: target.y - source.y, z: target.z - source.z };
    const next = picked.pointIndex != null
      ? moveLedStripPoint(group, { runId: picked.runId, pointIndex: picked.pointIndex }, target)
      : picked.segmentIndex != null
        ? moveLedStripSegment(group, { runId: picked.runId, segmentIndex: picked.segmentIndex }, delta)
        : {
            ...structuredClone(group),
            runs: group.runs.map((candidate) => ({ ...candidate, points: candidate.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z })) }))
          };
    if (!replaceGroup(group.id, next)) return false;
    ctx.commitHistory();
    refresh();
    ctx.mountProps();
    return true;
  };
  const deleteSelection = () => {
    const groupId = state.selectedGroupId;
    if (!groupId) return false;
    const groupIndex = ctx.S.ledStripGroups.findIndex((group) => group.id === groupId);
    if (groupIndex < 0) return false;
    const selected = state.selectedPick;
    const group = ctx.S.ledStripGroups[groupIndex]!;
    // A vertex is movable/alignable but intentionally not a delete target.
    if (selected?.pointIndex != null) return false;
    if (!selected || selected.segmentIndex == null) {
      ctx.S.ledStripGroups.splice(groupIndex, 1);
    } else {
      const replacements = deleteLedStripSegment(group, { runId: selected.runId, segmentIndex: selected.segmentIndex });
      ctx.S.ledStripGroups.splice(groupIndex, 1, ...replacements);
    }
    state.selectedGroupId = null;
    state.selectedPick = null;
    ctx.commitHistory();
    refresh();
    ctx.mountProps();
    return true;
  };
  const pick = (raycaster: THREE.Raycaster): LedStripPick | null => {
    raycaster.params.Line = { ...raycaster.params.Line, threshold: 0.04 };
    raycaster.params.Points = { ...raycaster.params.Points, threshold: 0.045 };
    const hit = raycaster.intersectObjects(root.children, true).find((candidate) => {
      const object = candidate.object;
      return object.userData.kind === "ledStrip" || object.userData.kind === "ledStripPoint";
    });
    if (!hit) return null;
    const { ledStripGroupId: groupId, ledStripRunId: runId, kind } = hit.object.userData as { ledStripGroupId?: string; ledStripRunId?: string; kind?: string };
    if (!groupId || !runId) return null;
    return { groupId, runId, pointIndex: kind === "ledStripPoint" ? hit.index ?? null : null, segmentIndex: kind === "ledStrip" ? hit.index ?? null : null };
  };
  return { root, state, startCustom, point, addVertical, selectGroup, selectPick, beginPointerEdit, updatePointerEdit, finishPointerEdit, moveSelectedTo, deleteSelection, pick, updatePreview, escape, refresh, disposePreview };
}
