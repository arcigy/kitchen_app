import type { ClientCatalog, VendorCatalogIndex, VendorModuleIntent, VendorProductTemplate, VendorProductVariant } from "./catalog-types";

export type VendorCatalogGroupSummary = {
  groupId: string;
  label: string;
  moduleClass: VendorModuleIntent["moduleClass"];
  kitchenModuleRole: VendorModuleIntent["kitchenModuleRole"];
  placementZone: VendorModuleIntent["placementZone"];
  requiresWorktop: boolean;
  requiresCorner: boolean;
  requiresApplianceOpening: boolean;
  featureTags: string[];
  templateCount: number;
  variantCount: number;
  articleFamilies: string[];
  availableWidthsMm: number[];
  needsReviewCount: number;
};

export type VendorCatalogTemplateSummary = {
  groupId: string;
  productTemplateId: string;
  productTemplateName: string;
  articleFamilies: string[];
  availableWidthsMm: number[];
  variantCatalogKeys: string[];
  sourcePages: number[];
  mainGroup: string | null;
  subGroup: string | null;
  moduleClass: VendorModuleIntent["moduleClass"];
  kitchenModuleRole: VendorModuleIntent["kitchenModuleRole"];
  placementZone: VendorModuleIntent["placementZone"];
  requiresWorktop: boolean;
  requiresCorner: boolean;
  requiresApplianceOpening: boolean;
  featureTags: string[];
  confidence: number;
  needsReview: boolean;
  variantCount: number;
};

export type VendorCatalogGroupRequest = {
  includeNeedsReview?: boolean;
  placementZone?: VendorModuleIntent["placementZone"] | "any";
  kitchenModuleRole?: VendorModuleIntent["kitchenModuleRole"] | "any";
  moduleClass?: VendorModuleIntent["moduleClass"] | "any";
};

export type VendorCatalogTemplateRequest = VendorCatalogGroupRequest & {
  groupId?: string;
};

function uniqueSortedStrings(values: readonly string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedNumbers(values: readonly number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right);
}

function combineIntent(values: Array<VendorModuleIntent | undefined>): VendorModuleIntent {
  const intents = values.filter((value): value is VendorModuleIntent => !!value);
  const first = intents[0];
  return {
    moduleClass: first?.moduleClass ?? "unknown",
    kitchenModuleRole: first?.kitchenModuleRole ?? "unknown",
    placementZone: first?.placementZone ?? "unknown",
    requiresWorktop: intents.some((intent) => intent.requiresWorktop),
    requiresCorner: intents.some((intent) => intent.requiresCorner),
    requiresApplianceOpening: intents.some((intent) => intent.requiresApplianceOpening),
    requiresWallAttachment: intents.some((intent) => intent.requiresWallAttachment),
    builderKeyCandidates: uniqueSortedStrings(intents.flatMap((intent) => intent.builderKeyCandidates)),
    featureTags: uniqueSortedStrings(intents.flatMap((intent) => intent.featureTags)),
    notes: uniqueSortedStrings(intents.flatMap((intent) => intent.notes))
  };
}

function labelForIntent(intent: VendorModuleIntent): string {
  const tags = new Set(intent.featureTags);
  if (intent.placementZone === "tall_appliance" || intent.requiresApplianceOpening) return "Tall appliances";
  if (intent.placementZone === "tall" && tags.has("side_cabinet")) return "Side cabinets";
  if (intent.placementZone === "accessory" && tags.has("cover_panel")) return tags.has("corner_cover_panel") ? "Corner cover panels" : "Cover panels";
  if (intent.placementZone === "corner_low") return "Corner base cabinets";
  if (intent.placementZone === "low" && tags.has("hob_zone")) return "Hob base cabinets";
  if (intent.placementZone === "low" && tags.has("open_shelf_base")) return "Open shelf base cabinets";
  if (intent.placementZone === "low" && tags.has("drawer_stack") && tags.has("door_shelf")) return "Mixed base cabinets";
  if (intent.placementZone === "low" && tags.has("drawer_stack")) return "Drawer base cabinets";
  if (intent.placementZone === "low" && tags.has("door_shelf")) return "Shelf base cabinets";
  if (intent.placementZone === "low") return "Base cabinets";
  if (intent.placementZone === "accessory") return "Accessories";
  return "Other products";
}

function groupIdForIntent(intent: VendorModuleIntent): string {
  const label = labelForIntent(intent)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return label || "other_products";
}

function matchesFilters(
  intent: VendorModuleIntent,
  args: VendorCatalogGroupRequest
) {
  if ((args.placementZone ?? "any") !== "any" && intent.placementZone !== args.placementZone) return false;
  if ((args.kitchenModuleRole ?? "any") !== "any" && intent.kitchenModuleRole !== args.kitchenModuleRole) return false;
  if ((args.moduleClass ?? "any") !== "any" && intent.moduleClass !== args.moduleClass) return false;
  return true;
}

function templatesFromVariants(vendorCatalog: VendorCatalogIndex): VendorProductTemplate[] {
  if (vendorCatalog.productTemplates.length > 0) return vendorCatalog.productTemplates;
  const byId = new Map<string, VendorProductVariant[]>();
  for (const variant of vendorCatalog.productVariants) {
    const bucket = byId.get(variant.productTemplateId);
    if (bucket) bucket.push(variant);
    else byId.set(variant.productTemplateId, [variant]);
  }
  return [...byId.entries()].map(([productTemplateId, variants]) => {
    const intent = combineIntent(variants.map((variant) => variant.moduleIntent));
    return {
      itemType: "product_template",
      productTemplateId,
      sourcePdf: variants[0]?.sourcePdf ?? vendorCatalog.extractionMeta.sourcePdf,
      sourcePages: uniqueSortedNumbers(variants.map((variant) => variant.sourcePage)),
      mainGroup: variants[0]?.mainGroup ?? null,
      subGroup: variants[0]?.subGroup ?? null,
      productTemplateName: variants[0]?.productTemplateName ?? productTemplateId,
      nameNormalized: variants[0]?.nameNormalized,
      variantCatalogKeys: uniqueSortedStrings(variants.map((variant) => variant.catalogKey)),
      articleFamilies: uniqueSortedStrings(variants.map((variant) => variant.articleFamily)),
      availableWidthsMm: uniqueSortedNumbers(variants.map((variant) => variant.widthMm ?? (variant.widthCm != null ? variant.widthCm * 10 : NaN))),
      moduleIntent: intent,
      confidence: Math.max(...variants.map((variant) => variant.confidence)),
      needsReview: variants.some((variant) => variant.needsReview),
      reviewReasons: uniqueSortedStrings(variants.flatMap((variant) => variant.reviewReasons ?? []))
    };
  });
}

function templateSummaryFromTemplate(
  vendorCatalog: VendorCatalogIndex,
  template: VendorProductTemplate
): VendorCatalogTemplateSummary {
  const variants = vendorCatalog.productVariants.filter((variant) => variant.productTemplateId === template.productTemplateId);
  const intent = combineIntent([template.moduleIntent, ...variants.map((variant) => variant.moduleIntent)]);
  return {
    groupId: groupIdForIntent(intent),
    productTemplateId: template.productTemplateId,
    productTemplateName: template.productTemplateName,
    articleFamilies: uniqueSortedStrings(template.articleFamilies),
    availableWidthsMm: uniqueSortedNumbers([
      ...(template.availableWidthsMm ?? []),
      ...variants.map((variant) => variant.widthMm ?? (variant.widthCm != null ? variant.widthCm * 10 : NaN))
    ]),
    variantCatalogKeys: uniqueSortedStrings([
      ...template.variantCatalogKeys,
      ...variants.map((variant) => variant.catalogKey)
    ]),
    sourcePages: uniqueSortedNumbers([
      ...template.sourcePages,
      ...variants.map((variant) => variant.sourcePage)
    ]),
    mainGroup: template.mainGroup ?? null,
    subGroup: template.subGroup ?? null,
    moduleClass: intent.moduleClass,
    kitchenModuleRole: intent.kitchenModuleRole,
    placementZone: intent.placementZone,
    requiresWorktop: intent.requiresWorktop,
    requiresCorner: intent.requiresCorner,
    requiresApplianceOpening: intent.requiresApplianceOpening,
    featureTags: uniqueSortedStrings(intent.featureTags),
    confidence: template.confidence,
    needsReview: template.needsReview || variants.some((variant) => variant.needsReview),
    variantCount: variants.length
  };
}

export function listVendorCatalogTemplateSummaries(
  catalog: Pick<ClientCatalog, "vendorCatalog">,
  request: VendorCatalogTemplateRequest = {}
): VendorCatalogTemplateSummary[] {
  const vendorCatalog = catalog.vendorCatalog;
  if (!vendorCatalog) return [];
  const templates = templatesFromVariants(vendorCatalog);
  return templates
    .map((template) => templateSummaryFromTemplate(vendorCatalog, template))
    .filter((template) => matchesFilters({
      moduleClass: template.moduleClass,
      kitchenModuleRole: template.kitchenModuleRole,
      placementZone: template.placementZone,
      requiresWorktop: template.requiresWorktop,
      requiresCorner: template.requiresCorner,
      requiresApplianceOpening: template.requiresApplianceOpening,
      requiresWallAttachment: false,
      builderKeyCandidates: [],
      featureTags: template.featureTags,
      notes: []
    }, request))
    .filter((template) => (request.includeNeedsReview === true ? true : !template.needsReview))
    .filter((template) => !request.groupId || template.groupId === request.groupId)
    .sort((left, right) =>
      left.groupId.localeCompare(right.groupId) ||
      left.productTemplateName.localeCompare(right.productTemplateName) ||
      left.productTemplateId.localeCompare(right.productTemplateId)
    );
}

export function listVendorCatalogGroupSummaries(
  catalog: Pick<ClientCatalog, "vendorCatalog">,
  request: VendorCatalogGroupRequest = {}
): VendorCatalogGroupSummary[] {
  const templates = listVendorCatalogTemplateSummaries(catalog, request);
  const vendorCatalog = catalog.vendorCatalog;
  if (!vendorCatalog) return [];
  const byGroup = new Map<string, VendorCatalogTemplateSummary[]>();
  for (const template of templates) {
    const bucket = byGroup.get(template.groupId);
    if (bucket) bucket.push(template);
    else byGroup.set(template.groupId, [template]);
  }
  return [...byGroup.entries()]
    .map(([groupId, groupTemplates]) => {
      const first = groupTemplates[0]!;
      const catalogKeys = new Set(groupTemplates.flatMap((template) => template.variantCatalogKeys));
      return {
        groupId,
        label: labelForIntent({
          moduleClass: first.moduleClass,
          kitchenModuleRole: first.kitchenModuleRole,
          placementZone: first.placementZone,
          requiresWorktop: first.requiresWorktop,
          requiresCorner: first.requiresCorner,
          requiresApplianceOpening: first.requiresApplianceOpening,
          requiresWallAttachment: false,
          builderKeyCandidates: [],
          featureTags: first.featureTags,
          notes: []
        }),
        moduleClass: first.moduleClass,
        kitchenModuleRole: first.kitchenModuleRole,
        placementZone: first.placementZone,
        requiresWorktop: groupTemplates.some((template) => template.requiresWorktop),
        requiresCorner: groupTemplates.some((template) => template.requiresCorner),
        requiresApplianceOpening: groupTemplates.some((template) => template.requiresApplianceOpening),
        featureTags: uniqueSortedStrings(groupTemplates.flatMap((template) => template.featureTags)),
        templateCount: groupTemplates.length,
        variantCount: vendorCatalog.productVariants.filter((variant) => catalogKeys.has(variant.catalogKey)).length,
        articleFamilies: uniqueSortedStrings(groupTemplates.flatMap((template) => template.articleFamilies)),
        availableWidthsMm: uniqueSortedNumbers(groupTemplates.flatMap((template) => template.availableWidthsMm)),
        needsReviewCount: groupTemplates.filter((template) => template.needsReview).length
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label) || left.groupId.localeCompare(right.groupId));
}
