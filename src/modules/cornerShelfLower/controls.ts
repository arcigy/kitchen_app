import parameterCatalog from "./package/definitions/corner_shelf_lower.parameter-catalog.json";
import materialsSnapshot from "./package/definitions/corner_shelf_lower.materials.snapshot.json";
import systemParameterCatalog from "./package/definitions/system-parameters.schema.json";
import systemParameterValues from "./package/definitions/corner_shelf_lower.system-parameters.json";
import { normalizeCornerShelfLowerParams, type CornerShelfLowerParams } from "./types";
import {
  createPortableModuleControls,
  type PortableModuleControlsApi,
  type PortableModuleControlsArgs
} from "../runtime/portableControls";

export function createCornerShelfLowerControls(
  container: HTMLElement,
  params: CornerShelfLowerParams,
  args: PortableModuleControlsArgs
): PortableModuleControlsApi {
  return createPortableModuleControls({
    container,
    params: params as Record<string, unknown>,
    catalog: parameterCatalog as Parameters<typeof createPortableModuleControls>[0]["catalog"],
    controlArgs: args,
    paramChangeHook: (currentParams, key) => {
      Object.assign(
        currentParams,
        normalizeCornerShelfLowerParams(currentParams as CornerShelfLowerParams, { sourceKey: key })
      );
    },
    materialsSnapshot: materialsSnapshot as Parameters<typeof createPortableModuleControls>[0]["materialsSnapshot"],
    systemCatalog: systemParameterCatalog as Parameters<typeof createPortableModuleControls>[0]["systemCatalog"],
    systemValues: systemParameterValues as Parameters<typeof createPortableModuleControls>[0]["systemValues"]
  });
}
