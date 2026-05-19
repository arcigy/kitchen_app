import type { ModuleParams } from "../model/cabinetTypes";
import { normalizeModuleParams } from "../model/cabinetTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { getModuleDescriptorOrThrow } from "../modules/registry";

export function buildModule(p: ModuleParams, catalog: ClientCatalog) {
  p = normalizeModuleParams(p);
  const root = getModuleDescriptorOrThrow(p.type).build(p, catalog);

  root.traverse((obj) => {
    const mesh = obj as any;
    if (!mesh || !mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return root;
}
