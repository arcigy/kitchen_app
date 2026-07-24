import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";

export type KitchenModuleRole = "base" | "upper" | "tall";
export type KitchenModuleContractRole = "low" | "top" | "tall";
export type KitchenModuleEditLayer = "base" | "upper";

export type KitchenModulePlanEmphasis = {
  active: boolean;
  color: number;
  opacity: number;
  renderOrder: number;
};

export function getKitchenModuleRole(params: Record<string, unknown> | null | undefined): KitchenModuleRole {
  const rawRole = typeof params?.kitchenModuleRole === "string" ? params.kitchenModuleRole.trim().toLowerCase() : "low";
  if (rawRole === "upper" || rawRole === "wall" || rawRole === "top") return "upper";
  if (rawRole === "tall") return "tall";
  return "base";
}

export function getKitchenModuleContractRole(params: Record<string, unknown> | null | undefined): KitchenModuleContractRole {
  const role = getKitchenModuleRole(params);
  if (role === "upper") return "top";
  if (role === "tall") return "tall";
  return "low";
}

export function isKitchenModuleInEditLayer(
  params: Record<string, unknown> | null | undefined,
  layer: KitchenModuleEditLayer
) {
  return getKitchenModuleRole(params) === layer;
}

export function isKitchenModuleSelectableInEditLayer(
  params: Record<string, unknown> | null | undefined,
  layer: KitchenModuleEditLayer
) {
  const role = getKitchenModuleRole(params);
  return role === "tall" || role === layer;
}

export function resolveKitchenModulePlanEmphasis(
  params: Record<string, unknown> | null | undefined,
  layer: KitchenModuleEditLayer
): KitchenModulePlanEmphasis {
  const active = isKitchenModuleInEditLayer(params, layer);
  return active
    ? { active: true, color: 0x111111, opacity: 1, renderOrder: 60 }
    : { active: false, color: 0xb7bdc7, opacity: 1, renderOrder: 54 };
}

function isTruthyCornerShape(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().toLowerCase() !== "none";
}

export function isKitchenCornerModule(
  params: Record<string, unknown> | null | undefined,
  modulePackage?: FurnQuoteModulePackage | null
): boolean {
  if (modulePackage?.placement.requiresCorner === true || modulePackage?.placement.corner?.required === true) return true;
  if (modulePackage?.placement.allowedContexts?.includes("kitchen_corner")) return true;
  if (params?.isCorner === true || params?.requiresCorner === true) return true;
  if (isTruthyCornerShape(params?.cornerShape)) return true;
  return params?.type === "corner_shelf_lower" || params?.type === "fwm_catalog_base_corner";
}

export function usesKitchenWorktopBinding(params: Record<string, unknown> | null | undefined): boolean {
  return getKitchenModuleRole(params) === "base" && params?.requiresWorktop !== false && Number(params?.worktopThicknessMm ?? 0) > 0;
}

export function staysOutsideKitchenWorktopFootprint(params: Record<string, unknown> | null | undefined): boolean {
  return getKitchenModuleRole(params) === "tall";
}
