import * as THREE from "three";
import type { LayoutInstance } from "./localTypes";
import { getModulePlanPolygon } from "./planSnap";
import type { PointerModuleDragState } from "./pointerModuleDrag";

export function createModuleDragVisuals(args: {
  parent: THREE.Object3D;
  getViewMode: () => "2d" | "3d";
  getModuleLocalBackCenter: (instance: LayoutInstance) => THREE.Vector3;
}) {
  let original: THREE.LineSegments | null = null;
  let moving: THREE.BoxHelper | null = null;
  let snap: THREE.Line | null = null;
  const clear = () => {
    for (const visual of [original, moving, snap]) {
      if (!visual) continue;
      visual.removeFromParent();
      visual.geometry.dispose();
      const materials = Array.isArray(visual.material) ? visual.material : [visual.material];
      materials.forEach(material => material.dispose());
    }
    original = moving = snap = null;
  };
  const sync = (state: PointerModuleDragState, instance: LayoutInstance) => {
    const gesture = state.gesture;
    if (!gesture) { clear(); return; }
    if (!state.active) return;
    if (!original) {
      const currentPosition = instance.root.position.clone();
      const currentRotation = instance.root.rotation.y;
      instance.root.position.copy(gesture.original.position);
      instance.root.rotation.y = gesture.original.rotationY;
      instance.root.updateMatrixWorld(true);
      const polygon = getModulePlanPolygon(instance, args.getModuleLocalBackCenter);
      const bounds = new THREE.Box3().setFromObject(instance.module);
      const minY = args.getViewMode() === "2d" ? 0.018 : bounds.min.y;
      const maxY = bounds.max.y;
      const points: THREE.Vector3[] = [];
      polygon.forEach((point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        points.push(point.clone().setY(minY), next.clone().setY(minY));
        if (args.getViewMode() === "3d") points.push(
          point.clone().setY(maxY), next.clone().setY(maxY), point.clone().setY(minY), point.clone().setY(maxY),
        );
      });
      instance.root.position.copy(currentPosition);
      instance.root.rotation.y = currentRotation;
      instance.root.updateMatrixWorld(true);
      original = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineDashedMaterial({ color: 0x77869b, dashSize: 0.04, gapSize: 0.025, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
      original.computeLineDistances();
      moving = new THREE.BoxHelper(instance.module, 0x1769cf);
      moving.material.depthTest = false;
      moving.material.depthWrite = false;
      snap = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0b9960, depthTest: false, depthWrite: false }));
      for (const visual of [original, moving, snap]) {
        visual.raycast = () => {};
        visual.renderOrder = 90;
        visual.userData.transientEditorVisual = true;
        args.parent.add(visual);
      }
    }
    moving?.update();
    moving?.material.color.set(gesture.valid ? 0x1769cf : 0xd32f2f);
    if (snap) {
      snap.visible = gesture.valid && !!gesture.snap;
      if (gesture.snap) snap.geometry.setFromPoints([gesture.snap.lineStart, gesture.snap.lineEnd]);
    }
  };
  return { sync, clear };
}
