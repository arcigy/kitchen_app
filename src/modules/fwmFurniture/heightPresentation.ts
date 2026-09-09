import { t } from "../../i18n";
import { FWM_FURNITURE_SPEC_BY_TYPE } from "./definitions";
import { normalizeFwmFurnitureParams } from "./types";

export type ModuleHeightPresentation = {
  label: string;
  help: string;
  summary: string;
  cabinetHeightMm: number;
  plinthHeightMm: number;
};

/** Describe the existing FWM geometry contract without changing any stored dimensions. */
export function describeFwmModuleHeight(parameters: Record<string, unknown>, bottomElevationMm?: number): ModuleHeightPresentation | null {
  const type = String(parameters.type ?? parameters.moduleType ?? "");
  const spec = FWM_FURNITURE_SPEC_BY_TYPE.get(type);
  if (!spec?.kitchenRole || !["base", "corner", "sink", "appliance", "island", "open_end", "tall", "wall"].includes(spec.geometryKind)) return null;
  const params = normalizeFwmFurnitureParams({ ...parameters, type });
  const externalHeight = Number(params.heightCarcass);
  // Same input selection as geometry.ts / paramsForExternalKitchenWorktop.
  const usesExternalHeight = params.requiresWorktop !== false && Number(params.worktopThicknessMm) > 0 && Number.isFinite(externalHeight) && externalHeight > 0;
  const cabinetHeightMm = usesExternalHeight ? externalHeight : Number(params.height);
  const plinthHeightMm = Number(params.plinthHeight);
  const mm = (value: number) => `${Math.round(value)} mm`;
  if (spec.kitchenRole === "top") {
    const elevation = Number.isFinite(bottomElevationMm)
      ? ` ${t("Bottom edge above floor")}: ${mm(bottomElevationMm!)}. ${t("Top edge above floor")}: ${mm(bottomElevationMm! + cabinetHeightMm)}.`
      : ` ${t("The bottom edge above floor is set separately in the kitchen.")}`;
    return {
      label: t("Upper cabinet height"),
      help: t("Cabinet size from bottom to top. Mounting height is a separate value."),
      summary: `${t("Cabinet height")}: ${mm(cabinetHeightMm)}.${elevation}`,
      cabinetHeightMm, plinthHeightMm
    };
  }
  const includesWorktop = usesExternalHeight && Math.abs(Number(params.height) - cabinetHeightMm) > 0.5;
  return {
    label: includesWorktop ? t("Height including worktop") : t("Cabinet height including plinth"),
    help: includesWorktop
      ? t("Height reaches the worktop surface. The breakdown shows the cabinet and plinth separately.")
      : t("Full cabinet height from floor, including plinth and excluding worktop."),
    summary: `${t("Cabinet including plinth, excluding worktop")}: ${mm(cabinetHeightMm)}. ${t("Carcass")}: ${mm(cabinetHeightMm - plinthHeightMm)} + ${t("Plinth")}: ${mm(plinthHeightMm)}.${includesWorktop ? ` ${t("Worktop")}: ${mm(Number(params.height) - cabinetHeightMm)}. ${t("Complete height")}: ${mm(Number(params.height))}.` : ""}`,
    cabinetHeightMm, plinthHeightMm
  };
}
