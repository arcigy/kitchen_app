import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import {
  listVendorCatalogGroupSummaries,
  listVendorCatalogTemplateSummaries,
  type VendorCatalogTemplateSummary
} from "../core/catalog/vendor-catalog-browser";
import { resolveVendorModuleSeed } from "../core/catalog/vendor-module-seed-resolver";
import type { ModuleParams } from "../model/cabinetTypes";
import { getPinoSideCabinetDefinition, getPinoSideCabinetProductGroup } from "../modules/pinoSideCabinet/types";

export type PinoVendorKitchenCatalogRole = "low" | "top" | "tall" | "accessory";

export type PinoVendorKitchenCatalogEntry = {
  role: PinoVendorKitchenCatalogRole;
  groupId: string;
  groupLabel: string;
  productTemplateId: string;
  productTemplateName: string;
  moduleType: string;
  modulePackageId: string;
  runtimeBuilderKey: string | null;
  catalogKey: string;
  articleFamilies: string[];
  availableWidthsMm: number[];
  widthLabel: string;
  sourcePages: number[];
  featureTags: string[];
  placementZone: string;
  params: ModuleParams;
  status: "resolved" | "needs_review";
  templateNeedsReview: boolean;
};

export type PinoVendorKitchenCatalog = {
  groups: Record<PinoVendorKitchenCatalogRole, Map<string, PinoVendorKitchenCatalogEntry[]>>;
  entries: PinoVendorKitchenCatalogEntry[];
};

export type PinoVendorKitchenCatalogOptions = {
  includeNeedsReview?: boolean;
};

function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
    : "";
}

function queryMatches(entry: {
  groupLabel: string;
  productTemplateName: string;
  articleFamilies: string[];
  featureTags: string[];
  widthLabel: string;
}, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  const searchable = normalizeText([
    entry.groupLabel,
    entry.productTemplateName,
    entry.articleFamilies.join(" "),
    entry.featureTags.join(" "),
    entry.widthLabel
  ].join(" "));
  return searchable.includes(normalizedQuery);
}

function readWidthMm(variant: Pick<VendorProductVariant, "widthMm" | "widthCm">) {
  if (typeof variant.widthMm === "number" && Number.isFinite(variant.widthMm)) return Math.round(variant.widthMm);
  if (typeof variant.widthCm === "number" && Number.isFinite(variant.widthCm)) return Math.round(variant.widthCm * 10);
  return null;
}

function formatWidth(widthMm: number) {
  return widthMm % 10 === 0 ? `${widthMm / 10} cm` : `${widthMm} mm`;
}

function formatWidthLabel(widths: number[]) {
  if (widths.length === 0) return "-";
  return widths.map((width) => formatWidth(width)).join(" / ");
}

function roleForTemplate(template: Pick<VendorCatalogTemplateSummary, "kitchenModuleRole">): PinoVendorKitchenCatalogRole {
  const role = normalizeText(template.kitchenModuleRole);
  if (role === "accessory") return "accessory";
  if (role === "top" || role === "upper" || role === "wall") return "top";
  if (role === "tall") return "tall";
  return "low";
}

function preferredVariantSort(left: VendorProductVariant, right: VendorProductVariant) {
  const leftReviewRank = left.needsReview ? 1 : 0;
  const rightReviewRank = right.needsReview ? 1 : 0;
  if (leftReviewRank !== rightReviewRank) return leftReviewRank - rightReviewRank;
  if (left.confidence !== right.confidence) return right.confidence - left.confidence;
  return (readWidthMm(left) ?? Number.POSITIVE_INFINITY) - (readWidthMm(right) ?? Number.POSITIVE_INFINITY);
}

function hasMatchingModule(catalog: Pick<ClientCatalog, "modules">, modulePackageId: string, moduleType: string) {
  return catalog.modules.some((moduleDef: ClientModuleDefinition) =>
    moduleDef.enabled !== false &&
    moduleDef.modulePackageId === modulePackageId &&
    moduleDef.moduleType === moduleType
  );
}

function resolvePinoSideCabinetDisplayInfo(template: VendorCatalogTemplateSummary) {
  if (!template.productTemplateId.startsWith("pino_side_cabinet_")) return null;
  const definition = getPinoSideCabinetDefinition(template.productTemplateId);
  const productGroup = getPinoSideCabinetProductGroup(definition.productGroupId);
  return {
    groupId: definition.productGroupId,
    groupLabel: productGroup.label,
    productTemplateName: definition.moduleLabel
  };
}

export function hasPinoVendorKitchenCatalog(catalog: Pick<ClientCatalog, "clientId" | "vendorCatalog">) {
  return (
    catalog.vendorCatalog?.vendorId === "pino_nobilia" ||
    catalog.clientId === "client_pino_nobilia_vkh_2026"
  );
}

export function buildPinoVendorKitchenCatalog(
  catalog: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">,
  query = "",
  options: PinoVendorKitchenCatalogOptions = {}
): PinoVendorKitchenCatalog {
  const groups: Record<PinoVendorKitchenCatalogRole, Map<string, PinoVendorKitchenCatalogEntry[]>> = {
    low: new Map(),
    top: new Map(),
    tall: new Map(),
    accessory: new Map()
  };
  if (!hasPinoVendorKitchenCatalog(catalog) || !catalog.vendorCatalog) {
    return { groups, entries: [] };
  }

  const groupLabelById = new Map(
    listVendorCatalogGroupSummaries(catalog, { includeNeedsReview: options.includeNeedsReview === true }).map((group) => [group.groupId, group.label] as const)
  );
  const entries: PinoVendorKitchenCatalogEntry[] = [];
  const templates = listVendorCatalogTemplateSummaries(catalog, { includeNeedsReview: options.includeNeedsReview === true });

  for (const template of templates) {
    const variants = catalog.vendorCatalog.productVariants
      .filter((variant) =>
        variant.productTemplateId === template.productTemplateId &&
        (options.includeNeedsReview === true || variant.needsReview !== true)
      )
      .slice()
      .sort(preferredVariantSort);
    const preferred = variants[0];
    if (!preferred) continue;

    const resolution = resolveVendorModuleSeed(catalog, { catalogKey: preferred.catalogKey });
    if (!resolution.params || !resolution.modulePackageId || !resolution.moduleType) continue;
    if (resolution.status !== "resolved" && resolution.status !== "needs_review") continue;
    if (!hasMatchingModule(catalog, resolution.modulePackageId, resolution.moduleType)) continue;

    const widths = [...new Set(template.availableWidthsMm.filter((width) => Number.isFinite(width) && width > 0))].sort((left, right) => left - right);
    const pinoSideCabinetDisplay = resolvePinoSideCabinetDisplayInfo(template);
    const entry: PinoVendorKitchenCatalogEntry = {
      role: roleForTemplate(template),
      groupId: pinoSideCabinetDisplay?.groupId ?? template.groupId,
      groupLabel: pinoSideCabinetDisplay?.groupLabel ?? groupLabelById.get(template.groupId) ?? template.groupId,
      productTemplateId: template.productTemplateId,
      productTemplateName: pinoSideCabinetDisplay?.productTemplateName ?? template.productTemplateName,
      moduleType: resolution.moduleType,
      modulePackageId: resolution.modulePackageId,
      runtimeBuilderKey: resolution.runtimeBuilderKey,
      catalogKey: preferred.catalogKey,
      articleFamilies: [...template.articleFamilies],
      availableWidthsMm: widths,
      widthLabel: formatWidthLabel(widths),
      sourcePages: [...template.sourcePages].sort((left, right) => left - right),
      featureTags: [...template.featureTags],
      placementZone: template.placementZone,
      params: structuredClone(resolution.params),
      status: resolution.status,
      templateNeedsReview: template.needsReview
    };
    if (!queryMatches(entry, query)) continue;
    entries.push(entry);
    const bucket = groups[entry.role].get(entry.groupId) ?? [];
    bucket.push(entry);
    groups[entry.role].set(entry.groupId, bucket);
  }

  for (const role of Object.keys(groups) as PinoVendorKitchenCatalogRole[]) {
    for (const [groupId, bucket] of groups[role]) {
      bucket.sort((left, right) =>
        left.groupLabel.localeCompare(right.groupLabel) ||
        left.productTemplateName.localeCompare(right.productTemplateName) ||
        left.catalogKey.localeCompare(right.catalogKey)
      );
      groups[role].set(groupId, bucket);
    }
  }

  entries.sort((left, right) =>
    left.role.localeCompare(right.role) ||
    left.groupLabel.localeCompare(right.groupLabel) ||
    left.productTemplateName.localeCompare(right.productTemplateName) ||
    left.catalogKey.localeCompare(right.catalogKey)
  );

  return { groups, entries };
}
