import { describe, expect, it } from "vitest";
import { validateCreateSupplierSessionRequest } from "./supplier-bridge-validation";

describe("exact supplier lookup request validation", () => {
  it("preserves leading zeroes and punctuation in the supplier product ID", () => {
    const parsed = validateCreateSupplierSessionRequest({
      supplierId: "demos",
      projectId: "project-1",
      lookups: [{
        requestId: "lookup-1",
        projectId: "project-1",
        materialAssignmentId: "material-assignment:corpus",
        supplierId: "demos",
        supplierProductId: "  0001/A-02.5  ",
        expectedProductType: "board"
      }]
    });
    expect(parsed.lookups[0]?.supplierProductId).toBe("0001/A-02.5");
  });

  it("rejects duplicate lookup request IDs", () => {
    const lookup = {
      requestId: "duplicate",
      projectId: "project-1",
      materialAssignmentId: "material-assignment:corpus",
      supplierId: "demos",
      supplierProductId: "001",
      expectedProductType: "board"
    };
    expect(() => validateCreateSupplierSessionRequest({ supplierId: "demos", projectId: "project-1", lookups: [lookup, { ...lookup, materialAssignmentId: "material-assignment:front" }] }))
      .toThrow("requestId values must be unique");
  });
});
