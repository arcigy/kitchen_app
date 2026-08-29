// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { analyzeSupplierPage } from "./supplierPageAnalyzer";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __SUPPLIER_BRIDGE_DEBUG__: true,
    __SUPPLIER_BRIDGE_VERSION__: "test",
    __ARCIGY_ORIGINS__: ["http://127.0.0.1:5180"],
    __SUPPLIER_SIMULATOR_ORIGINS__: ["http://127.0.0.1:5192"]
  });
});

describe("sanitized supplier page analyzer", () => {
  it("keeps only origin/pathname and never exports input values or full HTML", () => {
    document.body.innerHTML = `
      <input type="search" id="catalog-search" value="customer@example.com">
      <h1 data-product-name>Board 001</h1>
      <span data-product-code>001/A</span>
      <span data-customer-price data-session-token="secret-token-value">12,50 EUR</span>
    `;
    const analysis = analyzeSupplierPage(document, new URL("https://www.demos24plus.com/product/001?account=private#price"));
    expect(analysis).toMatchObject({ supplierId: "demos", origin: "https://www.demos24plus.com", pathname: "/product/001" });
    const json = JSON.stringify(analysis);
    expect(json).not.toContain("customer@example.com");
    expect(json).not.toContain("secret-token-value");
    expect(json).not.toContain("account=private");
    expect(json).not.toContain("<h1");
  });
});
