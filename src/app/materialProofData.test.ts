import { describe, expect, it } from "vitest";
import {
  demosEntries,
  filterMaterials,
  materialPayload,
  summarizeMaterials,
  demosReferenceImageUrl,
  demosReferencePageUrl,
  type MaterialProofEntry
} from "./materialProofData";

const materials: MaterialProofEntry[] = [
  {
    catalogType: "demosDecorMapping",
    vendor: "demos",
    vendorDecorId: "demos_oak_001",
    displayName: "Oak Natural",
    materialType: "wood",
    decorFamily: "oak",
    targetInternalMaterialId: "wood_oak_neutral_template",
    surfaceProfile: "wood_standard_matte",
    colorPreviewHex: "#b98a55",
    grainColorHex: "#6f4425",
    mappingStatus: "mapped",
    mappingLocked: true,
    confidence: 0.86,
    productionSafe: true,
    usesExternalVendorTexture: false
  },
  {
    catalogType: "demosDecorMapping",
    vendor: "demos",
    vendorDecorId: "demos_walnut_002",
    displayName: "Walnut Draft",
    materialType: "wood",
    decorFamily: "walnut",
    targetInternalMaterialId: "wood_walnut_neutral_template",
    surfaceProfile: "wood_satin_lacquer",
    mappingStatus: "needs_review",
    mappingLocked: false,
    confidence: 0.4,
    productionSafe: false,
    usesExternalVendorTexture: false
  },
  {
    catalogType: "internalMaterial",
    vendorDecorId: "internal_only",
    displayName: "Internal Only"
  }
];

describe("material proof data helpers", () => {
  it("keeps only Demos mapping entries", () => {
    expect(demosEntries(materials).map((entry) => entry.vendorDecorId)).toEqual(["demos_oak_001", "demos_walnut_002"]);
  });

  it("filters by search and material fields", () => {
    const filtered = filterMaterials(demosEntries(materials), {
      query: "walnut",
      materialType: "wood",
      surfaceProfile: "wood_satin_lacquer",
      mappingStatus: "needs_review",
      productionSafe: "false"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.vendorDecorId).toBe("demos_walnut_002");
  });

  it("summarizes production and review status", () => {
    expect(summarizeMaterials(demosEntries(materials))).toMatchObject({
      total: 2,
      productionSafe: 1,
      mapped: 1,
      needsReview: 1,
      locked: 1,
      unlocked: 1
    });
  });

  it("builds selected material payload with no external vendor texture", () => {
    expect(materialPayload(materials[0]!)).toMatchObject({
      vendor: "demos",
      vendorDecorId: "demos_oak_001",
      displayName: "Oak Natural",
      targetInternalMaterialId: "wood_oak_neutral_template",
      surfaceProfile: "wood_standard_matte",
      baseColorHex: "#b98a55",
      grainColorHex: "#6f4425",
      mappingStatus: "mapped",
      mappingLocked: true,
      productionSafe: true,
      usesExternalVendorTexture: false
    });
  });

  it("lets the UI expose external vendor texture errors if catalog data is wrong", () => {
    expect(materialPayload({ ...materials[0]!, usesExternalVendorTexture: true })).toMatchObject({
      usesExternalVendorTexture: true
    });
  });

  it("detects a Demos reference URL without treating it as a texture", () => {
    expect(demosReferenceImageUrl({ demosReferenceImageUrl: "https://demos.example/images/oak.jpg" })).toBe("https://demos.example/images/oak.jpg");
    expect(demosReferencePageUrl({ sourceReference: "https://demos.example/decor/oak" })).toBe("https://demos.example/decor/oak");
    expect(materialPayload({ ...materials[0]!, demosReferenceImageUrl: "https://demos.example/images/oak.jpg", sourceReference: "https://demos.example/decor/oak" })).toMatchObject({
      demosReferenceImageUrl: "https://demos.example/images/oak.jpg",
      demosReferencePageUrl: "https://demos.example/decor/oak",
      usesExternalVendorTexture: false
    });
  });
});
