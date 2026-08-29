import * as THREE from "three";

export function isObjectVisibleThroughSelection(object: THREE.Object3D, selection: THREE.Object3D | null): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current === selection) return true;
    current = current.parent;
  }
  return false;
}

export function pickVisibleSelectionUserDataValue<T extends string>(
  hits: Array<{ object: THREE.Object3D }>,
  selection: THREE.Object3D | null,
  args: { kind: string; valueKey: string }
): T | null {
  for (const hit of hits) {
    const value = hit.object.userData[args.valueKey] as T | undefined;
    if (value && hit.object.userData.kind === args.kind && isObjectVisibleThroughSelection(hit.object, selection)) return value;
  }
  return null;
}
