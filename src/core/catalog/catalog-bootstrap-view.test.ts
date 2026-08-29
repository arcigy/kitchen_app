import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "./catalog-bootstrap";
import { createClientCatalogBootstrapView } from "./catalog-bootstrap-view";

describe("client catalog bootstrap view", () => {
  it("omits only server-owned supplier provenance without mutating the authoritative catalog", () => {
    const seed = createSystemCatalogSeed();
    const catalog = {
      clientId: "client_bootstrap_contract",
      ...seed,
      materials: seed.materials.map((material, index) => index === 0 ? {
        ...material,
        supplierSource: {
          supplier: "supplier-a",
          supplierProductId: "material-a",
          url: "https://supplier.example/material-a",
          imageUrl: "https://supplier.example/material-a.jpg"
        }
      } : material),
      components: seed.components.map((component, index) => index === 0 ? {
        ...component,
        supplierSource: {
          supplier: "supplier-a",
          supplierProductId: "component-a",
          url: "https://supplier.example/component-a",
          imageUrl: "https://supplier.example/component-a.jpg"
        }
      } : component)
    };

    const bootstrap = createClientCatalogBootstrapView(catalog);

    expect(catalog.materials[0].supplierSource?.supplierProductId).toBe("material-a");
    expect(catalog.components[0].supplierSource?.supplierProductId).toBe("component-a");
    expect(bootstrap.materials[0].supplierSource).toBeUndefined();
    expect(bootstrap.components[0].supplierSource).toBeUndefined();
    expect({ ...bootstrap.materials[0], supplierSource: catalog.materials[0].supplierSource }).toEqual(catalog.materials[0]);
    expect({ ...bootstrap.components[0], supplierSource: catalog.components[0].supplierSource }).toEqual(catalog.components[0]);
    expect(bootstrap.priceList).toBe(catalog.priceList);
    expect(bootstrap.modules).toBe(catalog.modules);
  });
});
