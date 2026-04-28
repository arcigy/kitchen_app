import parameterCatalog from "./package/definitions/drawer_low.parameter-catalog.json";
import materialsSnapshot from "./package/definitions/drawer_low.materials.snapshot.json";
import systemParameterCatalog from "./package/definitions/system-parameters.schema.json";
import systemParameterValues from "./package/definitions/drawer_low.system-parameters.json";
import { normalizeDrawerLowParams, type DrawerLowParams } from "./types";
import {
  createPortableModuleControls,
  type PortableModuleControlsApi,
  type PortableModuleControlsArgs
} from "../runtime/portableControls";

export function createDrawerLowControls(
  container: HTMLElement,
  params: DrawerLowParams,
  args: PortableModuleControlsArgs
): PortableModuleControlsApi {
  return createPortableModuleControls({
    container,
    params: params as Record<string, unknown>,
    catalog: parameterCatalog as Parameters<typeof createPortableModuleControls>[0]["catalog"],
    controlArgs: args,
    paramChangeHook: (currentParams, key) => {
      Object.assign(currentParams, normalizeDrawerLowParams(currentParams as DrawerLowParams, { sourceKey: key }));
    },
    materialsSnapshot: materialsSnapshot as unknown as Parameters<typeof createPortableModuleControls>[0]["materialsSnapshot"],
    systemCatalog: systemParameterCatalog as Parameters<typeof createPortableModuleControls>[0]["systemCatalog"],
    systemValues: systemParameterValues as Parameters<typeof createPortableModuleControls>[0]["systemValues"]
  });
}
