import { describe, expect, it } from "vitest";
import { getModuleCatalogCardPresentation } from "./moduleCatalogCardPresentation";

describe("getModuleCatalogCardPresentation", () => {
  it("uses the wider vendor layout when a catalog card includes meta text", () => {
    const presentation = getModuleCatalogCardPresentation(true);

    expect(presentation.gridClassName).toContain("module-catalog-grid-vendor");
    expect(presentation.cardClassName).toContain("module-catalog-card-vendor");
    expect(presentation.labelClassName).toBe("module-catalog-card-label");
    expect(presentation.metaClassName).toBe("module-catalog-card-meta muted");
  });

  it("keeps the compact square layout for generic package cards without meta text", () => {
    const presentation = getModuleCatalogCardPresentation(false);

    expect(presentation.gridClassName).toBe("module-catalog-grid");
    expect(presentation.cardClassName).toBe("module-catalog-card");
    expect(presentation.labelClassName).toBe("module-catalog-card-label");
  });
});
