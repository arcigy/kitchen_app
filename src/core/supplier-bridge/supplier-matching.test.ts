import { describe, expect, it } from "vitest";
import { evaluateSupplierCandidateMatch } from "./supplier-matching";
import type { SupplierSyncItem } from "./supplier-bridge-types";

const item: SupplierSyncItem = {
  id: "item-1",
  sessionId: "session-1",
  materialAssignmentId: "material-assignment:corpus",
  query: "Egger H1180 ST37 board 18 mm",
  expectedManufacturer: "Egger",
  expectedDecorCode: "H1180",
  expectedSurfaceCode: "ST37",
  expectedProductType: "board",
  expectedThicknessMm: 18,
  exactLookup: null,
  status: "pending",
  selectedCandidateId: null,
  errorCode: null,
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-10T08:00:00.000Z"
};

describe("supplier matching", () => {
  it("allows a high structured match without hard conflicts", () => {
    const result = evaluateSupplierCandidateMatch({
      item,
      candidate: {
        supplierProductCode: "MOCK-H1180-ST37-18",
        normalizedProduct: {
          displayName: "Egger H1180 ST37",
          manufacturer: "egger",
          decorCode: "H1180",
          surfaceCode: "ST37",
          productType: "board",
          thicknessMm: 18,
          widthMm: 2070,
          lengthMm: 2800,
          availability: "available"
        }
      }
    });
    expect(result.score).toBe(95);
    expect(result.conflicts).toEqual([]);
    expect(result.autoConfirmEligible).toBe(true);
  });

  it("never lets score override product type or thickness conflicts", () => {
    const result = evaluateSupplierCandidateMatch({
      item,
      expectedSupplierProductCode: "EXACT-CODE",
      candidate: {
        supplierProductCode: "EXACT-CODE",
        normalizedProduct: {
          displayName: "Wrong product",
          manufacturer: "Egger",
          decorCode: "H1180",
          surfaceCode: "ST37",
          productType: "edge",
          thicknessMm: 25,
          widthMm: null,
          lengthMm: null,
          availability: "available"
        }
      }
    });
    expect(result.score).toBe(100);
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual(["PRODUCT_TYPE_MISMATCH", "THICKNESS_MISMATCH"]);
    expect(result.autoConfirmEligible).toBe(false);
  });
});
