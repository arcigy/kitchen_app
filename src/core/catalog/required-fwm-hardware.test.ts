import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "./catalog-bootstrap";
import { ensureRequiredFwmHardware } from "./required-fwm-hardware";

describe("required FWM hardware catalog upgrade", () => {
  it("adds only missing component identities and geometry without inventing prices", () => {
    const catalog = { clientId: "existing-client", ...createSystemCatalogSeed() };
    const addedIds = [
      "cmp.hinge_plate.generic",
      "cmp.leg_plate.generic",
      "cmp.assembly_pack.generic",
      "cmp.hanging_bracket.wall.standard",
      "cmp.shelf_support.standard.nickel"
    ];
    catalog.components = catalog.components.filter((component) => !addedIds.includes(component.id));
    catalog.componentGeometry = catalog.componentGeometry.filter((geometry) => !geometry.id.endsWith(".generic") && !geometry.id.includes("hinge_bracket.wall.standard") && !geometry.id.includes("shelf_support.standard"));
    catalog.priceList.prices["existing-custom-price"] = 19;

    const upgraded = ensureRequiredFwmHardware(catalog);
    expect(upgraded.components.map((component) => component.id)).toEqual(expect.arrayContaining(addedIds));
    expect(upgraded.priceList.prices).toEqual(catalog.priceList.prices);
    expect(upgraded.priceList.prices).not.toHaveProperty("cmp.hinge_plate.generic");
    expect(upgraded.priceList.prices).not.toHaveProperty("cmp.leg_plate.generic");
    expect(upgraded.priceList.prices).not.toHaveProperty("cmp.assembly_pack.generic");
    expect(ensureRequiredFwmHardware(upgraded)).toBe(upgraded);
    expect(upgraded.meta.catalogVersion).toBe(catalog.meta.catalogVersion + 1);
  });
});
