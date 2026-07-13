// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { captureDiagnosticField, createDiagnosticExport, MAX_DIAGNOSTIC_EXPORT_BYTES, sanitizeDiagnosticElement } from "./diagnosticSanitizer";

describe("supplier diagnostic sanitizer", () => {
  it("keeps only approved attributes and redacts sensitive text", () => {
    document.body.innerHTML = `<section data-zone="product"><div id="price" class="amount primary" data-kind="gross" data-session-token="secret" aria-label="Price" title="not exported">Contact user@example.com Bearer abcdefghijklmnop</div></section>`;
    const element = document.getElementById("price")!;
    const snapshot = sanitizeDiagnosticElement(element);
    expect(snapshot.attributes).toEqual({ id: "price", class: "amount primary", "data-kind": "gross", "aria-label": "Price" });
    expect(snapshot.textContent).toContain("[redacted-email]");
    expect(snapshot.textContent).toContain("Bearer [redacted]");
    expect(snapshot.attributes).not.toHaveProperty("title");
    expect(snapshot.attributes).not.toHaveProperty("data-session-token");
  });

  it("never captures password values and exports only pathname context", () => {
    history.replaceState({}, "", "/product/board-1?account=private");
    document.body.innerHTML = `<div><input id="password" type="password" value="top-secret"/></div>`;
    const capture = captureDiagnosticField(document.getElementById("password")!, "productName", "product", "0.1.0");
    expect(capture.selected.textContent).toBe("");
    expect(capture.pathname).toBe("/product/board-1");
    const exported = createDiagnosticExport({ pageType: "product", extensionVersion: "0.1.0", fields: { productName: capture } });
    expect(exported.bytes).toBeLessThan(MAX_DIAGNOSTIC_EXPORT_BYTES);
    expect(exported.json).not.toContain("top-secret");
    expect(exported.json).not.toContain("account=private");
  });
});
