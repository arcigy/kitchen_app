const FWM_MODULE_PREVIEW_ROOT = "/module-icons/furniture/v2";
// Variant assets are immutable for one year in production. Bump the release
// directory whenever their pixels change so browsers cannot keep an old icon.
const FWM_MODULE_VARIANT_PREVIEW_ROOT = "/module-icons/furniture/v3/variants";

const FWM_MODULE_PREVIEW_IMAGE_BY_TYPE: Readonly<Record<string, string>> = {
  base_bottle_pullout: `${FWM_MODULE_PREVIEW_ROOT}/base_bottle_pullout.png`,
  fwm_catalog_base_corner: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_corner.png`,
  fwm_catalog_base_doors: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_doors.png`,
  fwm_catalog_base_drawers: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_drawers.png`,
  fwm_catalog_base_open_end: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_base_open_end.png`,
  fwm_catalog_tall_cabinet: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_tall_cabinet.png`,
  fwm_tall_open_end: `${FWM_MODULE_PREVIEW_ROOT}/fwm_tall_open_end.png`,
  fwm_catalog_wall_cabinet: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_wall_cabinet.png`,
  fwm_catalog_wall_open_end: `${FWM_MODULE_PREVIEW_ROOT}/fwm_catalog_wall_open_end.png`,
  wall_corner_90: `${FWM_MODULE_VARIANT_PREVIEW_ROOT}/wall_corner_90.png`
};

const FWM_MODULE_PREVIEW_IMAGE_BY_VARIANT: Readonly<Record<string, string>> = {
  "fwm_catalog_base_corner:corner_90": `${FWM_MODULE_VARIANT_PREVIEW_ROOT}/fwm_catalog_base_corner__corner_90.png`,
  "fwm_catalog_base_corner:corner_chamfered": `${FWM_MODULE_VARIANT_PREVIEW_ROOT}/fwm_catalog_base_corner__corner_chamfered.png`,
  "fwm_catalog_wall_cabinet:corner_90": `${FWM_MODULE_VARIANT_PREVIEW_ROOT}/fwm_catalog_wall_cabinet__corner_90.png`,
  "fwm_catalog_wall_cabinet:corner_chamfered": `${FWM_MODULE_VARIANT_PREVIEW_ROOT}/fwm_catalog_wall_cabinet__corner_chamfered.png`,
  "fwm_catalog_wall_cabinet:corner_open_chamfered": `${FWM_MODULE_VARIANT_PREVIEW_ROOT}/fwm_catalog_wall_cabinet__corner_open_chamfered.png`
};

function normalizePreviewVariant(value: unknown): string {
  const variant = typeof value === "string" ? value.trim() : "";
  if (variant === "corner_90_1p") return "corner_90";
  if (variant === "corner_chamfered_1p") return "corner_chamfered";
  return variant;
}

export function getFwmModulePreviewImage(moduleType: string): string | undefined {
  return FWM_MODULE_PREVIEW_IMAGE_BY_TYPE[moduleType];
}

export function resolveFwmModulePreviewImage(args: {
  moduleType: string;
  modulePackageId?: string;
  variant?: unknown;
}): string | undefined {
  if (args.modulePackageId === "wall_corner_90" || args.moduleType === "wall_corner_90") {
    return FWM_MODULE_PREVIEW_IMAGE_BY_TYPE.wall_corner_90;
  }
  const variant = normalizePreviewVariant(args.variant);
  const variantPreview = variant
    ? FWM_MODULE_PREVIEW_IMAGE_BY_VARIANT[`${args.moduleType}:${variant}`]
    : undefined;
  return variantPreview ?? getFwmModulePreviewImage(args.moduleType);
}
