import parameterCatalog from "./package/definitions/swing_shelves_low.parameter-catalog.json";
import materialsSnapshot from "./package/definitions/swing_shelves_low.materials.snapshot.json";
import systemParameterCatalog from "./package/definitions/system-parameters.schema.json";
import systemParameterValues from "./package/definitions/swing_shelves_low.system-parameters.json";
import { normalizeSwingShelvesLowParams, type SwingShelvesLowParams } from "./types";
import {
  createPortableModuleControls,
  type PortableModuleControlsApi,
  type PortableModuleControlsArgs
} from "../runtime/portableControls";

export function createSwingShelvesLowControls(
  container: HTMLElement,
  params: SwingShelvesLowParams,
  args: PortableModuleControlsArgs
): PortableModuleControlsApi {
  return createPortableModuleControls({
    container,
    params: params as Record<string, unknown>,
    catalog: parameterCatalog as Parameters<typeof createPortableModuleControls>[0]["catalog"],
    controlArgs: args,
    paramChangeHook: (currentParams) => {
      Object.assign(currentParams, normalizeSwingShelvesLowParams(currentParams as SwingShelvesLowParams));
    },
    materialsSnapshot: materialsSnapshot as unknown as Parameters<typeof createPortableModuleControls>[0]["materialsSnapshot"],
    systemCatalog: systemParameterCatalog as Parameters<typeof createPortableModuleControls>[0]["systemCatalog"],
    systemValues: systemParameterValues as Parameters<typeof createPortableModuleControls>[0]["systemValues"]
  });
}
