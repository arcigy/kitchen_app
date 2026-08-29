import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { MaterialAssignmentCategory, ProjectMaterialScope, ProjectMaterialScopeItem } from "../../core/project-materials/project-material-types";
import type { KitchenContext } from "../kitchenContext";
import type { CustomFurnitureInstance } from "../customFurnitureTypes";
import type { LedStripGroup } from "../ledStripTypes";
import type { KitchenGroup, KitchenWorktopInstance, LayoutInstance } from "../appState";
import type { PortableQuoteBomItem, PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import { calculateModuleBOM } from "./calculateBOM";
import { buildProjectPricingViews } from "./projectPricing";
import { projectMaterialCategoryForBomItem } from "./projectMaterialCategory";

export type MaterialUsageGroupId =
  | "corpus"
  | "front"
  | "worktop"
  | "plinth"
  | "back"
  | "drawer_bottom"
  | "edge"
  | "hardware"
  | "lighting";

export type MaterialUsageUnit = "m2" | "lm" | "pcs";

export type MaterialUsageItem = {
  catalogId: string | null;
  displayName: string;
  detail: string;
  usageRole?: string;
  variantKey?: string;
  variantLabel?: string;
  quantity: number;
  pieces: number;
  unit: MaterialUsageUnit;
};

export type MaterialUsageGroup = {
  id: MaterialUsageGroupId;
  label: string;
  unit: MaterialUsageUnit;
  itemLabel: string;
  alwaysVisible: boolean;
  quantity: number;
  pieces: number;
  items: MaterialUsageItem[];
};

export type ProjectMaterialUsageSummary = {
  groups: MaterialUsageGroup[];
  warnings: string[];
  boardAreaM2: number;
  boardPieces: number;
  edgeLengthLm: number;
  hardwarePieces: number;
  isEmpty: boolean;
};

export type ProjectMaterialUsageInput = {
  instances: readonly LayoutInstance[];
  worktops: readonly KitchenWorktopInstance[];
  customFurniture: readonly CustomFurnitureInstance[];
  ledStripGroups?: readonly LedStripGroup[];
  kitchenContext: KitchenContext;
  kitchenGroups: readonly KitchenGroup[];
  catalog: ClientCatalog;
};

function scopeCategory(item: PortableQuoteBomItem): MaterialAssignmentCategory | null {
  return projectMaterialCategoryForBomItem(item);
}

function scopeItems(quoteBom: PortableQuoteBomPayload, scopeId: string): ProjectMaterialScopeItem[] {
  return quoteBom.items.flatMap((item) => {
    const category = scopeCategory(item);
    if (!category) return [];
    const pieces = finiteNumber(item.quantity) ?? 1;
    let quantity: number | null;
    let unit: ProjectMaterialScopeItem["unit"];
    if (category === "plinth") {
      const length = finiteNumber(item.dimensionsMm?.length);
      quantity = length == null ? null : length * pieces / 1000;
      unit = "lm";
    } else if (category === "edge_front" || category === "edge_other") {
      quantity = finiteNumber(item.metrics?.edgeLengthLm) ?? finiteNumber(item.pricingQuantityBase) ?? finiteNumber(item.pricingQuantity);
      unit = "lm";
    } else if (["handle", "hinge", "runner", "lift_up", "leg", "fastener", "other_component"].includes(category)) {
      quantity = finiteNumber(item.pricingQuantityBase) ?? finiteNumber(item.pricingQuantity) ?? pieces;
      unit = "pcs";
    } else {
      const length = finiteNumber(item.dimensionsMm?.length);
      const width = finiteNumber(item.dimensionsMm?.width);
      quantity = finiteNumber(item.metrics?.areaM2) ?? finiteNumber(item.pricingQuantityBase)
        ?? (length == null || width == null ? null : length * width * pieces / 1_000_000);
      unit = "m2";
    }
    if (quantity == null) return [];
    const runnerVariantLabel = category === "runner" ? item.variantLabel : undefined;
    const moduleId = scopeId.startsWith("module:") ? scopeId.slice("module:".length) : null;
    const additionId = scopeId.startsWith("addition:") ? scopeId.slice("addition:".length) : null;
    const layoutTarget = item.itemType !== "board" ? undefined
      : moduleId && item.materialSlotId ? { kind: "module-board" as const, instanceId: moduleId, materialSlotId: item.materialSlotId, sourcePartIds: item.sourcePartIds }
      : item.id.startsWith("worktop-board-") && item.sourcePartIds?.[0] ? { kind: "worktop" as const, worktopId: item.sourcePartIds[0] }
      : item.id.startsWith("custom-board-") && additionId && item.sourcePartIds?.[0]
        ? { kind: "custom-furniture-board" as const, furnitureId: additionId, boardId: item.sourcePartIds[0] }
        : undefined;
    return [{
      id: item.id,
      category,
      ...(item.variantKey ? { variantKey: item.variantKey } : {}),
      label: category === "runner" ? "Zásuvkové výsuvy" : item.description || item.name || item.id,
      description: runnerVariantLabel ?? (item.dimensionsMm
        ? `${Math.round(item.dimensionsMm.length)} × ${Math.round(item.dimensionsMm.width)} × ${Math.round(item.dimensionsMm.thickness)} mm`
        : item.component?.componentType ?? item.materialGroup ?? "Komponent"),
      quantity: Math.round(quantity * 10_000) / 10_000,
      unit,
      pieces,
      ...(layoutTarget ? { layoutTarget } : {})
    } satisfies ProjectMaterialScopeItem];
  });
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function buildProjectMaterialScopes(input: ProjectMaterialUsageInput): ProjectMaterialScope[] {
  const scopes: ProjectMaterialScope[] = [];
  for (const instance of input.instances) {
    const context = input.kitchenGroups.find((group) => group.id === instance.kitchenGroupId)?.ctx ?? input.kitchenContext;
    try {
      const quoteBom = calculateModuleBOM(instance, context, input.catalog).quoteBom;
      const scopeId = `module:${instance.id}`;
      scopes.push({ id: scopeId, kind: "module", label: quoteBom.displayName, items: scopeItems(quoteBom, scopeId) });
    } catch {
      // The summary warning path reports malformed modules without hiding valid module scopes.
    }
  }
  for (const addition of buildProjectPricingViews([], [...input.worktops], [...input.customFurniture], input.kitchenContext, input.catalog, [...(input.ledStripGroups ?? [])])) {
    const scopeId = `addition:${addition.instanceId}`;
    scopes.push({ id: scopeId, kind: "addition", label: addition.label, items: scopeItems(addition.result.quoteBom, scopeId) });
  }
  return scopes;
}

type GroupConfig = Pick<MaterialUsageGroup, "id" | "label" | "unit" | "itemLabel" | "alwaysVisible">;

const GROUPS: readonly GroupConfig[] = [
  { id: "corpus", label: "Korpus", unit: "m2", itemLabel: "doska", alwaysVisible: true },
  { id: "front", label: "Fronty", unit: "m2", itemLabel: "doska", alwaysVisible: true },
  { id: "worktop", label: "Pracovná doska", unit: "m2", itemLabel: "doska", alwaysVisible: true },
  { id: "plinth", label: "Sokel", unit: "lm", itemLabel: "doska", alwaysVisible: true },
  { id: "back", label: "Chrbát", unit: "m2", itemLabel: "doska", alwaysVisible: true },
  { id: "drawer_bottom", label: "Dná zásuviek", unit: "m2", itemLabel: "doska", alwaysVisible: false },
  { id: "edge", label: "Hrany", unit: "lm", itemLabel: "hrana", alwaysVisible: true },
  { id: "hardware", label: "Úchytky a kovanie", unit: "pcs", itemLabel: "ks", alwaysVisible: true },
  { id: "lighting", label: "LED pásiky", unit: "m2", itemLabel: "m2", alwaysVisible: true }
];

const GROUP_BY_ID = new Map(GROUPS.map((group) => [group.id, group]));

export function buildProjectMaterialUsageSummary(input: ProjectMaterialUsageInput): ProjectMaterialUsageSummary {
  const quoteBoms: Array<{ source: string; quoteBom: PortableQuoteBomPayload }> = [];
  const warnings: string[] = [];

  for (const instance of input.instances) {
    const context = input.kitchenGroups.find((group) => group.id === instance.kitchenGroupId)?.ctx ?? input.kitchenContext;
    try {
      quoteBoms.push({
        source: instance.id,
        quoteBom: calculateModuleBOM(instance, context, input.catalog).quoteBom
      });
    } catch (error) {
      warnings.push(`Modul ${instance.id}: materiály sa nepodarilo vypočítať (${errorMessage(error)}).`);
    }
  }

  try {
    const supportingEntries = buildProjectPricingViews([], [...input.worktops], [...input.customFurniture], input.kitchenContext, input.catalog, [...(input.ledStripGroups ?? [])]);
    for (const entry of supportingEntries) quoteBoms.push({ source: entry.instanceId, quoteBom: entry.result.quoteBom });
  } catch (error) {
    warnings.push(`Pracovné dosky alebo vlastný nábytok: materiály sa nepodarilo vypočítať (${errorMessage(error)}).`);
  }

  return summarizeMaterialUsage(
    quoteBoms.map((entry) => entry.quoteBom),
    warnings
  );
}

export function summarizeMaterialUsage(
  quoteBoms: readonly PortableQuoteBomPayload[],
  initialWarnings: readonly string[] = []
): ProjectMaterialUsageSummary {
  const buckets = new Map<MaterialUsageGroupId, Map<string, MaterialUsageItem>>();
  const warnings = [...initialWarnings];

  for (const quoteBom of quoteBoms) {
    for (const item of quoteBom.items) addBomItem(buckets, warnings, quoteBom.displayName, item);
  }

  const groups = GROUPS.map((config) => {
    const items = [...(buckets.get(config.id)?.values() ?? [])].sort((left, right) => left.displayName.localeCompare(right.displayName));
    return {
      ...config,
      quantity: round(items.reduce((total, item) => total + item.quantity, 0)),
      pieces: round(items.reduce((total, item) => total + item.pieces, 0)),
      items
    } satisfies MaterialUsageGroup;
  });

  const boardGroups = groups.filter((group) => group.unit === "m2" && group.id !== "lighting");
  const edgeGroup = groups.find((group) => group.id === "edge");
  const hardwareGroup = groups.find((group) => group.id === "hardware");

  return {
    groups,
    warnings: uniqueWarnings(warnings),
    boardAreaM2: round(boardGroups.reduce((total, group) => total + group.quantity, 0)),
    boardPieces: round(boardGroups.reduce((total, group) => total + group.pieces, 0)),
    edgeLengthLm: round(edgeGroup?.quantity ?? 0),
    hardwarePieces: round(hardwareGroup?.quantity ?? 0),
    isEmpty: groups.every((group) => group.items.length === 0)
  };
}

function addBomItem(
  buckets: Map<MaterialUsageGroupId, Map<string, MaterialUsageItem>>,
  warnings: string[],
  source: string,
  item: PortableQuoteBomItem
): void {
  const groupId = materialUsageGroupFor(item);
  if (!groupId) {
    warnings.push(`${source}: položka ${item.description || item.id} má neznámu materiálovú skupinu.`);
    return;
  }

  const config = GROUP_BY_ID.get(groupId);
  if (!config) return;

  const quantity = usageQuantity(item, config);
  if (quantity == null) {
    warnings.push(`${source}: položka ${item.description || item.id} nemá platné množstvo.`);
    return;
  }

  const pieces = positiveNumber(item.quantity) ?? 1;
  const catalogId = item.material?.catalogId ?? item.component?.catalogId ?? null;
  const displayName = item.material?.displayName ?? item.component?.displayName ?? item.description ?? item.name ?? item.id;
  const detail = itemDetail(item, config.unit);
  const usageRole = usageRoleFor(item);
  const key = `${catalogId ?? `missing:${item.variantKey ?? item.id}`}:${detail}:${usageRole}:${item.variantKey ?? "default"}`;
  const groupBuckets = buckets.get(groupId) ?? new Map<string, MaterialUsageItem>();
  const existing = groupBuckets.get(key);

  if (!catalogId) warnings.push(`${source}: položka ${item.description || item.id} nemá priradený materiál alebo komponent.`);

  if (existing) {
    existing.quantity += quantity;
    existing.pieces += pieces;
  } else {
    groupBuckets.set(key, {
      catalogId,
      displayName,
      detail,
      usageRole,
      ...(item.variantKey ? { variantKey: item.variantKey } : {}),
      ...(item.variantLabel ? { variantLabel: item.variantLabel } : {}),
      quantity,
      pieces,
      unit: config.unit
    });
  }
  buckets.set(groupId, groupBuckets);
}

function materialUsageGroupFor(item: PortableQuoteBomItem): MaterialUsageGroupId | null {
  if (item.itemType === "lighting") return "lighting";
  if (item.itemType === "edge_band") return "edge";
  if (item.itemType === "hardware") return "hardware";

  const rawGroup = String(item.materialGroup ?? item.material?.boardFamily ?? "").trim().toLowerCase();
  if (["corpus", "carcass", "body", "shelf"].includes(rawGroup)) return "corpus";
  if (rawGroup === "front") return "front";
  if (rawGroup === "worktop") return "worktop";
  if (rawGroup === "plinth") return "plinth";
  if (rawGroup === "back") return "back";
  if (rawGroup === "drawer_bottom") return "drawer_bottom";
  return null;
}

function usageQuantity(item: PortableQuoteBomItem, group: GroupConfig): number | null {
  const unit = group.unit;
  if (group.id === "plinth") {
    const lengthMm = positiveNumber(item.dimensionsMm?.length);
    const pieces = positiveNumber(item.quantity) ?? 1;
    return lengthMm == null ? null : (lengthMm * pieces) / 1000;
  }
  if (unit === "m2") {
    const area = positiveNumber(item.metrics?.areaM2) ?? positiveNumber(item.pricingQuantityBase);
    if (area != null) return area;
    const length = positiveNumber(item.dimensionsMm?.length);
    const width = positiveNumber(item.dimensionsMm?.width);
    const pieces = positiveNumber(item.quantity) ?? 1;
    return length != null && width != null ? (length * width * pieces) / 1_000_000 : null;
  }
  if (unit === "lm") return positiveNumber(item.metrics?.edgeLengthLm) ?? positiveNumber(item.pricingQuantityBase) ?? positiveNumber(item.pricingQuantity);
  return positiveNumber(item.pricingQuantityBase) ?? positiveNumber(item.pricingQuantity) ?? positiveNumber(item.quantity);
}

function usageRoleFor(item: PortableQuoteBomItem): string {
  if (item.itemType === "lighting") return "lighting";
  if (item.itemType === "hardware") return item.component?.componentType ?? item.materialGroup ?? item.category ?? "other_component";
  if (item.itemType === "edge_band") return item.material?.edgeFamily ?? item.materialGroup ?? "other";
  return item.materialGroup ?? item.material?.boardFamily ?? item.category;
}

function itemDetail(item: PortableQuoteBomItem, unit: MaterialUsageUnit): string {
  if (unit === "m2") {
    const thickness = positiveNumber(item.dimensionsMm?.thickness);
    return thickness != null ? `${round(thickness)} mm` : "Hrúbka neuvedená";
  }
  if (unit === "pcs") return item.component?.componentType ?? item.category ?? "Komponent";
  return "Olepovanie";
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "neznáma chyba";
}

function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
}
