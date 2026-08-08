import { describe, expect, it } from "vitest";
import type { MaterialDefinition } from "../../../src/core/catalog/catalog-types";
import type { ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import { extensionMaterialTargetGroups, extensionMaterialTargets } from "./materialTargetModel";

const view: ProjectMaterialsView = {
  assignments: {
    schemaVersion: 2,
    initialized: true,
    revision: 3,
    assignments: [{
      assignmentId: "material-assignment:module:module-a:corpus:panel-a",
      category: "corpus",
      kind: "material",
      customValues: { supplierBridge: { supplierProductCode: "175718" } },
      source: "user",
      snapshots: { material: {
        definition: { displayName: "Egger H3303 ST10" } as MaterialDefinition,
        unitPrice: null,
        currency: "EUR",
        priceListId: null,
        capturedAt: "2026-07-18T17:55:20.000Z"
      } },
      updatedAt: "2026-07-18T17:55:20.000Z"
    }, {
      assignmentId: "material-assignment:corpus",
      category: "corpus",
      kind: "material",
      customValues: { supplierBridge: { supplierProductCode: "GLOBAL-100" } },
      source: "user",
      snapshots: { material: {
        definition: { displayName: "Globálny korpus" } as MaterialDefinition,
        unitPrice: null,
        currency: "EUR",
        priceListId: null,
        capturedAt: "2026-07-18T17:55:20.000Z"
      } },
      updatedAt: "2026-07-18T17:55:20.000Z"
    }, {
      assignmentId: "material-assignment:front",
      category: "front",
      kind: "material",
      customValues: {},
      source: "auto",
      snapshots: {},
      updatedAt: "2026-07-18T17:55:20.000Z"
    }]
  },
  quantities: [], warnings: [],
  priceSource: { priceListId: "default", name: "Default", currency: "EUR", source: "test", lastSynchronizedAt: null },
  scopes: [{
    id: "module:module-a", kind: "module", label: "Spodná skrinka", items: [
      { id: "panel-a", category: "corpus", label: "Korpus", description: "", quantity: 1, unit: "pcs", pieces: 1 },
      { id: "panel-b", category: "front", label: "Front", description: "", quantity: 1, unit: "pcs", pieces: 1 }
    ]
  }, {
    id: "module:module-b", kind: "module", label: "Spodná skrinka", items: [
      { id: "panel-c", category: "corpus", label: "Korpus", description: "", quantity: 1, unit: "pcs", pieces: 1 }
    ]
  }]
};

describe("extension material target model", () => {
  it("keeps same-named modules in separate collapsible groups", () => {
    const groups = extensionMaterialTargetGroups(extensionMaterialTargets(view), "module");
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.id)).toEqual(["module:module:module-a", "module:module:module-b"]);
    expect(groups.map((group) => group.targets.length)).toEqual([2, 1]);
  });

  it("marks a Bridge-assigned part and exposes its visible material name and code", () => {
    const assigned = extensionMaterialTargets(view).find((target) => target.id.endsWith(":panel-a"));
    expect(assigned).toMatchObject({
      assigned: true,
      assignedText: "Egger H3303 ST10 · 175718",
      assignedProductCode: "175718",
      inherited: false
    });
  });

  it("shows a global assignment as inherited on every module part without an override", () => {
    const inherited = extensionMaterialTargets(view).find((target) => target.id.endsWith(":panel-c"));
    expect(inherited).toMatchObject({
      assigned: true,
      assignedText: "Globálny korpus · GLOBAL-100",
      assignedProductCode: "GLOBAL-100",
      inherited: true
    });
  });

  it("reflects later global changes only on parts that do not have their own override", () => {
    const changed = structuredClone(view);
    const global = changed.assignments.assignments.find((assignment) => assignment.assignmentId === "material-assignment:corpus")!;
    global.customValues = { supplierBridge: { supplierProductCode: "GLOBAL-NEW" } };
    if (global.snapshots.material) global.snapshots.material.definition.displayName = "Nový globálny korpus";

    const targets = extensionMaterialTargets(changed);
    expect(targets.find((target) => target.id.endsWith(":panel-c"))).toMatchObject({
      assignedText: "Nový globálny korpus · GLOBAL-NEW",
      inherited: true
    });
    expect(targets.find((target) => target.id.endsWith(":panel-a"))).toMatchObject({
      assignedText: "Egger H3303 ST10 · 175718",
      inherited: false
    });
  });

  it("does not mark ordinary unassigned project defaults as Bridge-completed", () => {
    const general = extensionMaterialTargets(view).find((target) => target.id === "material-assignment:front");
    expect(general).toMatchObject({ assigned: false, assignedText: "Nepriradené" });
  });
});
