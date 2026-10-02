import { convertPriceCurrency, type PriceCurrency } from "../../core/pricing/currency";
import { projectContribution, type ProjectContribution } from "./projectContribution";
import type { ProjectPricingView } from "./projectPricing";
import {
  isProjectMarginSettingsState,
  normalizeProjectMarginSettingsState,
  type ProjectMarginSettingsState
} from "../../core/project-margins/project-margin-types";
import { buildProjectMarginsView, type ProjectMarginsView } from "./projectMargins";

export type CatalogAggregateRow = {
  catalogId: string;
  displayName: string;
  unitPrice: number;
  quantity: number;
  pricedQuantity?: number;
  cost: number;
  unit: string;
  group?: string;
};

export type ProjectQuoteSettings = {
  additionalLaborCost: number;
  marginPercent: number;
  additionalLaborFixed?: boolean;
  constructionLaborPercent?: number;
};

export type ProjectQuoteSettingsInput = Partial<ProjectQuoteSettings> | ProjectMarginSettingsState | null | undefined;

export type ProjectQuoteSummary = {
  currency?: PriceCurrency;
  contribution?: ProjectContribution;
  settings: ProjectQuoteSettings;
  boardsCost: number;
  edgesCost: number;
  hardwareCost: number;
  materialCost: number;
  moduleLaborCost: number;
  additionalLaborCost: number;
  laborCostTotal: number;
  constructionLaborCost?: number;
  subtotalBeforeMargin: number;
  marginPercent: number;
  marginAmount: number;
  finalPrice: number;
  marginView: ProjectMarginsView;
  formulas: {
    boardPricing: string;
    materialCost: string;
    laborCost: string;
    subtotalBeforeMargin: string;
    marginAmount: string;
    finalPrice: string;
  };
};

export const DEFAULT_PROJECT_QUOTE_SETTINGS: ProjectQuoteSettings = {
  additionalLaborCost: 0,
  marginPercent: 20
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asFiniteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sanitizeProjectQuoteSettings(settings?: Partial<ProjectQuoteSettings> | null): ProjectQuoteSettings {
  return {
    additionalLaborCost: round(Math.max(0, asFiniteNumber(settings?.additionalLaborCost, DEFAULT_PROJECT_QUOTE_SETTINGS.additionalLaborCost))),
    marginPercent: round(Math.max(0, asFiniteNumber(settings?.marginPercent, DEFAULT_PROJECT_QUOTE_SETTINGS.marginPercent)), 2),
    ...(typeof settings?.additionalLaborFixed === "boolean" ? { additionalLaborFixed: settings.additionalLaborFixed } : {}),
    ...(settings?.constructionLaborPercent !== undefined ? { constructionLaborPercent: settings.constructionLaborPercent } : {})
  };
}

export function buildProjectQuoteSummary(
  entries: ProjectPricingView[],
  settings?: ProjectQuoteSettingsInput,
  options: { currency?: PriceCurrency; settingsCurrency?: PriceCurrency } = {}
): ProjectQuoteSummary {
  const normalized = isProjectMarginSettingsState(settings)
    ? {
        additionalLaborCost: settings.additionalLaborCost,
        marginPercent: settings.defaultMarginPercent,
        ...(typeof settings.additionalLaborFixed === "boolean" ? { additionalLaborFixed: settings.additionalLaborFixed } : {}),
        ...(settings.constructionLaborPercent !== undefined ? { constructionLaborPercent: settings.constructionLaborPercent } : {})
      }
    : sanitizeProjectQuoteSettings(settings);
  const marginState = isProjectMarginSettingsState(settings)
    ? normalizeProjectMarginSettingsState(settings)
    : normalizeProjectMarginSettingsState(normalized);
  const currency = options.currency ?? "EUR";
  const additionalLaborCost = round(convertPriceCurrency(normalized.additionalLaborCost, options.settingsCurrency ?? currency, currency));
  marginState.additionalLaborCost = additionalLaborCost;
  const marginView = buildProjectMarginsView(entries, marginState, { currency });
  const money = (entry: ProjectPricingView, value: number) => convertPriceCurrency(value, entry.result.pricing.priceInputs.currency, currency);
  const boardsCost = round(entries.reduce((sum, entry) => sum + money(entry, entry.result.pricing.groups.boards.cost), 0));
  const edgesCost = round(entries.reduce((sum, entry) => sum + money(entry, entry.result.pricing.groups.edge_bands.cost), 0));
  const hardwareCost = round(entries.reduce((sum, entry) => sum + money(entry, entry.result.pricing.groups.hardware.cost), 0));
  const materialCost = round(boardsCost + edgesCost + hardwareCost);
  const moduleLaborCost = round(entries.reduce((sum, entry) => sum + money(entry, entry.result.pricing.laborCostFixed), 0));
  const constructionLaborCost = marginView.constructionLabor?.amount ?? 0;
  const laborCostTotal = round(moduleLaborCost + additionalLaborCost + constructionLaborCost);
  const subtotalBeforeMargin = round(materialCost + laborCostTotal);
  const marginPercent = marginView.summary.combinedMarginPercent;
  const marginAmount = marginView.summary.marginAmount;
  const finalPrice = marginView.summary.finalPrice;

  return {
    settings: normalized,
    currency,
    boardsCost,
    edgesCost,
    hardwareCost,
    materialCost,
    moduleLaborCost,
    additionalLaborCost,
    laborCostTotal,
    ...(constructionLaborCost > 0 ? { constructionLaborCost } : {}),
    subtotalBeforeMargin,
    marginPercent,
    marginAmount,
    finalPrice,
    marginView,
    contribution: marginView.summary.contribution,
    formulas: {
      boardPricing: "pricedAreaM2 = netAreaM2 * wasteMultiplier",
      materialCost: "boards + edge bands + hardware",
      laborCost: "module labor + additional project labor",
      subtotalBeforeMargin: "materialCost + laborCostTotal",
      marginAmount: "sum(lineCost * effectiveMarginPercent / 100)",
      finalPrice: "subtotalBeforeMargin + marginAmount"
    }
  };
}

export function aggregateProjectBoards(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      if (item.pricingGroup !== "boards" || !item.material?.catalogId || item.unitPrice == null || item.itemCost == null) continue;
      const existing =
        buckets.get(item.material.catalogId) ??
        {
          catalogId: item.material.catalogId,
          displayName: item.material.displayName,
          unitPrice: convertPriceCurrency(item.unitPrice, entry.result.pricing.priceInputs.currency, "EUR"),
          quantity: 0,
          pricedQuantity: 0,
          cost: 0,
          unit: "m2",
          group: item.material.family ?? item.materialGroup
        };
      existing.quantity += item.pricingQuantityBase ?? item.metrics?.areaM2 ?? item.pricingQuantity;
      existing.pricedQuantity = (existing.pricedQuantity ?? 0) + item.pricingQuantity;
      existing.cost += convertPriceCurrency(item.itemCost, entry.result.pricing.priceInputs.currency, "EUR");
      buckets.set(existing.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function aggregateProjectEdges(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      if (item.pricingGroup !== "edge_bands" || !item.material?.catalogId || item.unitPrice == null || item.itemCost == null) continue;
      const existing =
        buckets.get(item.material.catalogId) ??
        {
          catalogId: item.material.catalogId,
          displayName: item.material.displayName,
          unitPrice: convertPriceCurrency(item.unitPrice, entry.result.pricing.priceInputs.currency, "EUR"),
          quantity: 0,
          cost: 0,
          unit: "lm",
          group: item.material.family ?? item.materialGroup
        };
      existing.quantity += item.pricingQuantity;
      existing.cost += convertPriceCurrency(item.itemCost, entry.result.pricing.priceInputs.currency, "EUR");
      buckets.set(existing.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function aggregateProjectComponents(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) for (const item of entry.result.pricing.items) {
    if (item.pricingGroup !== "hardware" || item.unitPrice == null || item.itemCost == null) continue;
    const component = item.component;
    const catalogId = component?.catalogId ?? item.id;
    const key = JSON.stringify([catalogId, item.variantKey, item.pricingUnit, item.unitPrice]);
    const existing = buckets.get(key) ?? { catalogId, displayName: component?.displayName ?? item.name,
      unitPrice: convertPriceCurrency(item.unitPrice, entry.result.pricing.priceInputs.currency, "EUR"), quantity: 0, cost: 0, unit: item.pricingUnit === "pcs" ? "ks" : item.pricingUnit,
      group: component?.componentType ?? "other_component" };
    existing.quantity += item.pricingQuantity;
    existing.cost += convertPriceCurrency(item.itemCost, entry.result.pricing.priceInputs.currency, "EUR");
    buckets.set(key, existing);
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

/** Financial contribution, distinct from the legacy markup export fields. */
export function quoteContribution(summary: ProjectQuoteSummary): ProjectContribution {
  return summary.contribution ?? projectContribution(summary.materialCost, summary.finalPrice, summary.laborCostTotal);
}
