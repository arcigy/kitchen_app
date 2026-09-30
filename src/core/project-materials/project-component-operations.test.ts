import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import { createProjectMaterialRuntimeCatalog } from "../../app/projectMaterialRuntimeCatalog";
import { createDefaultProjectMaterialAssignments } from "./project-material-business";
import { applyProjectComponentOperation } from "./project-component-operations";
import { projectComponentAmount } from "./project-component-values";
import { makeDefaultFwmFurnitureParams } from "../../modules/fwmFurniture/types";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { buildProjectPricingViews } from "../../layout/bom/projectPricing";
import { buildProjectMarginsView } from "../../layout/bom/projectMargins";
import { createDefaultProjectMarginSettingsState } from "../project-margins/project-margin-types";
import { createEmptyProjectMaterialAssignmentsState, type ProjectMaterialScope } from "./project-material-types";
import type { LayoutInstance } from "../../layout/appState";
import { convertPriceCurrency } from "../pricing/currency";

const catalog = { clientId: "component-test", ...createSystemCatalogSeed() };
const now = "2026-09-24T00:00:00.000Z";
const scopes: ProjectMaterialScope[] = [{ id: "module:a", kind: "module", label: "Cabinet", items: [
  { id: "hinges", category: "hinge", label: "Hinges", description: "", quantity: 4, unit: "pcs", pieces: 4, moduleQuantity: 2 },
  { id: "legs", category: "leg", label: "Legs", description: "", quantity: 8, unit: "pcs", pieces: 8, moduleQuantity: 2 },
  { id: "clips", category: "plinth_clip", label: "Clips", description: "", quantity: 4, unit: "pcs", pieces: 4, moduleQuantity: 2 }
] }];

describe("project component values", () => {
  it("selects a separate module component without changing General or accepting the wrong hardware role", () => {
    const original = createDefaultProjectMaterialAssignments(catalog, now);
    const hinge = catalog.components.find(component => component.componentType === "hinge" && component.isActive)!;
    const target = { scopeId: "module:a", itemId: "hinges", category: "hinge" as const };
    const updated = applyProjectComponentOperation(original, { type: "set_component_values", target, componentId: hinge.id, values: { quantity: 3 } }, scopes, catalog, now);
    const own = updated.assignments.find(item => item.assignmentId === "material-assignment:module:a:hinge:hinges")!;
    expect(own.componentId).toBe(hinge.id);
    expect(updated.assignments.find(item => item.assignmentId === "material-assignment:hinge")).toEqual(original.assignments.find(item => item.assignmentId === "material-assignment:hinge"));
    expect(() => applyProjectComponentOperation(original, { type: "set_component_values", target, componentId: catalog.components.find(component => component.componentType === "leg")!.id, values: {} }, scopes, catalog, now)).toThrow("kategóriu");
  });
  it("keeps catalogue and saved price evidence unchanged, permits zero and resets overrides", () => {
    const original = createDefaultProjectMaterialAssignments(catalog, now);
    const before = structuredClone({ original, catalog });
    const target = { scopeId: "module:a", itemId: "hinges", category: "hinge" as const };
    const modified = applyProjectComponentOperation(original, { type: "set_component_values", target, values: { quantity: 3, unitPrice: 0, currency: "CZK" } }, scopes, catalog, now);
    const own = modified.assignments.find(item => item.assignmentId === "material-assignment:module:a:hinge:hinges")!;
    expect(projectComponentAmount(own, 4, 2, "CZK")).toMatchObject({ quantity: 6, unitPrice: 0, cost: 0 });
    expect(own.snapshots).toEqual(original.assignments.find(item => item.category === "hinge")!.snapshots);
    expect({ original, catalog }).toEqual(before);
    const reset = applyProjectComponentOperation(modified, { type: "set_component_values", target, values: null }, scopes, catalog, now);
    expect(reset.assignments.find(item => item.assignmentId === own.assignmentId)?.projectValues).toBeUndefined();
    expect(projectComponentAmount(reset.assignments.find(item => item.assignmentId === own.assignmentId)!, 4, 2, "CZK").quantity).toBe(4);
  });

  it.each(["leg", "plinth_clip"] as const)("rejects independent %s quantities; the geometry owns these counts", category => {
    expect(() => applyProjectComponentOperation(createDefaultProjectMaterialAssignments(catalog, now), {
      type: "set_component_values", target: { scopeId: "module:a", itemId: category === "leg" ? "legs" : "clips", category }, values: { quantity: 99 }
    }, scopes, catalog, now)).toThrow("vlastnostiach modulu");
  });

  it.each([NaN, Infinity, -1, 0.5])("rejects invalid piece quantities (%s)", quantity => {
    expect(() => applyProjectComponentOperation(createDefaultProjectMaterialAssignments(catalog, now), {
      type: "set_component_values", target: { scopeId: "module:a", itemId: "hinges", category: "hinge" }, values: { quantity, unit: "pcs" }
    }, scopes, catalog, now)).toThrow();
  });

  it("charges a module extra per cabinet and a project extra once in BOM and margins", () => {
    let state = createEmptyProjectMaterialAssignmentsState(); state.initialized = true;
    for (const [id, scopeId, quantity, unitPrice] of [["module-extra", "module:a", 3, 20], ["project-extra", "project", 5, 10]] as const) {
      state = applyProjectComponentOperation(state, { type: "add_component", id, scopeId, label: id,
        values: { quantity, unitPrice, currency: "CZK", unit: "set" } }, scopes, catalog, now);
    }
    // JSON persistence must retain the explicit units and per-cabinet values, without a catalogue entry.
    const runtime = createProjectMaterialRuntimeCatalog(catalog); runtime.applyProjectAssignments(JSON.parse(JSON.stringify(state)));
    const instance = { id: "a", params: { ...makeDefaultFwmFurnitureParams("fwm_catalog_base_doors"), quantity: 2 } } as unknown as LayoutInstance;
    const entries = buildProjectPricingViews([instance], [], [], makeDefaultKitchenContext(catalog), runtime.catalog);
    const extraRows = entries.flatMap(entry => entry.result.pricing.items).filter(item => item.id.startsWith("material-assignment:extra:"));
    expect(extraRows.map(item => [item.id, item.pricingQuantity, item.pricingUnit])).toEqual([
      ["material-assignment:extra:module-extra", 6, "set"], ["material-assignment:extra:project-extra", 5, "set"]
    ]);
    const margin = buildProjectMarginsView(entries, createDefaultProjectMarginSettingsState(), { materialAssignments: state.assignments, currency: "CZK" });
    expect(margin.groups.find(group => group.category === "other_component")).toMatchObject({ baseCost: 170, missingPriceCount: 0 });
  });

  it("counts accessory demand but charges it zero when included in the parent package", () => {
    const state = applyProjectComponentOperation(createDefaultProjectMaterialAssignments(catalog, now), {
      type: "set_component_values", assignmentId: "material-assignment:leg_plate", values: { includedInPackage: true }
    }, scopes, catalog, now);
    expect(projectComponentAmount(state.assignments.find(item => item.category === "leg_plate")!, 5, 1, "CZK"))
      .toMatchObject({ quantity: 5, unitPrice: 0, cost: 0 });
  });

  it("keeps hinge plates 1:1 with project hinge demand across BOM, cost and margins, unless separately overridden", () => {
    const state = createDefaultProjectMaterialAssignments(catalog, now);
    const hinge = structuredClone(state.assignments.find(item => item.category === "hinge")!);
    hinge.assignmentId = "material-assignment:module:a:hinge:hinges";
    hinge.projectValues = { quantity: 3, unitPrice: 5, currency: "CZK", unit: "pcs" };
    state.assignments.push(hinge);
    const plate = state.assignments.find(item => item.category === "hinge_plate")!;
    plate.projectValues = { unitPrice: 2, currency: "CZK", unit: "pcs" };
    const runtime = createProjectMaterialRuntimeCatalog(catalog);
    const cost = (czk: number) => Math.round(convertPriceCurrency(czk, "CZK", "EUR") * 100) / 100;
    const instance = { id: "a", params: { ...makeDefaultFwmFurnitureParams("fwm_catalog_base_doors"), quantity: 2 } } as unknown as LayoutInstance;
    const calculate = () => {
      runtime.applyProjectAssignments(state);
      return buildProjectPricingViews([instance], [], [], makeDefaultKitchenContext(catalog), runtime.catalog);
    };
    let entries = calculate();
    expect(entries[0]!.result.quoteBom.items.find(item => item.id === "hinges")).toMatchObject({ quantity: 6, pricingQuantity: 6 });
    expect(entries[0]!.result.pricing.items.find(item => item.id === "hinge-plates")).toMatchObject({ quantity: 6, pricingQuantity: 6, itemCost: cost(12) });
    expect(buildProjectMarginsView(entries, createDefaultProjectMarginSettingsState(), { currency: "CZK", materialAssignments: state.assignments }).groups.find(group => group.category === "hinge_plate")?.baseCost).toBe(12);
    const ownPlate = structuredClone(plate); ownPlate.assignmentId = "material-assignment:module:a:hinge_plate:hinge-plates";
    ownPlate.projectValues!.quantity = 2; state.assignments.push(ownPlate);
    entries = calculate();
    expect(entries[0]!.result.pricing.items.find(item => item.id === "hinge-plates")).toMatchObject({ quantity: 4, itemCost: cost(8) });
    delete ownPlate.projectValues!.quantity;
    hinge.projectValues!.quantity = 0;
    entries = calculate();
    expect(entries[0]!.result.pricing.items.find(item => item.id === "hinge-plates")).toMatchObject({ quantity: 0, itemCost: 0 });
  });
});
