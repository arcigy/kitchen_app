import { describe, expect, it } from "vitest";
import { stringifySupplierBridgeJson, supplierBridgePostgresValues } from "./supplier-bridge-postgres-json";
import { supplierMappingKey } from "./supplier-bridge-repository";
import { validateSupplierCandidateSubmission } from "./supplier-bridge-validation";

describe("Supplier Bridge PostgreSQL-safe product text", () => {
  it("removes hidden NUL bytes from all validated candidate text", () => {
    const candidate = validateSupplierCandidateSubmission({
      submissionId: "capture\u0000-175718",
      syncItemId: "material-assignment:corpus",
      supplierProductCode: "175\u0000718",
      normalizedProduct: {
        displayName: "Demos product\u0000 175718",
        manufacturer: "De\u0000mos",
        decorCode: null,
        surfaceCode: null,
        productType: "board",
        thicknessMm: 18,
        widthMm: null,
        lengthMm: null,
        availability: "available"
      },
      sourcePageType: "product",
      sourcePath: "/product/175\u0000718",
      observedAt: "2026-07-18T16:53:06.499Z",
      price: null
    });

    expect(candidate.submissionId).toBe("capture-175718");
    expect(candidate.supplierProductCode).toBe("175718");
    expect(candidate.normalizedProduct.displayName).toBe("Demos product 175718");
    expect(candidate.normalizedProduct.manufacturer).toBe("Demos");
    expect(candidate.sourcePath).toBe("/product/175718");
    expect(JSON.stringify(candidate)).not.toContain("\\u0000");
  });

  it("defensively strips NUL bytes from nested PostgreSQL jsonb payloads", () => {
    const serialized = stringifySupplierBridgeJson({
      product: { displayName: "Product\u0000 name" },
      values: ["safe", "bad\u0000value"]
    });

    expect(serialized).toBe('{"product":{"displayName":"Product name"},"values":["safe","badvalue"]}');
    expect(serialized).not.toContain("\\u0000");
  });

  it("strips NUL bytes from standalone PostgreSQL column values", () => {
    expect(supplierBridgePostgresValues(
      "tenant\u0000-a",
      "submission\u0000-1",
      18,
      null
    )).toEqual(["tenant-a", "submission-1", 18, null]);
  });

  it("builds a deterministic PostgreSQL-safe material mapping key", () => {
    const key = supplierMappingKey({
      tenantId: "client_example",
      supplierId: "demos",
      manufacturer: "Egger\u0000",
      decorCode: "H3303",
      surfaceCode: "ST10",
      productType: "board",
      thicknessMm: 18
    });

    expect(key).toBe('["client_example","demos","egger","h3303","st10","board","18"]');
    expect(key).not.toContain("\u0000");
  });
});
