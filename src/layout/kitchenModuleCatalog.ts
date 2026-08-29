import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { getPackageDefaultValue } from "../core/module-package/module-package-catalog";

export type KitchenCatalogRole = "low" | "top" | "tall" | "accessory";

export type KitchenCatalogSubcategoryKey =
  | "corner"
  | "appliance"
  | "drawer"
  | "sink"
  | "shelf"
  | "island"
  | "cover_panel"
  | "other";

function packageTags(modulePackage: FurnQuoteModulePackage) {
  return new Set(
    (modulePackage.module.tags ?? []).map((tag) => tag.toLowerCase()),
  );
}

export function isKitchenAccessoryPackage(
  modulePackage: FurnQuoteModulePackage,
): boolean {
  const tags = packageTags(modulePackage);
  const type = modulePackage.module.moduleType.toLowerCase();
  return (
    tags.has("accessory") ||
    tags.has("cover-panel") ||
    tags.has("cladding") ||
    type.includes("cladding") ||
    type.includes("cover")
  );
}

export function getKitchenCatalogRole(
  modulePackage: FurnQuoteModulePackage,
): KitchenCatalogRole {
  if (isKitchenAccessoryPackage(modulePackage)) return "accessory";
  const defaultRole = getPackageDefaultValue(
    modulePackage,
    "kitchenModuleRole",
  );
  const rawRole =
    typeof defaultRole === "string" ? defaultRole.trim().toLowerCase() : "";
  if (rawRole === "tall" || modulePackage.module.category === "tall_cabinet")
    return "tall";
  if (
    rawRole === "top" ||
    rawRole === "upper" ||
    rawRole === "wall" ||
    modulePackage.module.category === "wall_cabinet"
  ) {
    return "top";
  }
  return "low";
}

export function getKitchenCatalogSubcategoryKey(
  modulePackage: FurnQuoteModulePackage,
): KitchenCatalogSubcategoryKey {
  const tags = packageTags(modulePackage);
  const type = modulePackage.module.moduleType.toLowerCase();
  const name = modulePackage.module.displayName.toLowerCase();
  if (isKitchenAccessoryPackage(modulePackage)) return "cover_panel";
  if (
    modulePackage.module.category === "corner_cabinet" ||
    tags.has("corner") ||
    type.includes("corner") ||
    name.includes("roh")
  )
    return "corner";
  if (
    tags.has("appliance") ||
    type.includes("dishwasher") ||
    type.includes("fridge") ||
    name.includes("chlad") ||
    name.includes("umyv")
  )
    return "appliance";
  if (
    tags.has("drawer") ||
    type.includes("drawer") ||
    name.includes("šuf") ||
    name.includes("zasuv")
  )
    return "drawer";
  if (tags.has("sink") || type.includes("sink") || name.includes("drez"))
    return "sink";
  if (tags.has("shelf") || name.includes("polic")) return "shelf";
  if (tags.has("island") || name.includes("ostrov")) return "island";
  return "other";
}

export function groupKitchenModulePackages(
  packages: readonly FurnQuoteModulePackage[],
  query: string,
) {
  const groups: Record<
    KitchenCatalogRole,
    Map<KitchenCatalogSubcategoryKey, FurnQuoteModulePackage[]>
  > = {
    low: new Map(),
    top: new Map(),
    tall: new Map(),
    accessory: new Map(),
  };
  const filtered: FurnQuoteModulePackage[] = [];
  const normalizedQuery = query.trim().toLowerCase();
  for (const modulePackage of packages) {
    const searchable =
      `${modulePackage.module.displayName} ${modulePackage.module.moduleType} ${(modulePackage.module.tags ?? []).join(" ")}`.toLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
    filtered.push(modulePackage);
    const role = getKitchenCatalogRole(modulePackage);
    const subcategory = getKitchenCatalogSubcategoryKey(modulePackage);
    const bucket = groups[role].get(subcategory) ?? [];
    bucket.push(modulePackage);
    groups[role].set(subcategory, bucket);
  }
  return { groups, packages: filtered };
}
