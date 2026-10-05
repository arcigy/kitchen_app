import { projectExtraComponentItems } from "./projectExtraComponents";
import { projectComponentAmount } from "../../core/project-materials/project-component-values";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { convertPriceCurrency, isPriceCurrency } from "../../core/pricing/currency";
import { resolveEffectiveProjectMaterialAssignment } from "../../core/project-materials/project-material-assignment-resolution";
import { getRuntimeProjectAssignments } from "../../core/project-materials/runtimeProjectAssignments";
import { calculateCommercialPricingFromQuoteBom } from "../../modules/runtime/portableCommercial";
import type { BOMResult } from "./bomTypes";
import { projectMaterialCategoryForBomItem } from "./projectMaterialCategory";

/** Resolve by scope AND variant before pricing; a supplier ID need not exist in today's catalogue. */
export function applyProjectAssignedPricing(result: BOMResult, scopeId: string, catalog: ClientCatalog): BOMResult {
  const assignments = getRuntimeProjectAssignments(catalog);
  if (!assignments.length) return result;
  const quoteBom = structuredClone(result.quoteBom);
  const extraItems = projectExtraComponentItems(catalog, scopeId, quoteBom.moduleInstance.quantity);
  for (const item of extraItems) if (!quoteBom.items.some(existing => existing.id === item.id)) quoteBom.items.push(item);
  let changed = extraItems.length > 0;
  for (const item of quoteBom.items) {
    const category = projectMaterialCategoryForBomItem(item);
    if (!category || (item.unitPriceOverride != null && item.unitPriceOverrideSource !== "project")) continue;
    const resolution = resolveEffectiveProjectMaterialAssignment(assignments, scopeId, { ...item, category });
    const assignment = resolution.assignment;
    if (item.explicitBoardMaterial && resolution.source !== "override") continue;
    if (item.backsplashCut && !assignment?.snapshots.material) continue;
    if (!assignment) continue;
    item.excludeFromConstructionLabor = assignment.projectValues?.excludeFromConstructionLabor === true;
    changed = true;
    const snapshot = assignment.kind === "material" ? assignment.snapshots.material : assignment.snapshots.component;
    item.unitPriceOverrideSource = "project";
    item.priceSnapshotKey = JSON.stringify(snapshot);
    item.catalogRef = null;
    item.pricingLookup = null;
    item.unitPriceOverride = snapshot?.unitPrice != null && snapshot.unitPrice >= 0
      && Number.isFinite(snapshot.unitPrice) && isPriceCurrency(snapshot.currency) && isPriceCurrency(catalog.priceList.currency)
      ? convertPriceCurrency(snapshot.unitPrice, snapshot.currency, catalog.priceList.currency) : null;
    if (assignment.kind === "component" && isPriceCurrency(catalog.priceList.currency)) {
      const amount = projectComponentAmount(assignment, item.pricingQuantityBase ?? item.pricingQuantity, quoteBom.moduleInstance.quantity, catalog.priceList.currency);
      item.pricingQuantity = amount.quantity;
      item.pricingQuantityBase = amount.quantity;
      item.quantity = amount.quantity;
      item.pricingUnit = amount.unit;
      item.pricingBasis = amount.unit === "lm" ? "linear_length" : "piece";
      item.unitPriceOverride = amount.unitPrice;
      if (amount.unitPrice !== null) item.validationErrors = item.validationErrors?.filter(message =>
        !message.startsWith("Missing catalog component") && !message.startsWith("Missing price for "));
    }
    if (assignment.snapshots.component) {
      const definition = assignment.snapshots.component.definition;
      item.component = { ...definition, catalogId: definition.id };
    }
    if (assignment.snapshots.material) {
      const definition = assignment.snapshots.material.definition;
      item.material = { ...definition, catalogId: definition.id, assignmentSource: "project" };
    }
  }
  // Accessories follow the final project demand, including a per-cabinet quantity override.
  // An explicitly overridden accessory quantity remains independent.
  for (const [accessory, parent] of [["hinge_plate", "hinge"], ["leg_plate", "leg"]] as const) {
    const parents = quoteBom.items.filter(item => projectMaterialCategoryForBomItem(item) === parent);
    if (!parents.length) continue;
    const quantity = parents.reduce((sum, item) => sum + item.pricingQuantity, 0);
    for (const item of quoteBom.items.filter(item => projectMaterialCategoryForBomItem(item) === accessory)) {
      const assignment = resolveEffectiveProjectMaterialAssignment(assignments, scopeId, { ...item, category: accessory }).assignment;
      if (assignment?.projectValues?.quantity !== undefined) continue;
      if (item.pricingQuantity !== quantity) changed = true;
      item.quantity = item.pricingQuantityBase = item.pricingQuantity = quantity;
    }
  }
  if (!changed) return result;
  return { ...result, quoteBom, pricing: calculateCommercialPricingFromQuoteBom({
    quoteBom, catalog,
    boardWasteMultiplier: result.pricing.priceInputs.boardWasteMultiplier,
    laborCostFixed: result.pricing.laborCostFixed,
    preassembly: result.pricing.preassembly
  }) };
}
