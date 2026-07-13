// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { waitForStableElement } from "./waitForStableElement";

describe("waitForStableElement", () => {
  it("waits for a delayed element and a stable DOM interval", async () => {
    const pending = waitForStableElement<HTMLElement>(document, ["[data-product-code]"], { timeoutMs: 200, stableForMs: 15, requireVisible: false });
    window.setTimeout(() => {
      const element = document.createElement("div");
      element.dataset.productCode = "001/A";
      document.body.append(element);
      element.textContent = "loading";
      window.setTimeout(() => { element.textContent = "ready"; }, 5);
    }, 5);
    await expect(pending).resolves.toMatchObject({ textContent: "ready" });
  });

  it("times out without returning a partial page", async () => {
    await expect(waitForStableElement(document, [".missing"], { timeoutMs: 15, stableForMs: 5, requireVisible: false }))
      .rejects.toThrow("was not found");
  });

  it("can wait until an asynchronously rendered price has text", async () => {
    const price = document.createElement("span");
    price.className = "partner-price";
    document.body.append(price);
    const pending = waitForStableElement(document, [".partner-price"], { timeoutMs: 200, stableForMs: 10, requireVisible: false, requireText: true });
    window.setTimeout(() => { price.textContent = "50,00 Kč"; }, 5);
    await expect(pending).resolves.toMatchObject({ textContent: "50,00 Kč" });
  });
});
