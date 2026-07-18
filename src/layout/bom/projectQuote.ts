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
};

export type ProjectQuoteSettingsInput = Partial<ProjectQuoteSettings> | ProjectMarginSettingsState | null | undefined;

export type ProjectQuoteSummary = {
  settings: ProjectQuoteSettings;
  boardsCost: number;
  edgesCost: number;
  hardwareCost: number;
  materialCost: number;
  moduleLaborCost: number;
  additionalLaborCost: number;
  laborCostTotal: number;
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
    marginPercent: round(Math.max(0, asFiniteNumber(settings?.marginPercent, DEFAULT_PROJECT_QUOTE_SETTINGS.marginPercent)), 2)
  };
}

export function buildProjectQuoteSummary(
  entries: ProjectPricingView[],
  settings?: ProjectQuoteSettingsInput
): ProjectQuoteSummary {
  const normalized = isProjectMarginSettingsState(settings)
    ? {
        additionalLaborCost: settings.additionalLaborCost,
        marginPercent: settings.defaultMarginPercent
      }
    : sanitizeProjectQuoteSettings(settings);
  const marginState = isProjectMarginSettingsState(settings)
    ? normalizeProjectMarginSettingsState(settings)
    : normalizeProjectMarginSettingsState(normalized);
  const marginView = buildProjectMarginsView(entries, marginState);
  const boardsCost = round(entries.reduce((sum, entry) => sum + entry.result.pricing.groups.boards.cost, 0));
  const edgesCost = round(entries.reduce((sum, entry) => sum + entry.result.pricing.groups.edge_bands.cost, 0));
  const hardwareCost = round(entries.reduce((sum, entry) => sum + entry.result.pricing.groups.hardware.cost, 0));
  const materialCost = round(boardsCost + edgesCost + hardwareCost);
  const moduleLaborCost = round(entries.reduce((sum, entry) => sum + entry.result.pricing.laborCostFixed, 0));
  const additionalLaborCost = round(normalized.additionalLaborCost);
  const laborCostTotal = round(moduleLaborCost + additionalLaborCost);
  const subtotalBeforeMargin = round(materialCost + laborCostTotal);
  const marginPercent = marginView.summary.combinedMarginPercent;
  const marginAmount = marginView.summary.marginAmount;
  const finalPrice = marginView.summary.finalPrice;

  return {
    settings: normalized,
    boardsCost,
    edgesCost,
    hardwareCost,
    materialCost,
    moduleLaborCost,
    additionalLaborCost,
    laborCostTotal,
    subtotalBeforeMargin,
    marginPercent,
    marginAmount,
    finalPrice,
    marginView,
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
          unitPrice: item.unitPrice,
          quantity: 0,
          pricedQuantity: 0,
          cost: 0,
          unit: "m2",
          group: item.material.family ?? item.materialGroup
        };
      existing.quantity += item.pricingQuantityBase ?? item.metrics?.areaM2 ?? item.pricingQuantity;
      existing.pricedQuantity = (existing.pricedQuantity ?? 0) + item.pricingQuantity;
      existing.cost += item.itemCost;
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
          unitPrice: item.unitPrice,
          quantity: 0,
          cost: 0,
          unit: "lm",
          group: item.material.family ?? item.materialGroup
        };
      existing.quantity += item.pricingQuantity;
      existing.cost += item.itemCost;
      buckets.set(existing.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function aggregateProjectComponents(entries: ProjectPricingView[]): CatalogAggregateRow[] {
  const buckets = new Map<string, CatalogAggregateRow>();
  for (const entry of entries) {
    for (const item of entry.result.pricing.items) {
      const component = item.component;
      if (item.pricingGroup !== "hardware" || !component?.catalogId || item.unitPrice == null || item.itemCost == null) continue;
      const existing =
        buckets.get(component.catalogId) ??
        {
          catalogId: component.catalogId,
          displayName: component.displayName,
          unitPrice: item.unitPrice,
          quantity: 0,
          cost: 0,
          unit: "ks",
          group: component.componentType
        };
      existing.quantity += item.pricingQuantity;
      existing.cost += item.itemCost;
      buckets.set(component.catalogId, existing);
    }
  }
  return [...buckets.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}
