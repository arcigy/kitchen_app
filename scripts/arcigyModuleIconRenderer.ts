import { createArcigyModulePreviewRenderer } from "../src/modules/runtime/arcigyModulePreviewRenderer";
import { getSystemSeedCatalog } from "../src/core/catalog/catalog-repository";
import {
  applyModuleParameterPreset,
  buildModulePackageGeometryFromPackage,
  createDefaultModulePackageParameters
} from "../src/core/module-package/runtime/module-runtime-adapter";
import { extendedFurnitureModulePackages } from "../src/system/module-packages/extendedFurniture";
import {
  resolveArcigyModuleIconTargets,
  type ArcigyModuleIconTarget
} from "../src/modules/fwmFurniture/moduleIconRenderContract";

type RenderedIcon = { id: string; outputPath: string; dataUrl: string; hasTransparentBackground: boolean };

declare global {
  interface Window {
    renderArcigyModuleIcons: (ids?: string[]) => Promise<RenderedIcon[]>;
    arcigyModuleIconRendererReady: boolean;
  }
}

function findPackage(target: ArcigyModuleIconTarget) {
  const modulePackage = extendedFurnitureModulePackages.find((candidate) =>
    target.modulePackageId
      ? candidate.module.modulePackageId === target.modulePackageId
      : candidate.module.moduleType === target.moduleType
  );
  if (!modulePackage) throw new Error(`Module package not found for icon target ${target.id}`);
  return modulePackage;
}

function buildTarget(target: ArcigyModuleIconTarget) {
  const modulePackage = findPackage(target);
  const baseParameters = {
    ...createDefaultModulePackageParameters(modulePackage),
    ...target.parameters
  };
  const parameters = target.presetId
    ? applyModuleParameterPreset({ modulePackage, parameters: baseParameters, presetId: target.presetId })
    : baseParameters;
  return buildModulePackageGeometryFromPackage({
    modulePackage,
    parameters,
    catalog: getSystemSeedCatalog()
  });
}

window.renderArcigyModuleIcons = async (ids: string[] = []) => {
  const results: RenderedIcon[] = [];
  const renderer = createArcigyModulePreviewRenderer();
  try {
    for (const target of resolveArcigyModuleIconTargets(ids)) results.push({ id: target.id, outputPath: target.outputPath, ...renderer.render(buildTarget(target), target) });
  } finally { renderer.dispose(); }
  return results;
};
window.arcigyModuleIconRendererReady = true;
