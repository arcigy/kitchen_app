import { describe, expect, it } from "vitest";
import type { ProjectMaterialAssignment } from "../core/project-materials/project-material-types";
import type { SupplierConfirmationApplyInput } from "../core/supplier-bridge/supplier-bridge-service";
import { baseAssignmentForSupplierTarget, updatedSupplierAssignment } from "./supplierBridgeProjectUpdater";

describe("supplier bridge project updater", () => {
  const supplierInput = (category: "runner" | "edge_front"): SupplierConfirmationApplyInput => ({
    context: { clientId: "tenant-a", userId: "user-a", role: "owner" },
    session: { id: "session-1", tenantId: "tenant-a", projectId: "project-a", userId: "user-a", supplierId: "demos", status: "active", createdAt: "2026-07-10T08:00:00.000Z", updatedAt: "2026-07-10T08:00:00.000Z", expiresAt: "2026-07-10T08:30:00.000Z" },
    item: { id: "item-1", sessionId: "session-1", materialAssignmentId: `material-assignment:${category}`, assignmentCategory: category, query: category, expectedManufacturer: null, expectedDecorCode: null, expectedSurfaceCode: null, expectedProductType: category === "runner" ? "drawer_system" : "edge_band", expectedThicknessMm: null, exactLookup: null, status: "needs_confirmation", selectedCandidateId: null, errorCode: null, createdAt: "2026-07-10T08:00:00.000Z", updatedAt: "2026-07-10T08:00:00.000Z" },
    candidate: { id: "candidate-1", syncItemId: "item-1", supplierProductCode: `SUP-${category}`, normalizedProduct: { displayName: `Supplier ${category}`, manufacturer: "Démos", decorCode: null, surfaceCode: null, productType: category === "runner" ? "other" : "edge_band", thicknessMm: category === "edge_front" ? 1 : 18, widthMm: null, lengthMm: null, availability: "available" }, matchEvidence: [], conflicts: [], sourcePageType: "product", sourcePath: "/product/supplier", observedAt: "2026-07-10T08:00:00.000Z" },
    priceObservation: null,
    mapping: null
  });

  it("creates a typed supplier component when a runner has no catalog default", () => {
    const current = {
      assignmentId: "material-assignment:runner",
      category: "runner",
      kind: "component",
      customValues: {},
      source: "auto",
      snapshots: {},
      updatedAt: "2026-07-10T08:00:00.000Z"
    } satisfies ProjectMaterialAssignment;

    const updated = updatedSupplierAssignment(current, supplierInput("runner"), "2026-07-10T08:01:00.000Z");
    expect(updated).toMatchObject({ componentId: "supplier-runner:demos:SUP-runner" });
    expect(updated.snapshots.component?.definition).toMatchObject({ componentType: "runner", pricingUnit: "pcs" });
  });

  it("creates a linear supplier material when an edge has no catalog default", () => {
    const current = {
      assignmentId: "material-assignment:edge_front",
      category: "edge_front",
      kind: "material",
      customValues: {},
      source: "auto",
      snapshots: {},
      updatedAt: "2026-07-10T08:00:00.000Z"
    } satisfies ProjectMaterialAssignment;

    const updated = updatedSupplierAssignment(current, supplierInput("edge_front"), "2026-07-10T08:01:00.000Z");
    expect(updated).toMatchObject({ materialId: "supplier-edge:demos:SUP-edge_front" });
    expect(updated.snapshots.material?.definition).toMatchObject({ materialType: "edge", pricingUnit: "lm", edgeFamily: "front" });
  });

  it("uses the captured category for scoped targets whose opaque BOM item ID contains colons", () => {
    const corpus = {
      assignmentId: "material-assignment:corpus",
      category: "corpus",
      kind: "material",
      customValues: {},
      source: "auto",
      snapshots: {},
      updatedAt: "2026-07-10T08:00:00.000Z"
    } satisfies ProjectMaterialAssignment;
    const front = { ...corpus, assignmentId: "material-assignment:front", category: "front" as const } satisfies ProjectMaterialAssignment;
    const item = {
      id: "item-1",
      sessionId: "session-1",
      materialAssignmentId: "material-assignment:module:website:corpus:part:side:left",
      assignmentCategory: "corpus" as const,
      query: "corpus",
      expectedManufacturer: null,
      expectedDecorCode: null,
      expectedSurfaceCode: null,
      expectedProductType: "board",
      expectedThicknessMm: null,
      exactLookup: null,
      status: "pending" as const,
      selectedCandidateId: null,
      errorCode: null,
      createdAt: "2026-07-10T08:00:00.000Z",
      updatedAt: "2026-07-10T08:00:00.000Z"
    };

    expect(baseAssignmentForSupplierTarget([corpus, front], item)).toBe(corpus);
  });

  it("updates an exact component assignment without board mapping fields", () => {
    const current = {
      assignmentId: "material-assignment:hinge",
      category: "hinge",
      kind: "component",
      componentId: "component-old",
      customValues: {},
      source: "user",
      snapshots: {
        component: {
          definition: {
            id: "component-old",
            entityType: "component",
            componentType: "hinge",
            geometryId: "hinge",
            name: "Old hinge",
            displayName: "Old hinge",
            brand: "Old",
            series: "Base",
            variant: "A",
            color: "steel",
            pricingBasis: "piece",
            pricingUnit: "pcs",
            defaultQuantity: 1,
            isActive: true,
            tags: [],
            preview: { colorHex: "#999999", roughness: 0.5, metalness: 1 }
          },
          unitPrice: 2,
          currency: "EUR",
          priceListId: "old",
          capturedAt: "2026-07-01T00:00:00.000Z"
        }
      },
      updatedAt: "2026-07-01T00:00:00.000Z"
    } satisfies ProjectMaterialAssignment;
    const input = {
      context: { clientId: "tenant-a", userId: "user-a", role: "owner" },
      session: { id: "session-1", tenantId: "tenant-a", projectId: "project-a", userId: "user-a", supplierId: "demos", status: "active", createdAt: "2026-07-10T08:00:00.000Z", updatedAt: "2026-07-10T08:00:00.000Z", expiresAt: "2026-07-10T08:30:00.000Z" },
      item: { id: "item-1", sessionId: "session-1", materialAssignmentId: current.assignmentId, query: "000-HINGE", expectedManufacturer: null, expectedDecorCode: null, expectedSurfaceCode: null, expectedProductType: "hinge", expectedThicknessMm: null, exactLookup: { requestId: "lookup-1", supplierId: "demos", supplierProductId: "000-HINGE", rawSupplierProductId: "000-HINGE", lookupStatus: "needs_confirmation" }, status: "needs_confirmation", selectedCandidateId: null, errorCode: null, createdAt: "2026-07-10T08:00:00.000Z", updatedAt: "2026-07-10T08:00:00.000Z" },
      candidate: { id: "candidate-1", syncItemId: "item-1", supplierProductCode: "000-HINGE", normalizedProduct: { displayName: "New hinge", manufacturer: "Blum", decorCode: null, surfaceCode: null, productType: "hinge", thicknessMm: null, widthMm: null, lengthMm: null, availability: "available" }, matchEvidence: [], conflicts: [], sourcePageType: "product", sourcePath: "/product/hinge", observedAt: "2026-07-10T08:00:00.000Z" },
      priceObservation: { id: "price-1", syncItemId: "item-1", candidateId: "candidate-1", tenantId: "tenant-a", supplierId: "demos", supplierAccountId: null, supplierProductCode: "000-HINGE", amount: 5, currency: "EUR", priceBasis: "piece", vatMode: "excluded", minimumQuantity: null, packageQuantity: null, rawPriceText: "5 EUR", rawUnitText: "ks", normalizedAmount: 5, normalizedPriceBasis: "piece", normalizationCalculation: null, normalizationConfidence: 1, observedAt: "2026-07-10T08:00:00.000Z" },
      mapping: null
    } satisfies SupplierConfirmationApplyInput;

    const updated = updatedSupplierAssignment(current, input, "2026-07-10T08:01:00.000Z");
    expect(updated.snapshots.component).toMatchObject({
      unitPrice: 5,
      priceListId: "supplier-observation:demos",
      definition: { displayName: "New hinge", supplierId: "demos", manufacturer: "Blum", supplierSource: { supplier: "demos", supplierProductId: "000-HINGE" } }
    });
    expect(updated.customValues.supplierBridge).toMatchObject({ supplierId: "demos", supplierProductCode: "000-HINGE", normalizedAmount: 5, currency: "EUR", priceLocked: false });
  });
});
