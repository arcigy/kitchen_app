import { describe, expect, it } from "vitest";
import { MeshStandardMaterial } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { buildCatalogMaterialVisual } from "./rendering";

describe("client catalog material rendering", () => {
  it("uses client catalog legacy material data for known materials", () => {
    const catalog = getSystemSeedCatalog();
    const material = buildCatalogMaterialVisual(2, undefined, catalog);
    expect(material).toBeInstanceOf(MeshStandardMaterial);
  });

  it("uses a safe fallback for unknown material ids", () => {
    const catalog = getSystemSeedCatalog();
    catalog.legacyMaterials = [];
    const material = buildCatalogMaterialVisual(9999, undefined, catalog);
    expect(material).toBeInstanceOf(MeshStandardMaterial);
  });
});
