import { describe, expect, it } from "vitest";
import { buildRoomFurnitureStructure } from "./roomFurnitureStructure";
import type { DetailedFurnitureItem, RoomDetailExtraction } from "./types";

describe("room furniture structure", () => {
  it("groups wardrobe, shelves, and mirror from the same page into one wardrobe set", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("entry_hall_wardrobe_1", "wardrobe", "primary", [12], ["closed_cabinet"]),
        item("entry_hall_shelves_1", "shelves", "primary", [12], ["open_shelves"]),
        item("entry_hall_mirror_1", "mirror", "secondary", [12], ["mirror"])
      ])
    });

    expect(structure.furnitureGroups).toHaveLength(1);
    expect(structure.furnitureGroups[0]).toMatchObject({
      groupCategory: "wardrobe_set",
      baseCategory: "wardrobe"
    });
    expect(structure.furnitureGroups[0].modules.map((module) => module.baseCategory)).toEqual(expect.arrayContaining(["wardrobe", "shelves"]));
    expect(structure.furnitureGroups[0].associatedItems).toContainEqual(expect.objectContaining({
      category: "mirror",
      relation: "integrated"
    }));
    expect(structure.standaloneItems).toHaveLength(0);
  });

  it("groups kitchen items and keeps sink/appliance as associated items", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("kitchen_1", "kitchen", "primary", [45]),
        item("cabinet_1", "cabinet", "primary", [46]),
        item("countertop_1", "countertop", "primary", [47]),
        item("sink_1", "sink", "secondary", [46]),
        item("oven_1", "appliance", "secondary", [47])
      ], { roomType: "kitchen_living_room", sourcePageNumbers: [45, 46, 47] })
    });

    expect(structure.furnitureGroups).toHaveLength(1);
    expect(structure.furnitureGroups[0].groupCategory).toBe("kitchen_set");
    expect(structure.furnitureGroups[0].sourcePageNumbers).toEqual([45, 46, 47]);
    expect(structure.furnitureGroups[0].associatedItems.map((associated) => associated.category)).toEqual(expect.arrayContaining(["sink", "appliance"]));
  });

  it("keeps a bed standalone next to a wardrobe group", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("bedroom_wardrobe_1", "wardrobe", "primary", [30]),
        item("bedroom_bed_1", "bed", "secondary", [30])
      ], { roomType: "bedroom" })
    });

    expect(structure.furnitureGroups).toHaveLength(1);
    expect(structure.furnitureGroups[0].groupCategory).toBe("wardrobe_set");
    expect(structure.standaloneItems).toContainEqual(expect.objectContaining({ category: "bed" }));
  });

  it("creates bathroom set from vanity and associates mirror and sink", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("bathroom_vanity_1", "vanity", "primary", [21]),
        item("bathroom_mirror_1", "mirror", "secondary", [21]),
        item("bathroom_sink_1", "sink", "secondary", [21]),
        item("bathroom_toilet_1", "toilet", "secondary", [21])
      ], { roomType: "bathroom" })
    });

    expect(structure.furnitureGroups[0].groupCategory).toBe("bathroom_set");
    expect(structure.furnitureGroups[0].associatedItems.map((associated) => associated.category)).toEqual(expect.arrayContaining(["mirror", "sink"]));
    expect(structure.furnitureGroups[0].modules.map((module) => module.baseCategory)).toContain("cabinet");
  });

  it("does not create three kitchen groups for multiple pages in the same room", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("kitchen_1", "kitchen", "primary", [45]),
        item("kitchen_cabinet_1", "cabinet", "primary", [46]),
        item("kitchen_countertop_1", "countertop", "primary", [47])
      ], { roomType: "kitchen", sourcePageNumbers: [45, 46, 47] })
    });

    expect(structure.furnitureGroups).toHaveLength(1);
    expect(structure.furnitureGroups[0].sourcePageNumbers).toEqual([45, 46, 47]);
  });

  it("does not merge the same category across different rooms", () => {
    const entry = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([item("entry_hall_wardrobe_1", "wardrobe", "primary", [12])], { roomId: "entry", roomType: "entry_hall" })
    });
    const bedroom = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([item("bedroom_wardrobe_1", "wardrobe", "primary", [30])], { roomId: "bedroom", roomType: "bedroom" })
    });

    expect(entry.furnitureGroups[0].roomId).toBe("entry");
    expect(bedroom.furnitureGroups[0].roomId).toBe("bedroom");
    expect(entry.furnitureGroups[0].groupId).not.toBe(bedroom.furnitureGroups[0].groupId);
  });

  it("keeps uncertain mirror-only result low confidence without inventing wardrobe set", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([item("mirror_1", "mirror", "secondary", [9], ["mirror"])], { confidence: 0.48 })
    });

    expect(structure.furnitureGroups).toHaveLength(0);
    expect(structure.confidence).toBeLessThanOrEqual(0.45);
    expect(structure.warnings.some((warning) => warning.includes("Only mirror"))).toBe(true);
  });

  it("keeps a branded bench standalone", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("entry_hall_bench_1", "bench", "secondary", [42], ["bench"], {
          sourceTexts: ["Dvoumístná lavice FLORIANA bílá 122 cm"],
          rawDimensionTexts: ["122 cm"]
        })
      ])
    });

    expect(structure.furnitureGroups).toHaveLength(0);
    expect(structure.standaloneItems).toContainEqual(expect.objectContaining({
      category: "bench",
      rawDimensionTexts: ["122 cm"]
    }));
  });

  it("builds the expected Koubkova entry hall structure shape", () => {
    const structure = buildRoomFurnitureStructure({
      roomDetailExtraction: extractionFixture([
        item("entry_hall_wardrobe_1", "wardrobe", "primary", [41, 42], ["closed_cabinet", "open_shelves", "drawers", "mirror"], {
          materials: [
            { rawText: "EGGER U156 ST9", brand: "EGGER", code: "U156 ST9", confidence: 0.95 },
            { rawText: "EGGER H1385 ST40", brand: "EGGER", code: "H1385 ST40", confidence: 0.95 }
          ],
          rawDimensionTexts: ["1680", "2450", "600", "660"]
        }),
        item("entry_hall_mirror_1", "mirror", "secondary", [41, 42], ["mirror"]),
        item("entry_hall_bench_1", "bench", "secondary", [42], ["bench"], {
          sourceTexts: ["Dvoumístná lavice FLORIANA bílá 122 cm"],
          rawDimensionTexts: ["122 cm"]
        })
      ])
    });

    expect(structure.furnitureGroups).toHaveLength(1);
    expect(structure.furnitureGroups[0].groupCategory).toBe("wardrobe_set");
    expect(structure.furnitureGroups[0].materials.map((material) => material.rawText)).toEqual(expect.arrayContaining(["EGGER U156 ST9", "EGGER H1385 ST40"]));
    expect(structure.furnitureGroups[0].needsDeepExtraction).toBe(true);
    expect(structure.standaloneItems).toContainEqual(expect.objectContaining({ category: "bench" }));
  });
});

function extractionFixture(
  items: DetailedFurnitureItem[],
  overrides: Partial<RoomDetailExtraction> = {}
): RoomDetailExtraction {
  return {
    fileName: "project.pdf",
    roomId: "room_entry",
    roomType: "entry_hall",
    roomNameOriginal: "Predsien",
    sourcePageNumbers: [12],
    items,
    warnings: [],
    confidence: 0.86,
    ...overrides
  };
}

function item(
  itemId: string,
  category: DetailedFurnitureItem["category"],
  importance: DetailedFurnitureItem["importance"],
  sourcePageNumbers: number[],
  components: DetailedFurnitureItem["components"] = ["unknown"],
  overrides: Partial<DetailedFurnitureItem> & { rawDimensionTexts?: string[] } = {}
): DetailedFurnitureItem {
  return {
    itemId,
    displayName: itemId,
    category,
    importance,
    dimensions: {
      widthMm: null,
      heightMm: null,
      depthMm: null,
      rawDimensionTexts: overrides.rawDimensionTexts ?? []
    },
    components,
    materials: overrides.materials ?? [],
    sourcePageNumbers,
    sourceTexts: overrides.sourceTexts ?? [itemId],
    confidence: overrides.confidence ?? 0.82,
    needsHumanReview: overrides.needsHumanReview ?? false,
    reasons: overrides.reasons ?? [`test ${category}`]
  };
}
