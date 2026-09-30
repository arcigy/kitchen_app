import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { getRuntimeProjectAssignments } from "../../core/project-materials/runtimeProjectAssignments";
import { projectComponentUnit } from "../../core/project-materials/project-component-values";
import { calculateCommercialPricingFromQuoteBom, type PortableQuoteBomItem, type PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import type { BOMResult } from "./bomTypes";

export function projectExtraComponentItems(catalog: ClientCatalog, scopeId: string, copies: number): PortableQuoteBomItem[] {
  return getRuntimeProjectAssignments(catalog).filter(assignment => assignment.extraComponent?.scopeId === scopeId).map(assignment => {
    const unit = projectComponentUnit(assignment);
    const component = assignment.snapshots.component?.definition;
    const label = assignment.extraComponent!.label;
    return { id: assignment.assignmentId, itemType: "hardware", category: "other_component", materialGroup: "other_component",
      name: label, description: label, quantity: copies, pricingQuantity: copies, pricingQuantityBase: copies,
      pricingUnit: unit, pricingBasis: unit === "lm" ? "linear_length" : "piece", pricingGroup: "hardware",
      component: component ? { ...component, catalogId: component.id } : null };
  });
}

export function projectExtraComponentsBOM(catalog: ClientCatalog): BOMResult | null {
  const items = projectExtraComponentItems(catalog, "project", 1);
  if (!items.length) return null;
  const quoteBom: PortableQuoteBomPayload = { schemaVersion: "module-quote-bom.v1", moduleType: "project_components", displayName: "Samostatné komponenty",
    generatedAt: new Date().toISOString(), moduleInstance: { quantity: 1, widthMm: 0, heightMm: 0, depthMm: 0 }, items };
  return { moduleType: quoteBom.moduleType, displayName: quoteBom.displayName, quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({ quoteBom, catalog, laborCostFixed: 0 }) };
}
