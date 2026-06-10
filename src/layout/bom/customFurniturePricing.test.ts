import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { CustomFurnitureInstance } from "../customFurnitureTypes";
import { createCustomFurnitureQuoteBom } from "./customFurniturePricing";

const catalog: ClientCatalog = {
  clientId: "test",
  materials: [
    {
      id: "board.body",
      entityType: "material",
      materialType: "board",
      name: "Body board",
      displayName: "Body board",
      category: "board",
      baseMaterial: "dtd",
      decor: "grey",
      color: "grey",
      finish: "matte",
      pricingBasis: "sheet_area",
      pricingUnit: "m2",
      availableThicknessesMm: [18],
      defaultThicknessMm: 18,
      isActive: true,
      tags: [],
      preview: { colorHex: "#cccccc", roughness: 0.7, metalness: 0 },
      boardFamily: "body"
    },
    {
      id: "edge.body",
      entityType: "material",
      materialType: "edge",
      name: "Body edge",
      displayName: "Body edge",
      category: "edge",
      baseMaterial: "abs",
      decor: "grey",
      color: "grey",
      finish: "matte",
      pricingBasis: "linear_length",
      pricingUnit: "lm",
      availableThicknessesMm: [1],
      defaultThicknessMm: 1,
      isActive: true,
      tags: [],
      preview: { colorHex: "#cccccc", roughness: 0.7, metalness: 0 },
      edgeFamily: "body"
    }
  ],
  hardware: [],
  legacyMaterials: [],
  components: [],
  componentGeometry: [],
  modules: [],
  priceList: { id: "prices", name: "Prices", currency: "EUR", isActive: true, prices: { "board.body": 10, "edge.body": 1 } },
  kitchenDefaults: {},
  meta: { catalogVersion: 1, source: "system-seed", createdAt: "", updatedAt: "" }
};

const furniture: CustomFurnitureInstance = {
  id: "cf1",
  params: {
    name: "Custom",
    baseConstraint: "projectBase",
    baseOffsetMm: 0,
    topConstraint: "absolute",
    topOffsetMm: 720,
    boundary: [
      { x: 0, z: 0 },
      { x: 1000, z: 0 },
      { x: 1000, z: 500 },
      { x: 0, z: 500 }
    ],
    boards: [
      {
        id: "b1",
        name: "Board 1",
        kind: "horizontal",
        workplane: { type: "horizontal", elevationMm: 0 },
        profile: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 1000, y: 500 },
          { x: 0, y: 500 }
        ],
        thicknessMm: 18,
        materialId: "board.body",
        baseConstraint: "furnitureBase",
        baseOffsetMm: 0,
        topConstraint: "furnitureTop",
        topOffsetMm: 0,
        justification: "positive",
        edgeBanding: [{ edgeIndex: 0, materialId: "edge.body" }]
      }
    ]
  },
  root: new THREE.Group(),
  boundaryLine: new THREE.Line(),
  boardsRoot: new THREE.Group(),
  boardObjects: []
};

describe("customFurniturePricing", () => {
  it("creates board and edge banding BOM rows", () => {
    const bom = createCustomFurnitureQuoteBom(furniture, catalog);

    expect(bom.items).toHaveLength(2);
    expect(bom.items[0]).toMatchObject({ itemType: "board", pricingQuantity: 0.5, pricingUnit: "m2" });
    expect(bom.items[1]).toMatchObject({ itemType: "edge_band", pricingQuantity: 1, pricingUnit: "lm" });
  });
});
