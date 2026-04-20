import type { ModuleParams } from "../model/cabinetTypes";
import { normalizeModuleParams } from "../model/cabinetTypes";
import { getModuleDescriptorOrThrow } from "../modules/registry";

export function buildModule(p: ModuleParams) {
  p = normalizeModuleParams(p);
  const root = getModuleDescriptorOrThrow(p.type).build(p);

  root.traverse((obj) => {
    const mesh = obj as any;
    if (!mesh || !mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return root;
}
