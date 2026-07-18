import { describe, expect, it } from "vitest";
import { planEnabledClientSuppliers } from "./supplier-assignment-plan";

describe("client supplier enable plan", () => {
  it("enables requested active suppliers while preserving unrelated tenant assignments", () => {
    expect(planEnabledClientSuppliers({
      activeSupplierIds: ["demos", "hranipex", "jaf_holz"],
      currentAssignments: [{ supplierId: "demos", enabled: true }, { supplierId: "hranipex", enabled: false }],
      requestedSupplierIds: ["demos", "hranipex"]
    })).toEqual({
      requestedSupplierIds: ["demos", "hranipex"],
      enableSupplierIds: ["hranipex"],
      alreadyEnabledSupplierIds: ["demos"]
    });
  });

  it("rejects a typo or inactive supplier instead of creating a broken tenant assignment", () => {
    expect(() => planEnabledClientSuppliers({
      activeSupplierIds: ["demos"],
      currentAssignments: [],
      requestedSupplierIds: ["unknown"]
    })).toThrow(/not active/i);
  });
});
