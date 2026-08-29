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

  it("allows a generic StrongMax hardware capture for a drawer runner without applying board thickness rules", () => {
    const result = evaluateSupplierCandidateMatch({
      item: {
        ...item,
        assignmentCategory: "runner",
        expectedProductType: "drawer_system",
        expectedThicknessMm: 18
      },
      candidate: {
        supplierProductCode: "STRONGMAX-18-H80",
        normalizedProduct: {
          displayName: "StrongMax 18 zásuvka H80",
          manufacturer: "Démos",
          decorCode: null,
          surfaceCode: null,
          productType: "other",
          thicknessMm: 18,
          widthMm: null,
          lengthMm: null,
          availability: "available"
        }
      }
    });
    expect(result.conflicts).toEqual([]);
  });

  it.each([
    ["handle", "handle"],
    ["hinge", "hinge"],
    ["lift_up", "lift_up"],
    ["leg", "leg"],
    ["fastener", "fastener"]
  ] as const)("allows generic supplier hardware for %s", (assignmentCategory, expectedProductType) => {
    const result = evaluateSupplierCandidateMatch({
      item: { ...item, assignmentCategory, expectedProductType, expectedThicknessMm: 18 },
      candidate: {
        supplierProductCode: `${assignmentCategory}-1`,
        normalizedProduct: {
          displayName: assignmentCategory,
          manufacturer: null,
          decorCode: null,
          surfaceCode: null,
          productType: "hardware",
          thicknessMm: 18,
          widthMm: null,
          lengthMm: null,
          availability: "available"
        }
      }
    });
    expect(result.conflicts).toEqual([]);
  });

  it("keeps a board candidate blocked for a runner", () => {
    const result = evaluateSupplierCandidateMatch({
      item: { ...item, assignmentCategory: "runner", expectedProductType: "drawer_system", expectedThicknessMm: null },
      candidate: {
        supplierProductCode: "BOARD-18",
        normalizedProduct: {
          displayName: "Board",
          manufacturer: null,
          decorCode: null,
          surfaceCode: null,
          productType: "board",
          thicknessMm: 18,
          widthMm: null,
          lengthMm: null,
          availability: "available"
        }
      }
    });
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual(["PRODUCT_TYPE_MISMATCH"]);
  });
});
