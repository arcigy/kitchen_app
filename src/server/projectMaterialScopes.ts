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

function itemsFor(quoteBom: PortableQuoteBomPayload): ProjectMaterialScopeItem[] {
  return quoteBom.items.flatMap((item) => {
    const category = projectMaterialCategoryForBomItem(item);
    if (!category) return [];
    const amount = quantityFor(item, category);
    if (!amount) return [];
    return [{
      id: item.id,
      category,
      label: item.description || item.name || item.id,
      description: item.dimensionsMm
        ? `${Math.round(item.dimensionsMm.length)} × ${Math.round(item.dimensionsMm.width)} × ${Math.round(item.dimensionsMm.thickness)} mm`
        : item.component?.componentType ?? item.materialGroup ?? "Komponent",
      quantity: Math.round(amount.quantity * 10_000) / 10_000,
      unit: amount.unit,
      pieces: finite(item.quantity) ?? 1
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
      scopes.push({ id: `module:${instance.id}`, kind: "module", label: quoteBom.displayName, items: itemsFor(quoteBom) });
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
      items: itemsFor(addition.result.quoteBom)
    });
  }
  return scopes;
}
