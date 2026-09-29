import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { createProjectMaterialRuntimeCatalog } from "../../app/projectMaterialRuntimeCatalog";
import { createDefaultProjectMarginSettingsState } from "../../core/project-margins/project-margin-types";
import type { ProjectMaterialAssignment } from "../../core/project-materials/project-material-types";
import { makeDefaultKitchenContext } from "../kitchenContext";
import { calculateFwmFurnitureBOM } from "../../modules/fwmFurniture/calculation";
import { makeDefaultFwmFurnitureParams, normalizeFwmFurnitureParams } from "../../modules/fwmFurniture/types";
import { applyProjectAssignedPricing } from "./projectAssignedPricing";
import { buildProjectMarginsView } from "./projectMargins";

function fixture(copies = 1, unitPrice: number | null = 859.54) {
  const base = { clientId: "runner-test", ...createSystemCatalogSeed() };
  const definition = { ...base.components.find(component => component.componentType === "runner")!, id: "supplier-runner:fixture:variant", name: "Runner set", displayName: "Runner set" };
  const assignment: ProjectMaterialAssignment = {
    assignmentId: "material-assignment:runner:front-height:264:corpus-thickness:18",
    category: "runner", variantKey: "front-height:264:corpus-thickness:18", kind: "component",
    componentId: definition.id, customValues: { supplierBridge: { normalizedPriceBasis: "set", rawUnitText: "sada" } },
    source: "user", updatedAt: "2026-09-24T00:00:00.000Z",
    snapshots: { component: { definition, unitPrice, currency: "CZK", priceListId: null, capturedAt: "2026-09-24T00:00:00.000Z" } }
  };
  const runtime = createProjectMaterialRuntimeCatalog(base);
  runtime.applyProjectAssignments({ schemaVersion: 2, initialized: true, revision: 1, assignments: [assignment] });
  // 900 carcass envelope - 100 legs - 4 outer gaps - 4 inter-front gaps = 3 × 264.
  const params = { ...makeDefaultFwmFurnitureParams("fwm_catalog_base_drawers"), height: 938, heightCarcass: 900,
    worktopThicknessMm: 38, plinthHeight: 100, frontGap: 2, boardThickness: 18, drawerCount: 3, quantity: copies };
  const raw = calculateFwmFurnitureBOM(params, makeDefaultKitchenContext(base), runtime.catalog);
  const settings = createDefaultProjectMarginSettingsState(); settings.groupMargins.runner = 150;
  const price = (assignments = [assignment]) => {
    runtime.applyProjectAssignments({ schemaVersion: 2, initialized: true, revision: 1, assignments });
    const result = applyProjectAssignedPricing(raw, "module:drawers", runtime.catalog);
    const view = buildProjectMarginsView([{ instanceId: "drawers", kind: "module", label: "Drawers", result }], settings, { currency: "CZK", materialAssignments: assignments });
    return { result, group: view.groups.find(group => group.category === "runner")! };
  };
  return { base, runtime, assignment, price, params };
}

describe("project runner price authority", () => {
  it.each([1, 2])("prices three sets per cabinet from the saved variant when the supplier ID is absent (%s cabinets)", copies => {
    const { base, assignment, price } = fixture(copies);
    expect(base.components.some(component => component.id === assignment.componentId)).toBe(false);
    const { result, group } = price();
    expect(group).toMatchObject({ baseCost: 2578.62 * copies, finalPrice: 6446.55 * copies, missingPriceCount: 0 });
    expect(group.items[0]).toMatchObject({ quantity: 3 * copies, resourceLabel: "Runner set" });
    const runner = result.pricing.items.find(item => item.category === "runner")!;
    expect(runner.validationErrors).toEqual([]);
    expect(runner.itemCost).toBeGreaterThan(0);
    expect(base.components.some(component => component.id === assignment.componentId)).toBe(false);
  });

  it("keeps explicit zero prices and refuses another front-height variant", () => {
    const { assignment, price } = fixture(1, 0);
    expect(price().group).toMatchObject({ baseCost: 0, missingPriceCount: 0 });
    expect(price([{ ...assignment, assignmentId: "material-assignment:runner:other", variantKey: "front-height:251:corpus-thickness:18" }]).group)
      .toMatchObject({ baseCost: 0, missingPriceCount: 1 });
  });

  it("resolves a scoped price independently even when both snapshots reference the same supplier ID", () => {
    const { assignment, price } = fixture();
    const own = structuredClone(assignment);
    own.assignmentId = "material-assignment:module:drawers:runner:front-height:264:corpus-thickness:18";
    own.snapshots.component!.unitPrice = 100;
    expect(price([own, assignment]).group).toMatchObject({ baseCost: 300, finalPrice: 750 });
    expect(price([assignment, own]).group).toMatchObject({ baseCost: 300, finalPrice: 750 });
  });

  it("uses the same actual front height in properties, geometry, BOM and runner demand with an external worktop", () => {
    const { params, base } = fixture();
    const normalized = normalizeFwmFurnitureParams(params);
    expect(normalized.drawerFrontHeightsMm).toBe("264,264,264");
    expect(normalizeFwmFurnitureParams(normalized)).toEqual(normalized);
    const result = calculateFwmFurnitureBOM(normalized, makeDefaultKitchenContext(base), base);
    expect(result.quoteBom.items.find(item => item.category === "runner")?.variantKey).toBe("front-height:264:corpus-thickness:18");
    expect(result.quoteBom.items.find(item => item.id === "drawer-fronts")?.dimensionsMm?.width).toBe(264);
  });
});
