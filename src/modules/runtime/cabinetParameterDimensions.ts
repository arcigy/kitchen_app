import * as THREE from "three";
import type { ParameterDimensionAnchor } from "./parameterDimensions";

/** References in the original portable cabinet families, whose height includes the worktop. */
export function cabinetParameterDimensionAnchors(root: THREE.Group, parameters: Record<string, unknown>): ParameterDimensionAnchor[] {
  if (!["drawer_low", "swing_shelves_low", "corner_shelf_lower", "flap_shelves_low", "fridge_tall"].includes(String(parameters.type))) return [];
  const result: ParameterDimensionAnchor[] = [];
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const bounds = (name: string) => {
    const mesh = root.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh)) return null;
    const box = new THREE.Box3(); const point = new THREE.Vector3();
    const position = mesh.geometry.getAttribute("position");
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
    return box;
  };
  const add = (key: string, start: THREE.Vector3, end: THREE.Vector3, offset: [number, number, number] = [-1, 0, 0]) => {
    result.push({ id: `cabinet:${key}`, parameterKey: key, start: start.toArray(), end: end.toArray(), offsetDirection: offset });
  };
  const side = bounds("leftSide") ?? bounds("side_end_x");
  if (side) {
    const floor = side.min.y - Number(parameters.plinthHeight ?? 0) / 1000;
    const start = new THREE.Vector3(side.min.x, floor, side.min.z);
    const top = new THREE.Vector3(side.min.x, side.max.y, side.min.z);
    add("heightCarcass", start.clone(), top.clone());
    add("height", start, top.clone().add(new THREE.Vector3(0, Number(parameters.worktopThicknessMm ?? 0) / 1000, 0)));
    add("worktopThicknessMm", top, top.clone().add(new THREE.Vector3(0, Number(parameters.worktopThicknessMm ?? 0) / 1000, 0)), [1, 0, 0]);
    const kick = bounds("kick") ?? bounds("kick_x");
    if (kick) add("plinthSetbackMm", new THREE.Vector3(side.min.x, kick.max.y, kick.max.z), new THREE.Vector3(side.min.x, kick.max.y, side.max.z), [0, -1, 0]);
  }
  if (parameters.type === "corner_shelf_lower") {
    const corner = root.getObjectByName("__kitchen_corner_anchor");
    const x = root.getObjectByName("__kitchen_corner_x_anchor");
    const z = root.getObjectByName("__kitchen_corner_z_anchor");
    const local = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    if (corner && x && z) { add("lengthX", local(corner), local(x), [0, -1, 0]); add("lengthZ", local(corner), local(z), [0, -1, 0]); }
    if (side) add("depth", side.min.clone(), new THREE.Vector3(side.min.x, side.min.y, side.max.z), [0, -1, 0]);
    let lower = bounds("bottom_x");
    for (let index = 1; index <= Number(parameters.shelfCount ?? 0) + 1; index++) {
      const upper = bounds(`shelf_${index}_x`) ?? bounds("top_x_front");
      if (lower && upper) add(`shelfGap${index}Mm`, new THREE.Vector3(lower.max.x, lower.max.y, lower.max.z), new THREE.Vector3(lower.max.x, upper.min.y, lower.max.z), [1, 0, 0]);
      lower = upper;
    }
  }
  const front = bounds("front_1");
  if (front) add("frontThicknessMm", front.min.clone(), new THREE.Vector3(front.min.x, front.min.y, front.max.z), [0, -1, 0]);
  return result;
}
