import type { VendorModuleIntent, VendorProductTemplate, VendorProductVariant } from "./catalog-types";
import { getFwmRuntimeBuilderKey } from "../../modules/fwmFurniture/definitions";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasAnyText(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function hasAnyRegex(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function builderHints(
  variant: VendorProductVariant,
  featureTags: string[],
  requiresCorner: boolean,
  options: { hasDrawers: boolean; hasDoors: boolean; isHob: boolean; isOpenShelfBase: boolean; isCoverPanel: boolean; isCornerCoverPanel: boolean }
): string[] {
  if (variant.productTemplateId.startsWith("pino_side_cabinet_")) return ["pinoSideCabinet.v1"];
  if (options.isCornerCoverPanel) return [getFwmRuntimeBuilderKey("fwm_interior_cladding_2")];
  if (options.isCoverPanel) return [getFwmRuntimeBuilderKey("fwm_interior_cladding_1")];
  if (options.isOpenShelfBase) return [getFwmRuntimeBuilderKey("fwm_kitchen_special_module_3")];
  if (requiresCorner) return ["cornerShelfLower.v1"];

  const hints: string[] = [];
  if (options.isHob) {
    hints.push(getFwmRuntimeBuilderKey("fwm_kitchen_special_module_2"));
  }
  if (options.hasDrawers && options.hasDoors) {
    hints.push(getFwmRuntimeBuilderKey("fwm_kitchen_special_module_1"));
  }
  if (featureTags.includes("drawer_stack") || featureTags.includes("internal_drawers")) {
    hints.push("drawerLow.v1");
  }
  if (featureTags.includes("door_shelf")) {
    hints.push("swingShelvesLow.v1");
  }
  if (featureTags.includes("flap_front")) {
    hints.push("flapShelvesLow.v1");
  }
  return unique(hints);
}

export function inferVendorModuleIntent(variant: VendorProductVariant): VendorModuleIntent {
  const text = normalizeText(
    [
      variant.mainGroup,
      variant.subGroup,
      variant.productTemplateName,
      variant.nameRaw,
      ...(variant.rulesRaw ?? []),
      ...(variant.notes ?? [])
    ].join(" | ")
  );
  const articleFamily = (variant.articleFamily ?? "").trim().toUpperCase();
  const isSideCabinet = variant.productTemplateId.startsWith("pino_side_cabinet_");
  const isCoverPanel =
    /^(UPF|UPK|UPT|UPEF)$/.test(articleFamily) ||
    hasAnyRegex(text, [
      /^(?:[^|;,.]*\|)?[^|;,.]*\bkryci\b[^|;,.]*\blista\b/,
      /\bnapojeni steny\b/,
      /\blicujici s korpusem\b/
    ]);
  const isCornerCoverPanel = isCoverPanel && (hasAnyText(text, ["rohova", "rohove", "reseni 90"]) || /^UPEF/.test(articleFamily));
  const isOpenShelfBase = hasAnyRegex(text, [
    /\bpolice spodni skrinky\b/,
    /\bkoncova police\b/,
    /\bregal na lahve\b/
  ]) || /^(UR|URA|VUR)$/.test(articleFamily);
  const isCorner = !isCoverPanel && (hasAnyText(text, ["rohov", "corner"]) || /^(UE|UES|UED|UPE)/.test(articleFamily));
  const isApplianceTall = isSideCabinet && /^GB/.test(articleFamily);
  const isHob = hasAnyText(text, ["varna", "varnou", "cooktop", "hob"]) || /^UK/.test(articleFamily);
  const isWaste = hasAnyText(text, ["triedenie odpadu", "odpad", "waste", "m4", "wh"]);
  const hasDrawers = (!isOpenShelfBase && hasAnyRegex(text, [
    /\bzasuvka\b/,
    /\bzasuvky\b/,
    /\bzasuvek\b/,
    /\bvysuv\b/,
    /\bvysuvy\b/
  ])) || /^(UA|AA|U2A|U3SA|U5S|VU5S|UK2A|UKB2A|UKB2SA|UKB4S|UKS2A|SA|VUS2A)$/.test(articleFamily);
  const hasInternalDrawers = hasAnyText(text, ["vnitrni zasuv", "vnitri zasuv", "vnutrni zasuv", "internal"]) || (variant.variantCode ?? "").toUpperCase().includes("IS");
  const hasDoors = !isOpenShelfBase && hasAnyRegex(text, [
    /\bdvirka\b/,
    /\bdvirek\b/,
    /\bdvere\b/,
    /\botocna\b/,
    /\botocne\b/,
    /\bsklapeci\b/,
    /\bsklapece\b/,
    /\bsklapecich\b/,
    /\bvyklop/
  ]);
  const hasFlap = hasAnyRegex(text, [/\bsklapeci\b/, /\bsklapece\b/, /\bsklapecich\b/, /\bvyklop/]);
  const hasGlass = hasAnyText(text, ["sklen", "vitr"]);
  const reducedDepthCapable = hasAnyText(text, ["zmenseni hloubky", "zkracenou hloubkou", "hloubka korpusu 326"]) || /^V(U|UR|US|U5S)/.test(articleFamily);
  const requiresWallAttachment =
    isCoverPanel ||
    hasAnyText(text, ["pripevnena ke stene", "pripevnen ke stene", "must be attached to wall"]);

  const featureTags = unique([
    hasDrawers ? "drawer_stack" : "",
    hasInternalDrawers ? "internal_drawers" : "",
    hasDoors ? "door_shelf" : "",
    hasFlap ? "flap_front" : "",
    hasGlass ? "glass_front" : "",
    isHob ? "hob_zone" : "",
    isWaste ? "waste_sorting" : "",
    isOpenShelfBase ? "open_shelf_base" : "",
    isCoverPanel ? "cover_panel" : "",
    isCornerCoverPanel ? "corner_cover_panel" : "",
    hasAnyText(text, ["regal na lahve"]) ? "bottle_rack" : "",
    reducedDepthCapable ? "reduced_depth_capable" : "",
    requiresWallAttachment ? "wall_attachment" : ""
  ]);

  if (isSideCabinet) {
    return {
      moduleClass: isApplianceTall ? "appliance_tall" : "tall",
      kitchenModuleRole: "tall",
      placementZone: isApplianceTall ? "tall_appliance" : "tall",
      requiresWorktop: false,
      requiresCorner: false,
      requiresApplianceOpening: isApplianceTall,
      requiresWallAttachment: true,
      builderKeyCandidates: ["pinoSideCabinet.v1"],
      featureTags: unique([
        ...featureTags,
        "side_cabinet",
        isApplianceTall ? "appliance_housing" : "tall_storage"
      ]),
      notes: unique([
        isApplianceTall ? "Requires appliance-compatible tall niche placement." : "Tall side cabinet placed outside the worktop run.",
        hasInternalDrawers ? "Contains internal drawer logic." : ""
      ])
    };
  }

  if (isCoverPanel) {
    return {
      moduleClass: "accessory",
      kitchenModuleRole: "accessory",
      placementZone: "accessory",
      requiresWorktop: false,
      requiresCorner: false,
      requiresApplianceOpening: false,
      requiresWallAttachment: true,
      builderKeyCandidates: builderHints(variant, featureTags, false, { hasDrawers, hasDoors, isHob, isOpenShelfBase, isCoverPanel, isCornerCoverPanel }),
      featureTags,
      notes: unique([
        isCornerCoverPanel ? "Accessory corner filler / cover panel around lower cabinet runs." : "Accessory filler / cover panel mounted against wall or cabinet side.",
        hasAnyText(text, ["material cela"]) ? "Use front-facing finish family when available." : "",
        hasAnyText(text, ["material korpusu"]) ? "Use carcass-finish family when available." : ""
      ])
    };
  }

  return {
    moduleClass: isOpenShelfBase ? "base" : isCorner ? "corner_base" : "base",
    kitchenModuleRole: "base",
    placementZone: isCorner ? "corner_low" : "low",
    requiresWorktop: true,
    requiresCorner: isCorner,
    requiresApplianceOpening: false,
    requiresWallAttachment,
    builderKeyCandidates: builderHints(variant, featureTags, isCorner, { hasDrawers, hasDoors, isHob, isOpenShelfBase, isCoverPanel, isCornerCoverPanel }),
    featureTags,
    notes: unique([
      isOpenShelfBase ? "Place as an open lower/base storage element under the worktop." : isCorner ? "Place only into a kitchen corner." : "Place as a lower/base module under the worktop.",
      isHob ? "Reserve this module for hob/cooktop positions." : "",
      isWaste ? "Reserve this module for waste sorting / utility use." : "",
      reducedDepthCapable ? "Catalog notes mention reduced-depth or shallow-body handling." : "",
      requiresWallAttachment ? "Catalog notes require wall attachment." : ""
    ])
  };
}

export function attachVendorModuleIntent(variant: VendorProductVariant): VendorProductVariant {
  return {
    ...variant,
    moduleIntent: inferVendorModuleIntent(variant)
  };
}

export function summarizeVendorTemplateIntent(
  template: VendorProductTemplate,
  variants: VendorProductVariant[]
): VendorProductTemplate {
  const related = variants.filter((variant) => variant.productTemplateId === template.productTemplateId);
  if (related.length === 0) return { ...template };
  const intents = related.map((variant) => variant.moduleIntent ?? inferVendorModuleIntent(variant));
  return {
    ...template,
    moduleIntent: {
      moduleClass: intents.every((item) => item.moduleClass === intents[0]!.moduleClass) ? intents[0]!.moduleClass : "unknown",
      kitchenModuleRole: intents.every((item) => item.kitchenModuleRole === intents[0]!.kitchenModuleRole) ? intents[0]!.kitchenModuleRole : "unknown",
      placementZone: intents.every((item) => item.placementZone === intents[0]!.placementZone) ? intents[0]!.placementZone : "unknown",
      requiresWorktop: intents.some((item) => item.requiresWorktop),
      requiresCorner: intents.some((item) => item.requiresCorner),
      requiresApplianceOpening: intents.some((item) => item.requiresApplianceOpening),
      requiresWallAttachment: intents.some((item) => item.requiresWallAttachment),
      builderKeyCandidates: unique(intents.flatMap((item) => item.builderKeyCandidates)),
      featureTags: unique(intents.flatMap((item) => item.featureTags)),
      notes: unique(intents.flatMap((item) => item.notes))
    }
  };
}
