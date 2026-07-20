const FWM_MODULE_PREVIEW_ROOT = "/module-icons/furniture";

const FWM_MODULE_PREVIEW_IMAGE_BY_TYPE: Readonly<Record<string, string>> = {
  base_bottle_pullout: `${FWM_MODULE_PREVIEW_ROOT}/base_bottle_pullout.png`,
  fwm_catalog_base_corner: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_corner.png`,
  fwm_catalog_base_doors: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_doors.png`,
  fwm_catalog_base_drawers: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_drawers.png`,
  fwm_catalog_base_open_end: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_open_end.png`,
  fwm_catalog_tall_cabinet: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_tall_cabinet.png`,
  fwm_tall_open_end: `${FWM_MODULE_PREVIEW_ROOT}/fwm_tall_open_end.png`,
  fwm_catalog_wall_cabinet: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_wall_cabinet.png`,
  fwm_catalog_wall_open_end: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_wall_open_end.png`
};

export function getFwmModulePreviewImage(moduleType: string): string | undefined {
  return FWM_MODULE_PREVIEW_IMAGE_BY_TYPE[moduleType];
}
