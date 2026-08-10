import type { ClientCatalog, PricingUnit } from "../core/catalog/catalog-types";
import type {
  MaterialAssignmentCategory,
  ProjectMaterialScope,
  ProjectMaterialScopeItem
} from "../core/project-materials/project-material-types";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import { buildProjectPricingViews } from "../layout/bom/projectPricing";
import { calculateModuleBOM } from "../layout/bom/calculateBOM";
import type { PortableQuoteBomItem, PortableQuoteBomPayload } from "../modules/runtime/portableCommercial";
import { resolveProjectMaterialInputs } from "./projectMaterialQuantityResolver";
import { projectMaterialCategoryForBomItem } from "../layout/bom/projectMaterialCategory";

function quantityFor(item: PortableQuoteBomItem, category: MaterialAssignmentCategory): { quantity: number; unit: PricingUnit } | null {
  const pieces = finite(item.quantity) ?? 1;
  if (category === "plinth") {
    const length = finite(item.dimensionsMm?.length);
    return length == null ? null : { quantity: length * pieces / 1000, unit: "lm" };
  }
  if (["edge_front", "edge_other"].includes(category)) {
    const quantity = finite(item.metrics?.edgeLengthLm) ?? finite(item.pricingQuantityBase) ?? finite(item.pricingQuantity);
    return quantity == null ? null : { quantity, unit: "lm" };
  }
  if (["handle", "hinge", "runner", "lift_up", "leg", "fastener", "other_component"].includes(category)) {
    const quantity = finite(item.pricingQuantityBase) ?? finite(item.pricingQuantity) ?? pieces;
    return { quantity, unit: "pcs" };
  }
  const area = finite(item.metrics?.areaM2) ?? finite(item.pricingQuantityBase)
    ?? areaFromDimensions(item, pieces);
  return area == null ? null : { quantity: area, unit: "m2" };
}

function areaFromDimensions(item: PortableQuoteBomItem, pieces: number): number | null {
  const length = finite(item.dimensionsMm?.length);
  const width = finite(item.dimensionsMm?.width);
  return length == null || width == null ? null : length * width * pieces / 1_000_000;
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function itemsFor(quoteBom: PortableQuoteBomPayload, scopeId: string): ProjectMaterialScopeItem[] {
  return quoteBom.items.flatMap((item) => {
    const category = projectMaterialCategoryForBomItem(item);
    if (!category) return [];
    const amount = quantityFor(item, category);
    if (!amount) return [];
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
      quantity: Math.round(amount.quantity * 10_000) / 10_000,
      unit: amount.unit,
      pieces: finite(item.quantity) ?? 1,
      ...(layoutTarget ? { layoutTarget } : {})
    } satisfies ProjectMaterialScopeItem];
  });
}

export function resolveProjectMaterialScopes(save: ProjectSaveFile, catalog: ClientCatalog): ProjectMaterialScope[] {
  const scopes: ProjectMaterialScope[] = [];
  const inputs = resolveProjectMaterialInputs(save, catalog, []);
  for (const instance of inputs.instances) {
    const context = inputs.kitchenGroups.find((group) => group.id === instance.kitchenGroupId)?.ctx ?? inputs.kitchenContext;
    try {
      const quoteBom = calculateModuleBOM(instance, context, catalog).quoteBom;
      const scopeId = `module:${instance.id}`;
      scopes.push({ id: scopeId, kind: "module", label: quoteBom.displayName, items: itemsFor(quoteBom, scopeId) });
    } catch {
      // The regular Materials warning path reports a malformed module. It must not block the remaining scopes.
    }
  }
  const additions = buildProjectPricingViews([], [...inputs.worktops], [...inputs.customFurniture], inputs.kitchenContext, catalog);
  for (const addition of additions) {
    scopes.push({
      id: `addition:${addition.instanceId}`,
      kind: "addition",
      label: addition.label,
      items: itemsFor(addition.result.quoteBom, `addition:${addition.instanceId}`)
    });
  }
  return scopes;
}
