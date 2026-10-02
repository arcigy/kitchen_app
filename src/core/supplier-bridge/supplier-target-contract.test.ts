import { describe, expect, it } from "vitest";
import { MATERIAL_ASSIGNMENT_CATEGORIES } from "../project-materials/project-material-business";
import { supplierExpectedProductTypeForMaterialCategory, supplierProductTypeIsCompatible, supplierTargetUsesThicknessConflict } from "./supplier-target-contract";
import { parseSupplierSyncSessionView } from "./supplier-session-view-validation";
import type { SupplierSyncSessionView } from "./supplier-bridge-types";

describe("supplier accessory targets", () => {
  it.each(["hinge_plate", "leg_plate", "plinth_clip", "hanging_bracket", "shelf_support", "assembly_pack"] as const)("requests and accepts hardware for %s without a board thickness conflict", category => {
    const expected = supplierExpectedProductTypeForMaterialCategory(category);
    expect(expected).toBe("component"); expect(supplierProductTypeIsCompatible({ category, expected, observed: "hardware" })).toBe(true);
    expect(supplierProductTypeIsCompatible({ category, expected, observed: "board" })).toBe(false);
    expect(supplierTargetUsesThicknessConflict(category, expected)).toBe(false);
  });
  it("accepts every current material category in a session response shared by the web app and extension", () => {
    const now = "2026-10-02T00:00:00Z";
    const items = MATERIAL_ASSIGNMENT_CATEGORIES.map(({ category }, index) => ({ id: `item${index}`, sessionId: "session", materialAssignmentId: `material-assignment:${category}`, assignmentCategory: category, query: category, createdAt: now, updatedAt: now,
      status: "pending" as const, exactLookup: null, expectedManufacturer: null, expectedDecorCode: null, expectedSurfaceCode: null, expectedThicknessMm: null, expectedProductType: supplierExpectedProductTypeForMaterialCategory(category), selectedCandidateId: null, errorCode: null }));
    const view: SupplierSyncSessionView = { schemaVersion: 1, session: { id: "session", tenantId: "qa", projectId: "project", userId: "qa", supplierId: "demos", status: "active", createdAt: now, updatedAt: now, expiresAt: now }, items, candidates: [], priceObservations: [], currentItem: items[0]!, counts: { total: items.length, processed: 0, pending: items.length, needsConfirmation: 0, completed: 0, skipped: 0, failed: 0 } };
    expect(parseSupplierSyncSessionView(JSON.parse(JSON.stringify(view)))?.items).toHaveLength(items.length);
    expect(supplierTargetUsesThicknessConflict("backsplash", "board")).toBe(true);
  });
});
