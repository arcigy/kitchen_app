import { describe, expect, it } from "vitest";
import type { SupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import { createSupplierBridgeDebugReport, supplierTargetGroups, supplierTargetsForScope, supplierViewForProject } from "./sidepanelModel";

const view = {
  schemaVersion: 1,
  session: { id: "session-1", tenantId: "tenant-1", projectId: "project-1", userId: "user-1", supplierId: "demos", status: "active", createdAt: "2026-07-18T08:00:00.000Z", updatedAt: "2026-07-18T08:00:00.000Z", expiresAt: "2026-07-18T09:00:00.000Z" },
  candidates: [], priceObservations: [], currentItem: null,
  counts: { total: 2, processed: 1, pending: 1, needsConfirmation: 0, completed: 1, skipped: 0, failed: 0 },
  items: [
    { id: "general-corpus", sessionId: "session-1", materialAssignmentId: "material-assignment:corpus", query: "corpus", expectedManufacturer: null, expectedDecorCode: null, expectedSurfaceCode: null, expectedProductType: "board", expectedThicknessMm: null, exactLookup: null, status: "pending", selectedCandidateId: null, errorCode: null, createdAt: "2026-07-18T08:00:00.000Z", updatedAt: "2026-07-18T08:00:00.000Z", targetScope: "general", targetLabel: "Korpus" },
    { id: "module-front", sessionId: "session-1", materialAssignmentId: "material-assignment:module:1:front:item-1", query: "front", expectedManufacturer: null, expectedDecorCode: null, expectedSurfaceCode: null, expectedProductType: "board", expectedThicknessMm: null, exactLookup: null, status: "confirmed", selectedCandidateId: null, errorCode: null, createdAt: "2026-07-18T08:00:00.000Z", updatedAt: "2026-07-18T08:00:00.000Z", targetScope: "module", targetLabel: "Spodná skrinka · Front · 600 × 720 mm" }
  ]
} satisfies SupplierSyncSessionView;

describe("Supplier Bridge target model", () => {
  it("keeps module targets separate and marks confirmed targets visibly", () => {
    const moduleTargets = supplierTargetsForScope(view, "module");
    expect(moduleTargets).toMatchObject([{ group: "Spodná skrinka", assigned: true }]);
    expect(supplierTargetGroups(moduleTargets)).toHaveLength(1);
    expect(supplierTargetsForScope(view, "general")).toHaveLength(1);
  });

  it("never shows a stored session from a different active project", () => {
    expect(supplierViewForProject(view, "project-website")).toBeNull();
    expect(supplierViewForProject(view, "project-1")).toBe(view);
  });

  it("creates a copyable debug report without project IDs, session IDs, or captured product data", () => {
    const report = createSupplierBridgeDebugReport({
      version: "0.1.3",
      view,
      trace: [{ at: "2026-07-18T12:00:00.000Z", stage: "Priradenie materiálu zlyhalo", outcome: "error", code: "BACKEND_HTTP_500" }],
      lastWarning: null,
      visibleError: "Internal server error."
    });

    expect(report).toContain("BACKEND_HTTP_500");
    expect(report).toContain("Internal server error.");
    expect(report).not.toContain("project-1");
    expect(report).not.toContain("session-1");
  });
});
