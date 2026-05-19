import { describe, expect, it } from "vitest";
import { buildRoomDetailExtraction, extractDimensions, extractMaterials } from "./roomDetailExtraction";
import type { PageReviewItem, ProjectContext, RoomFurnitureInventory } from "./types";

describe("room detail extraction", () => {
  it("builds entry hall detailed items from assigned inventory and source pages", () => {
    const extraction = buildRoomDetailExtraction({
      fileName: "koubkova.pdf",
      context: contextFixture(),
      inventory: inventoryFixture(),
      pages: pagesFixture(),
      roomType: "entry_hall"
    });

    expect(extraction.roomType).toBe("entry_hall");
    expect(extraction.sourcePageNumbers).toEqual([3, 12]);
    expect(extraction.items).toHaveLength(3);
    expect(extraction.items[0]).toMatchObject({
      itemId: "entry_hall_wardrobe_1",
      category: "wardrobe",
      importance: "primary",
      components: expect.arrayContaining(["closed_cabinet", "hanger_section"])
    });
    expect(extraction.items[0].dimensions).toMatchObject({
      widthMm: 1800,
      depthMm: 600,
      heightMm: 2400
    });
    expect(extraction.items[0].materials[0]).toMatchObject({
      brand: "EGGER",
      code: "H1180"
    });
    expect(extraction.items.map((item) => item.category)).toContain("shelves");
  });

  it("marks primary items without dimensions or materials for human review", () => {
    const inventory = inventoryFixture();
    inventory.rooms[0].items[0].sourcePageNumbers = [99];

    const extraction = buildRoomDetailExtraction({
      fileName: "koubkova.pdf",
      context: contextFixture(),
      inventory,
      pages: pagesFixture(),
      roomType: "entry_hall"
    });

    expect(extraction.items[0].needsHumanReview).toBe(true);
    expect(extraction.warnings.some((warning) => warning.includes("needs human review"))).toBe(true);
  });

  it("extracts dimensions from text labels", () => {
    expect(extractDimensions("width 1200 height 2100 depth 580")).toMatchObject({
      widthMm: 1200,
      heightMm: 2100,
      depthMm: 580
    });
  });

  it("extracts material lines", () => {
    const materials = extractMaterials("Материал ЛДСП EGGER H1180 Dub Halifax\nother line");

    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({
      brand: "EGGER",
      code: "H1180"
    });
  });
});

function contextFixture(): ProjectContext {
  return {
    floors: [],
    rooms: [
      {
        id: "room_entry",
        type: "entry_hall",
        functions: ["entry_hall"],
        roomNumber: "01",
        nameOriginal: "Прихожая",
        floorId: "floor_1",
        pageNumbers: [3, 12],
        confidence: 0.9,
        reasons: []
      }
    ],
    furniture: [],
    unassignedPages: []
  };
}

function inventoryFixture(): RoomFurnitureInventory {
  return {
    fileName: "koubkova.pdf",
    rooms: [
      {
        roomId: "room_entry",
        roomNumber: "01",
        roomNameOriginal: "Прихожая",
        roomType: "entry_hall",
        floorId: "floor_1",
        sourcePageNumbers: [3, 12],
        confidence: 0.85,
        warnings: [],
        items: [
          {
            itemId: "entry_hall_wardrobe_1",
            displayName: "Entry Hall Wardrobe 1",
            category: "wardrobe",
            importance: "primary",
            roomId: "room_entry",
            floorId: "floor_1",
            sourcePageNumbers: [12],
            sourceTexts: ["СХЕМА МЕБЕЛИ ПРИХОЖАЯ шкаф"],
            confidence: 0.8,
            reasons: ["dictionary: шкаф"],
            status: "detected"
          },
          {
            itemId: "entry_hall_mirror_1",
            displayName: "Entry Hall Mirror 1",
            category: "mirror",
            importance: "secondary",
            roomId: "room_entry",
            floorId: "floor_1",
            sourcePageNumbers: [12],
            sourceTexts: ["зеркало"],
            confidence: 0.76,
            reasons: ["dictionary: зеркало"],
            status: "detected"
          }
        ]
      }
    ],
    unassignedItems: [
      {
        itemId: "unassigned_shelves_1",
        displayName: "Unassigned Shelves 1",
        category: "shelves",
        importance: "primary",
        sourcePageNumbers: [12],
        sourceTexts: ["СХЕМА МЕБЕЛИ ПРИХОЖАЯ полки"],
        confidence: 0.72,
        reasons: ["dictionary: полки", "room assignment: unassigned"],
        status: "detected"
      }
    ],
    summary: {
      totalRooms: 1,
      totalPrimaryItems: 1,
      totalSecondaryItems: 1,
      totalUnassignedItems: 0,
      roomsWithoutFurniture: 0
    }
  };
}

function pagesFixture(): PageReviewItem[] {
  return [
    page(3, "ПЛАН МЕБЕЛИ 1 ЭТАЖ\n01 Прихожая 6,19"),
    page(12, "СХЕМА МЕБЕЛИ ПРИХОЖАЯ\nшкаф с вешалкой\n1800 x 600 x 2400\nМатериал ЛДСП EGGER H1180 Dub Halifax\nзеркало")
  ];
}

function page(pageNumber: number, extractedText: string): PageReviewItem {
  return {
    pageNumber,
    predictedType: "furniture_schedule",
    finalType: "furniture_schedule",
    confidence: 0.8,
    reasons: [],
    extractedTextPreview: extractedText.slice(0, 80),
    wasManuallyEdited: false,
    extractedText,
    thumbnailDataUrl: ""
  };
}
