import parameterCatalog from "./package/definitions/drawer_low.parameter-catalog.json";
import systemParameterCatalog from "./package/definitions/system-parameters.schema.json";
import systemParameterValues from "./package/definitions/drawer_low.system-parameters.json";
import type { DrawerLowParams } from "./types";
import {
  computeAutoDrawerFrontHeights,
  getDrawerFrontHeightsContextKey,
  getDrawerFrontHeightsValueKey,
  isManualDrawerFrontPreset,
  resizeManualDrawerFrontHeights
} from "./frontHeights";
import {
  createPortableModuleControls,
  type PortableFieldOption,
  type PortableModuleControlsApi,
  type PortableModuleControlsArgs
} from "../runtime/portableControls";

const DRAWER_LOW_FIELD_OPTIONS: Record<string, PortableFieldOption[]> = {
  handleType: [
    { value: "none", label: "None" },
    { value: "bar", label: "Bar" },
    { value: "knob", label: "Knob" },
    { value: "cup", label: "Cup" },
    { value: "gola", label: "Gola" }
  ],
  frontStackPreset: [
    { value: "equal", label: "Equal" },
    { value: "top", label: "Top Fixed" },
    { value: "custom", label: "Custom" }
  ]
};

export function createDrawerLowControls(
  container: HTMLElement,
  params: DrawerLowParams,
  args: PortableModuleControlsArgs
): PortableModuleControlsApi {
  let lastFrontsContextKey = getDrawerFrontHeightsContextKey(params);
  let lastFrontHeightsKey = getDrawerFrontHeightsValueKey(params);

  const normalizeFrontHeights = () => {
    const currentContextKey = getDrawerFrontHeightsContextKey(params);
    const currentHeightsKey = getDrawerFrontHeightsValueKey(params);
    const manualPreset = isManualDrawerFrontPreset(params.frontStackPreset);

    if (manualPreset) {
      params.drawerFrontHeights = resizeManualDrawerFrontHeights(params);
    } else if (currentHeightsKey !== lastFrontHeightsKey && currentContextKey === lastFrontsContextKey) {
      params.frontStackPreset = "custom";
      params.drawerFrontHeights = resizeManualDrawerFrontHeights(params);
    } else {
      params.drawerFrontHeights = computeAutoDrawerFrontHeights(params);
    }

    lastFrontsContextKey = getDrawerFrontHeightsContextKey(params);
    lastFrontHeightsKey = getDrawerFrontHeightsValueKey(params);
  };

  normalizeFrontHeights();

  return createPortableModuleControls({
    container,
    params: params as Record<string, unknown>,
    catalog: parameterCatalog as Parameters<typeof createPortableModuleControls>[0]["catalog"],
    controlArgs: {
      ...args,
      onChange: () => {
        normalizeFrontHeights();
        return args.onChange();
      }
    },
    fieldOptions: DRAWER_LOW_FIELD_OPTIONS,
    systemCatalog: systemParameterCatalog as Parameters<typeof createPortableModuleControls>[0]["systemCatalog"],
    systemValues: systemParameterValues as Parameters<typeof createPortableModuleControls>[0]["systemValues"]
  });
}
