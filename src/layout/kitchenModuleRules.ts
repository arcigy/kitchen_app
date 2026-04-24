export type KitchenModuleRole = "base" | "upper" | "tall";

export function getKitchenModuleRole(params: Record<string, unknown> | null | undefined): KitchenModuleRole {
  const rawRole = typeof params?.kitchenModuleRole === "string" ? params.kitchenModuleRole.trim().toLowerCase() : "base";
  if (rawRole === "upper" || rawRole === "wall") return "upper";
  if (rawRole === "tall") return "tall";
  return "base";
}

export function usesKitchenWorktopBinding(params: Record<string, unknown> | null | undefined): boolean {
  return getKitchenModuleRole(params) === "base" && params?.requiresWorktop !== false;
}

export function staysOutsideKitchenWorktopFootprint(params: Record<string, unknown> | null | undefined): boolean {
  return getKitchenModuleRole(params) === "tall";
}
