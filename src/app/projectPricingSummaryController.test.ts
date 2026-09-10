// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { KitchenContext } from "../layout/kitchenContext";
import { createProjectPricingSummaryController } from "./projectPricingSummaryController";

function mountSummary() {
  document.body.innerHTML = `
    <section data-project-pricing-summary>
      <p data-project-pricing-state></p>
      <b data-project-pricing-final-price>—</b>
      <b data-project-pricing-item-count>—</b>
      <b data-project-pricing-missing-count>—</b>
      <button type="button" data-recalculate-project-price>Prepočítať cenu</button>
    </section>
  `;
}

describe("project pricing summary", () => {
  it("shows calculating feedback before presenting the explicit calculation result", async () => {
    mountSummary();
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const controller = createProjectPricingSummaryController({
      root: document,
      getPricingInput: () => ({
        instances: [],
        worktops: [],
        customFurniture: [],
        kitchenContext: {} as KitchenContext,
        catalog: {} as ClientCatalog,
        quoteSettings: {},
        currency: "EUR" as const
      })
    });

    await controller.recalculate();

    expect(document.querySelector("[data-project-pricing-state]")?.textContent).toBe("Cena je aktuálna.");
    expect(document.querySelector("[data-project-pricing-final-price]")?.textContent).toContain("0");
    expect(document.querySelector("[data-project-pricing-item-count]")?.textContent).toBe("0");
    expect(document.querySelector("[data-project-pricing-missing-count]")?.textContent).toBe("0");
    expect(document.querySelector<HTMLButtonElement>("[data-recalculate-project-price]")?.disabled).toBe(false);
    frame.mockRestore();
  });
});
