export type ArcigyModuleIconTarget = {
  id: string;
  moduleType: string;
  modulePackageId?: string;
  presetId?: string;
  outputPath: string;
  cameraAzimuthDeg?: number;
  parameters: Record<string, string | number | boolean>;
};

export const ARCIGY_MODULE_ICON_STYLE = Object.freeze({
  outputSizePx: 640,
  edgeWidthPx: 12,
  edgeThresholdAngleDeg: 28,
  backgroundAlpha: 0,
  edgeColor: "#17191c",
  cameraAzimuthDeg: 45,
  cameraElevationDeg: 32,
  cameraFovDeg: 24,
  framePadding: 1.18
});

export const ARCIGY_MODULE_ICON_RELEASE_ROOT = "public/module-icons/furniture/v4";

const typeIconTarget = (moduleType: string, parameters: ArcigyModuleIconTarget["parameters"] = {}): ArcigyModuleIconTarget => ({
  id: `type-${moduleType}`,
  moduleType,
  outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/types/${moduleType}.png`,
  parameters
});

const presetIconTarget = (presetId: string): ArcigyModuleIconTarget => ({
  id: `preset-${presetId}`,
  moduleType: "fwm_catalog_base_drawers",
  presetId,
  outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/presets/fwm_catalog_base_drawers__${presetId}.png`,
  parameters: { opened: false }
});

const baseCornerParameters = {
  width: 900,
  depth: 900,
  height: 722,
  heightCarcass: 722,
  hasWorktop: false,
  requiresWorktop: false,
  worktopThicknessMm: 0,
  hasPlinth: true,
  plinthHeight: 100,
  shelfCount: 2,
  opened: false
} as const;

const wallCornerParameters = {
  width: 600,
  depth: 330,
  height: 450,
  hasWorktop: false,
  requiresWorktop: false,
  hasPlinth: false,
  plinthHeight: 0,
  shelfCount: 2,
  opened: false,
  isCorner: true,
  frontFaceCount: 0,
  backFaceCount: 2
} as const;

export const ARCIGY_MODULE_ICON_TARGETS: readonly ArcigyModuleIconTarget[] = Object.freeze([
  typeIconTarget("base_bottle_pullout"),
  typeIconTarget("fwm_catalog_base_corner"),
  typeIconTarget("fwm_catalog_base_doors"),
  typeIconTarget("fwm_catalog_base_drawers"),
  typeIconTarget("fwm_catalog_base_open_end"),
  typeIconTarget("fwm_catalog_tall_cabinet"),
  typeIconTarget("fwm_tall_open_end"),
  typeIconTarget("fwm_catalog_wall_cabinet"),
  typeIconTarget("fwm_catalog_wall_open_end"),
  presetIconTarget("drawers_1_full_height"),
  presetIconTarget("drawers_2_equal"),
  presetIconTarget("drawers_2_top_shallow"),
  presetIconTarget("drawers_3_equal"),
  presetIconTarget("drawers_3_top_shallow"),
  presetIconTarget("drawers_3_top_shallow_two_high"),
  presetIconTarget("drawers_4_three_shallow_one_high"),
  presetIconTarget("drawers_5_equal"),
  {
    id: "base-corner-90",
    moduleType: "fwm_catalog_base_corner",
    outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/variants/fwm_catalog_base_corner__corner_90.png`,
    parameters: {
      ...baseCornerParameters,
      variant: "corner_90",
      cornerShape: "l_shape"
    }
  },
  {
    id: "base-corner-chamfered",
    moduleType: "fwm_catalog_base_corner",
    outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/variants/fwm_catalog_base_corner__corner_chamfered.png`,
    cameraAzimuthDeg: -45,
    parameters: {
      ...baseCornerParameters,
      variant: "corner_chamfered",
      cornerShape: "chamfered",
      chamferMm: 420,
      frontChamferMm: 420,
      frontChamferReferenceMm: 420,
      backChamferMm: 200
    }
  },
  {
    id: "wall-corner-90",
    moduleType: "fwm_catalog_wall_cabinet",
    outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/variants/fwm_catalog_wall_cabinet__corner_90.png`,
    parameters: {
      ...wallCornerParameters,
      variant: "corner_90",
      cornerShape: "l_shape"
    }
  },
  {
    id: "wall-corner-chamfered",
    moduleType: "fwm_catalog_wall_cabinet",
    outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/variants/fwm_catalog_wall_cabinet__corner_chamfered.png`,
    cameraAzimuthDeg: -45,
    parameters: {
      ...wallCornerParameters,
      variant: "corner_chamfered",
      cornerShape: "chamfered",
      frontChamferMm: 270,
      backChamferMm: 0,
      doorCount: 1
    }
  },
  {
    id: "wall-corner-open-chamfered",
    moduleType: "fwm_catalog_wall_cabinet",
    outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/variants/fwm_catalog_wall_cabinet__corner_open_chamfered.png`,
    cameraAzimuthDeg: -30,
    parameters: {
      ...wallCornerParameters,
      variant: "corner_open_chamfered",
      cornerShape: "chamfered",
      frontChamferMm: 270,
      backChamferMm: 0,
      doorCount: 0
    }
  },
  {
    id: "wall-corner-90-package",
    moduleType: "wall_corner_90",
    modulePackageId: "wall_corner_90",
    outputPath: `${ARCIGY_MODULE_ICON_RELEASE_ROOT}/variants/wall_corner_90.png`,
    parameters: {
      ...wallCornerParameters,
      depth: 320,
      height: 720,
      variant: "corner_90",
      cornerShape: "l_shape"
    }
  }
]);

export function resolveArcigyModuleIconTargets(ids: readonly string[] = []) {
  if (ids.length === 0) return [...ARCIGY_MODULE_ICON_TARGETS];
  const requested = new Set(ids);
  const resolved = ARCIGY_MODULE_ICON_TARGETS.filter((target) => requested.has(target.id));
  const missing = ids.filter((id) => !resolved.some((target) => target.id === id));
  if (missing.length > 0) throw new Error(`Unknown Arcigy module icon target(s): ${missing.join(", ")}`);
  return resolved;
}
