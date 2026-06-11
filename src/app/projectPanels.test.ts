import { afterEach, describe, expect, it, vi } from "vitest";
import { openPricingCatalog } from "./projectPanels";
import { FakeElement } from "./testUtils/propertiesPanelHarness";

vi.mock("../ui/pricingCatalogPanel", () => ({
  mountPricingCatalogPanel: vi.fn()
}));

describe("project panels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps pricing catalog close button behavior", () => {
    const body = new FakeElement();
    vi.stubGlobal("document", {
      body,
      createElement: () => new FakeElement()
    });

    openPricingCatalog({ modules: [], materials: [] } as never);

    const overlay = body.children[0]!;
    const panel = overlay.children[0]!;
    const header = panel.children[0]!;
    const close = header.children[1]!;
    expect(close.type).toBe("button");
    expect(close.textContent).toBe("Zavrieť");
    expect(close.className).toBe("pricing-catalog-modal__close");

    close.dispatch("click");

    expect(overlay.isConnected).toBe(false);
  });
});
