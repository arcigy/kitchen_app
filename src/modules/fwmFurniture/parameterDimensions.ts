import * as THREE from "three";
import type { ParameterDimensionAnchor } from "../runtime/parameterDimensions";
import { describeFwmModuleHeight } from "./heightPresentation";
import { resolveTallStackLayout } from "./tallStackLayout";
import type { FwmFurnitureParams } from "./types";

/** Named FWM construction references. No rendering or parameter formulas are changed. */
export function fwmParameterDimensionAnchors(root: THREE.Group, parameters: Record<string, unknown>): ParameterDimensionAnchor[] {
  if (!root.userData.fwmModuleType) return [];
  const anchors: ParameterDimensionAnchor[] = [];
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  root.traverseVisible((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
  const localBounds = (mesh: THREE.Mesh) => {
    const box = new THREE.Box3(); const point = new THREE.Vector3();
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
    return box;
  };
  const bounds = (name: string | RegExp) => {
    const match = meshes.find((mesh) => typeof name === "string"
      ? mesh.userData.boardName === name || mesh.name === name
      : name.test(String(mesh.userData.boardName ?? mesh.name)));
    return match ? localBounds(match) : null;
  };
  const add = (key: string, start: THREE.Vector3, end: THREE.Vector3, offset: [number, number, number], reference?: string) => {
    anchors.push({ id: `fwm:${key}`, parameterKey: key, start: start.toArray(), end: end.toArray(), offsetDirection: offset, reference });
  };
  const left = bounds(/(^|_)left_side$/) ?? bounds("left_side_panel");
  const right = bounds(/(^|_)right_side$/) ?? bounds("right_side_panel");
  const height = describeFwmModuleHeight(parameters);
  if (height && left && right) {
    const bottom = Math.min(left.min.y, right.min.y) - height.plinthHeightMm / 1000;
    const top = Math.max(left.max.y, right.max.y);
    const physicalHeight = top - bottom;
    // Baked corner sides sit between horizontal boards, so use the actual top/bottom panels.
    const base = bounds("bottom_panel"); const cap = bounds("top_panel");
    const floor = base ? base.min.y - height.plinthHeightMm / 1000 : bottom;
    const cabinetTop = cap ? cap.max.y : top;
    const referenceTop = cabinetTop + (Number(parameters.height) - height.cabinetHeightMm) / 1000;
    if (Number.isFinite(physicalHeight) && Math.abs((cabinetTop - floor) * 1000 - height.cabinetHeightMm) < 0.6) {
      add("height", new THREE.Vector3(left.min.x, floor, left.min.z), new THREE.Vector3(left.min.x, referenceTop, left.min.z), [-1, 0, 0], height.help);
    }
  }
  const plinthBoard = bounds(/(^|_)plinth_front_board$/);
  if (plinthBoard && right) {
    add("plinthSetbackMm", new THREE.Vector3(right.max.x, plinthBoard.max.y, plinthBoard.max.z),
      new THREE.Vector3(right.max.x, plinthBoard.max.y, right.max.z), [1, 0, 0]);
  }
  const fronts = meshes.filter((mesh) => /(^|_)drawer_front_\d+$/.test(mesh.name) && !mesh.name.startsWith("tower_"));
  if (fronts.length === Number(parameters.drawerCount) && fronts.length > 1) {
    const boxes = fronts.map(localBounds);
    const totalMm = boxes.reduce((sum, box) => sum + (box.max.y - box.min.y) * 1000, 0);
    fronts.forEach((mesh, index) => {
      const key = `drawer${mesh.name.match(/(\d+)$/)![1]}FrontHeightMm`;
      const box = boxes[index]!;
      const otherWeights = fronts.reduce((sum, other) => {
        const otherKey = `drawer${other.name.match(/(\d+)$/)![1]}FrontHeightMm`;
        return sum + (otherKey === key ? 0 : Number(parameters[otherKey]) || 0);
      }, 0);
      if (otherWeights <= 0) return;
      add(key, new THREE.Vector3(box.max.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z), [1, 0, 0]);
      anchors[anchors.length - 1]!.toParameterValue = (mm) => mm >= 40 && mm <= totalMm - (fronts.length - 1) * 40
        ? mm * otherWeights / (totalMm - mm) : NaN;
    });
  }
  const firstFront = bounds(/^(drawer_front_1|door_1)$/);
  if (firstFront && left && !parameters.opened) {
    add("sideGap", new THREE.Vector3(left.min.x, firstFront.min.y, firstFront.max.z), new THREE.Vector3(firstFront.min.x, firstFront.min.y, firstFront.max.z), [0, -1, 0]);
    add("frontGap", new THREE.Vector3(firstFront.min.x, left.min.y, firstFront.max.z), new THREE.Vector3(firstFront.min.x, firstFront.min.y, firstFront.max.z), [-1, 0, 0]);
  }
  const frontStraight = bounds("front_right_panel");
  const sideStraight = bounds("left_side_panel");
  if (root.userData.groundTruthPackageId === "base_corner_chamfered" && frontStraight && sideStraight) {
    // depth is the clean straight run; frontChamferMm is its additional Z coordinate segment.
    add("depth", new THREE.Vector3(frontStraight.min.x, frontStraight.max.y, frontStraight.min.z),
      new THREE.Vector3(frontStraight.max.x, frontStraight.max.y, frontStraight.min.z), [0, 1, 0]);
    add("frontChamferMm", new THREE.Vector3(sideStraight.min.x, sideStraight.max.y, sideStraight.max.z),
      new THREE.Vector3(sideStraight.min.x, sideStraight.max.y, frontStraight.min.z), [-1, 0, 0], "Front chamfer coordinate segment");
    const rear = bounds("back_left_panel");
    if (rear && right && Number(parameters.backChamferMm) >= 0) {
      add("backChamferMm", new THREE.Vector3(right.min.x, right.max.y, rear.min.z),
        new THREE.Vector3(right.min.x, right.max.y, right.min.z), [1, 0, 0], "Back chamfer coordinate segment");
    }
    const plinth = bounds("diagonal_plinth");
    if (plinth) {
      add("plinthHeight", new THREE.Vector3(plinth.min.x, plinth.min.y, plinth.max.z),
        new THREE.Vector3(plinth.min.x, plinth.max.y, plinth.max.z), [-1, 0, 0]);
    }
  }
  const tallParameters: unknown = root.userData.moduleRenderableBuildParameters;
  const layout = Array.isArray(root.userData.tallStackSlots) && tallParameters && typeof tallParameters === "object"
    ? resolveTallStackLayout(tallParameters as FwmFurnitureParams) : null;
  if (layout) for (const entry of layout.entries) {
    if (entry.type === "shelf" || entry.height <= 0 || !right) continue;
    add(`tallSlot${entry.index}HeightMm`, new THREE.Vector3(right.max.x, entry.bottomY / 1000, right.max.z),
      new THREE.Vector3(right.max.x, (entry.bottomY + entry.height) / 1000, right.max.z), [1, 0, 0]);
    const offset = Number(parameters[`tallSlot${entry.index}OffsetMm`]);
    if (Number.isFinite(offset) && offset !== 0) {
      add(`tallSlot${entry.index}OffsetMm`, new THREE.Vector3(right.max.x, (entry.bottomY - offset) / 1000, right.min.z),
        new THREE.Vector3(right.max.x, entry.bottomY / 1000, right.min.z), [1, 0, 0]);
      anchors[anchors.length - 1]!.toParameterValue = (mm) => Math.sign(offset) * mm;
    }
  }
  return anchors;
}
