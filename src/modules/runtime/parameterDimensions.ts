import * as THREE from "three";
import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";
import { fwmParameterDimensionAnchors } from "../fwmFurniture/parameterDimensions";
import { cabinetParameterDimensionAnchors } from "./cabinetParameterDimensions";

export type ParameterDimensionAnchor = {
  id: string;
  parameterKey: string;
  start: [number, number, number];
  end: [number, number, number];
  offsetDirection: [number, number, number];
  /** Explicit reference planes may include a context-owned worktop or a cut. */
  reference?: string;
  /** Owner-defined inverse for a dependent dimension (e.g. proportional drawer fronts). */
  toParameterValue?: (millimeters: number) => number;
};

export type ModuleParameterDimension = ParameterDimensionAnchor & {
  valueMm: number;
  parameterValue: number;
  toParameterValue: (millimeters: number) => number;
};

const axes = ["x", "y", "z"] as const;
const near = (a: number, b: number) => Math.abs(a - b) < 0.0006;
const units = { mm: 1, cm: 10, m: 1000 } as const;

function axisForParameter(key: string): typeof axes[number] | null {
  if (/height/i.test(key)) return "y";
  if (/width/i.test(key)) return "x";
  if (/depth/i.test(key)) return "z";
  return null;
}

/** Resolve real geometry; never infer that an arbitrary numeric parameter is a length. */
export function resolveModuleParameterDimensions(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters: Record<string, unknown>;
  root: THREE.Group;
}): ModuleParameterDimension[] {
  const { root, parameters, modulePackage } = args;
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const meshes: THREE.Mesh[] = [];
  root.traverseVisible((object) => {
    if (object instanceof THREE.Mesh && object.userData.isHelper !== true) meshes.push(object);
  });
  const localBounds = (mesh: THREE.Mesh) => {
    const box = new THREE.Box3();
    const points = mesh.geometry.getAttribute("position");
    if (!points) return box;
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    const point = new THREE.Vector3();
    for (let i = 0; i < points.count; i++) box.expandByPoint(point.fromBufferAttribute(points, i).applyMatrix4(matrix));
    return box;
  };
  const entries = meshes.map((mesh) => ({ mesh, box: localBounds(mesh) }));
  const body = new THREE.Box3();
  for (const { mesh, box } of entries) {
    const group = String(mesh.userData.materialGroup ?? mesh.userData.materialSlot ?? "");
    if (!/hardware|handle|hinge|runner|appliance/.test(group) && !/handle|hinge|clip|runner/i.test(mesh.name)) body.union(box);
  }
  const controls = new Set(modulePackage.ui.controls.map((control) => control.parameterKey));
  for (const parameter of modulePackage.parameters.parameters) if (parameter.uiVisibility === "user") controls.add(parameter.key);
  const result: ModuleParameterDimension[] = [];
  const authored = [
    ...((root.userData.parameterDimensions ?? []) as ParameterDimensionAnchor[]),
    ...fwmParameterDimensionAnchors(root, parameters),
    ...cabinetParameterDimensionAnchors(root, parameters)
  ];
  for (const parameter of modulePackage.parameters.parameters) {
    if (!controls.has(parameter.key) || parameter.uiVisibility === "technical" || parameter.uiVisibility === "internal") continue;
    if (parameter.type !== "number" || !parameter.unit || !(parameter.unit in units) || /angle|deg|count|price|power/i.test(parameter.key)) continue;
    const conversion = units[parameter.unit as keyof typeof units];
    const raw = parameters[parameter.key] ?? parameter.defaultValue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const value = raw * conversion / 1000;
    let anchors = authored.filter((anchor) => anchor.parameterKey === parameter.key);
    if (!anchors.length && value > 0) {
      const axis = axisForParameter(parameter.key);
      let candidates = entries.filter(({ mesh }) => Array.isArray(mesh.userData.paramKeys) && mesh.userData.paramKeys.includes(parameter.key));
      // Thickness references must belong to the physical part, not hardware carrying broad dependency tags.
      candidates = candidates.filter(({ mesh }) => !/hardware/.test(String(mesh.userData.materialGroup)) || /accessory|lighting/.test(String(parameters.type)));
      let resolved: ParameterDimensionAnchor | undefined;
      if (axis && ["width", "height", "depth", "widthMm", "heightMm", "depthMm"].includes(parameter.key) && !body.isEmpty() && near(body.max[axis] - body.min[axis], value)) {
        const start = body.min.clone(); const end = start.clone(); end[axis] = body.max[axis];
        resolved = { id: parameter.key, parameterKey: parameter.key, start: start.toArray(), end: end.toArray(), offsetDirection: axis === "y" ? [-1, 0, 0] : [0, -1, 0] };
      }
      if (!resolved) {
        for (const { mesh, box } of candidates) {
          if (box.isEmpty()) continue;
          const matchedAxis = axis ? (near(box.max[axis] - box.min[axis], value) ? axis : null)
            : /thickness|length|diameter/i.test(parameter.key) ? axes.find((a) => near(box.max[a] - box.min[a], value)) : null;
          if (!matchedAxis) continue;
          const start = box.min.clone(); const end = start.clone(); end[matchedAxis] = box.max[matchedAxis];
          resolved = { id: `${parameter.key}:${mesh.name}`, parameterKey: parameter.key, start: start.toArray(), end: end.toArray(), offsetDirection: matchedAxis === "y" ? [1, 0, 0] : [0, 1, 0] };
          break;
        }
      }
      if (resolved) anchors = [resolved];
    }
    for (const anchor of anchors) {
      const start = new THREE.Vector3(...anchor.start); const end = new THREE.Vector3(...anchor.end);
      const length = start.distanceTo(end);
      if (![...anchor.start, ...anchor.end, ...anchor.offsetDirection].every(Number.isFinite)) continue;
      // A zero value can be an intentional automatic/fill parameter, with an actual measured dimension.
      if (raw !== 0 && !anchor.toParameterValue && !near(length, value)) continue;
      result.push({ ...anchor, valueMm: length * 1000, parameterValue: raw, toParameterValue: anchor.toParameterValue ?? ((mm) => mm / conversion) });
    }
  }
  return result;
}
