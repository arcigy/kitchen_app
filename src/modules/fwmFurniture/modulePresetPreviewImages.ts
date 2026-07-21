const FWM_MODULE_PRESET_PREVIEW_ROOT = "/module-icons/furniture/v4/presets";

const FWM_MODULE_PRESET_IDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  fwm_catalog_base_drawers: [
    "drawers_1_full_height",
    "drawers_2_equal",
    "drawers_2_top_shallow",
    "drawers_3_equal",
    "drawers_3_top_shallow",
    "drawers_3_top_shallow_two_high",
    "drawers_4_three_shallow_one_high",
    "drawers_5_equal"
  ]
};

export function resolveFwmModulePresetPreviewImage(moduleType: string, presetId: string): string | undefined {
  const knownPresetIds = FWM_MODULE_PRESET_IDS_BY_TYPE[moduleType];
  if (!knownPresetIds?.includes(presetId)) return undefined;
  return `${FWM_MODULE_PRESET_PREVIEW_ROOT}/${moduleType}__${presetId}.png`;
}
