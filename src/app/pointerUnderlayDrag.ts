import * as THREE from "three";

export type PointerUnderlayDragState = {
  active: boolean;
  pointerId: number | null;
  startOffsetMm: { x: number; z: number };
  startWorld: THREE.Vector3;
};

export function beginUnderlayDragPointerDown(args: {
  button: number;
  cancelPendingMarquee: () => void;
  getGroundHitPoint: () => THREE.Vector3 | null;
  hasUnderlayHit: () => boolean;
  isEligible: boolean;
  pointerId: number;
  setPointerCapture: (pointerId: number) => void;
  setSelectedUnderlay: () => void;
  setUnderlayStatus: (status: string) => void;
  underlayDragState: PointerUnderlayDragState;
  underlayOffsetMm: { x: number; z: number };
}) {
  if (!args.isEligible || args.button !== 0 || !args.hasUnderlayHit()) return false;

  args.cancelPendingMarquee();
  args.setSelectedUnderlay();
  const groundHitPoint = args.getGroundHitPoint();
  if (!groundHitPoint) return true;

  args.underlayDragState.active = true;
  args.underlayDragState.pointerId = args.pointerId;
  args.underlayDragState.startWorld.copy(groundHitPoint);
  args.underlayDragState.startOffsetMm = { x: args.underlayOffsetMm.x, z: args.underlayOffsetMm.z };
  args.setPointerCapture(args.pointerId);
  args.setUnderlayStatus("Drag underlay... (Pin when ready)");
  return true;
}

export function updateUnderlayDragPointerMove(args: {
  hitPoint: THREE.Vector3 | null;
  pointerId: number;
  selectedUnderlayBox: { update: () => void } | null;
  setOffsetInputs: (x: string, z: string) => void;
  underlayDragState: PointerUnderlayDragState;
  underlayOffsetMm: { x: number; z: number };
  updateUnderlayTransform: () => void;
}) {
  if (!args.underlayDragState.active || args.underlayDragState.pointerId !== args.pointerId) return false;
  if (!args.hitPoint) return true;

  const dxMm = Math.round((args.hitPoint.x - args.underlayDragState.startWorld.x) * 1000);
  const dzMm = Math.round((args.hitPoint.z - args.underlayDragState.startWorld.z) * 1000);
  args.underlayOffsetMm.x = args.underlayDragState.startOffsetMm.x + dxMm;
  args.underlayOffsetMm.z = args.underlayDragState.startOffsetMm.z + dzMm;
  args.updateUnderlayTransform();
  args.setOffsetInputs(String(args.underlayOffsetMm.x), String(args.underlayOffsetMm.z));
  args.selectedUnderlayBox?.update();
  return true;
}

export function finishUnderlayDragPointerUp(args: {
  commitHistory: () => void;
  pointerId: number;
  releasePointerCapture: (pointerId: number) => void;
  setUnderlayStatus: (status: string) => void;
  underlayDragState: PointerUnderlayDragState;
}) {
  if (!args.underlayDragState.active || args.underlayDragState.pointerId !== args.pointerId) return false;

  args.underlayDragState.active = false;
  args.underlayDragState.pointerId = null;
  args.setUnderlayStatus("Underlay moved.");
  args.commitHistory();
  args.releasePointerCapture(args.pointerId);
  return true;
}
