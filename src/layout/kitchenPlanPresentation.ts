import * as THREE from "three";
import type { KitchenModulePlanEmphasis } from "./kitchenModuleRules";

export type KitchenPlanOutlineSnapshot = {
  color: THREE.Color;
  transparent: boolean;
  opacity: number;
  depthTest: boolean;
  depthWrite: boolean;
  colorWrite: boolean;
  materialVisible: boolean;
  renderOrder: number;
  outlineVisible: boolean;
  frustumCulled: boolean;
};

function getOutlineMaterial(outline: THREE.LineSegments): THREE.LineBasicMaterial {
  return outline.material as THREE.LineBasicMaterial;
}

export function captureKitchenPlanOutline(
  outline: THREE.LineSegments
): KitchenPlanOutlineSnapshot {
  const material = getOutlineMaterial(outline);
  return {
    color: material.color.clone(),
    transparent: material.transparent,
    opacity: material.opacity,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    colorWrite: material.colorWrite,
    materialVisible: material.visible,
    renderOrder: outline.renderOrder,
    outlineVisible: outline.visible,
    frustumCulled: outline.frustumCulled,
  };
}

export function applyKitchenPlanOutlineEmphasis(
  outline: THREE.LineSegments,
  emphasis: KitchenModulePlanEmphasis
) {
  const material = getOutlineMaterial(outline);
  outline.visible = true;
  outline.frustumCulled = false;
  outline.renderOrder = emphasis.renderOrder;
  material.color.setHex(emphasis.color);
  material.transparent = emphasis.opacity < 1;
  material.opacity = emphasis.opacity;
  material.depthTest = false;
  material.depthWrite = false;
  material.colorWrite = true;
  material.visible = true;
  material.needsUpdate = true;
}

export function restoreKitchenPlanOutline(
  outline: THREE.LineSegments,
  snapshot: KitchenPlanOutlineSnapshot
) {
  const material = getOutlineMaterial(outline);
  material.color.copy(snapshot.color);
  material.transparent = snapshot.transparent;
  material.opacity = snapshot.opacity;
  material.depthTest = snapshot.depthTest;
  material.depthWrite = snapshot.depthWrite;
  material.colorWrite = snapshot.colorWrite;
  material.visible = snapshot.materialVisible;
  material.needsUpdate = true;
  outline.renderOrder = snapshot.renderOrder;
  outline.visible = snapshot.outlineVisible;
  outline.frustumCulled = snapshot.frustumCulled;
}
