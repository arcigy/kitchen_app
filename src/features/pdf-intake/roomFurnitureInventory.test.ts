import { describe, expect, it } from "vitest";
import { buildProjectContext } from "./projectContextBuilder";
import {
  buildRoomFurnitureInventory,
  createInventoryCleanupReview,
  evaluateRoomFurnitureInventory,
  getFurnitureImportance
} from "./roomFurnitureInventory";
import type { PageReviewItem, PageType, ProjectContext, RoomFurnitureInventory } from "./types";

describe("PDF intake room furniture inventory", () => {
  it("detects multilingual furniture categories and source room from page title", () => {
    const context = contextFromPages([
      page(1, "1 \u044d\u0442\u0430\u0436\n01 \u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f 6,19", "floor_plan"),
      page(2, "\u0421\u0425\u0415\u041c\u0410 \u041c\u0415\u0411\u0415\u041b\u0418 \u041f\u0420\u0418\u0425\u041e\u0416\u0410\u042f\n\u0437\u0435\u0440\u043a\u0430\u043b\u043e\n\u043f\u043e\u043b\u043a\u0438", "furniture_schedule")
    ]);
    const inventory = buildRoomFurnitureInventory({
      fileName: "koubkova.pdf",
      context,
      pages: [
        page(1, "1 \u044d\u0442\u0430\u0436\n01 \u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f 6,19", "floor_plan"),
        page(2, "\u0421\u0425\u0415\u041c\u0410 \u041c\u0415\u0411\u0415\u041b\u0418 \u041f\u0420\u0418\u0425\u041e\u0416\u0410\u042f\n\u0437\u0435\u0440\u043a\u0430\u043b\u043e\n\u043f\u043e\u043b\u043a\u0438", "furniture_schedule")
      ]
    });

    const entryHall = inventory.rooms.find((room) => room.roomType === "entry_hall");
    expect(entryHall?.items.map((item) => item.category)).toEqual(expect.arrayContaining(["mirror", "shelves"]));
    expect(entryHall?.items.find((item) => item.category === "mirror")?.importance).toBe("secondary");
    expect(entryHall?.items.find((item) => item.category === "shelves")?.importance).toBe("primary");
  });

  it("classifies primary and secondary furniture", () => {
    expect(getFurnitureImportance("wardrobe")).toBe("primary");
    expect(getFurnitureImportance("kitchen")).toBe("primary");
    expect(getFurnitureImportance("wall_panel")).toBe("primary");
    expect(getFurnitureImportance("mirror")).toBe("secondary");
    expect(getFurnitureImportance("bed")).toBe("secondary");
    expect(getFurnitureImportance("appliance")).toBe("secondary");
  });

  it("generates stable names and deduplicates items by category room and page", () => {
    const context = contextFromPages([
      page(1, "1 floor\n01 Entry hall 6.0", "floor_plan"),
      page(2, "SCHEME ENTRY HALL\nwardrobe wardrobe", "furniture_schedule")
    ]);
    const inventory = buildRoomFurnitureInventory({
      fileName: "demo.pdf",
      context,
      pages: [
        page(1, "1 floor\n01 Entry hall 6.0", "floor_plan"),
        page(2, "SCHEME ENTRY HALL\nwardrobe wardrobe", "furniture_schedule")
      ]
    });
    const item = inventory.rooms[0].items.find((candidate) => candidate.category === "wardrobe");

    expect(item?.itemId).toBe("entry_hall_wardrobe_1");
    expect(inventory.rooms[0].items.filter((candidate) => candidate.category === "wardrobe")).toHaveLength(1);
  });

  it("evaluates missing primary wrong room and wrong category", () => {
    const expected = inventoryFixture("expected.pdf", [
      item("entry_hall_wardrobe_1", "wardrobe", "primary", "room_1"),
      item("bedroom_bed_1", "bed", "secondary", "room_2")
    ]);
    const generated = inventoryFixture("expected.pdf", [
      item("entry_hall_cabinet_1", "cabinet", "primary", "room_2"),
      item("bedroom_bed_1", "bed", "primary", "room_2")
    ]);

    const report = evaluateRoomFurnitureInventory(generated, expected);

    expect(report.primaryItems.missing).toEqual(["entry_hall_wardrobe_1"]);
    expect(report.wrongImportance.map((entry) => entry.expectedItemId)).toContain("bedroom_bed_1");
    expect(report.readiness.level).toBe("red");
  });

  it("detects duplicate inventory groups", () => {
    const generated = inventoryFixture("demo.pdf", [
      item("entry_hall_wardrobe_1", "wardrobe", "primary", "room_1", [4], ["wardrobe tall cabinet"]),
      item("entry_hall_wardrobe_2", "wardrobe", "primary", "room_1", [5], ["wardrobe tall cabinet"]),
      item("entry_hall_bench_1", "bench", "primary", "room_1", [8], ["bench"])
    ]);
    const cleanup = createInventoryCleanupReview({
      inventory: generated,
      context: contextFixture(),
      pages: []
    });

    expect(cleanup.duplicateGroups).toHaveLength(1);
    expect(cleanup.duplicateGroups[0].items.map((candidate) => candidate.itemId)).toEqual(["entry_hall_wardrobe_1", "entry_hall_wardrobe_2"]);
    expect(cleanup.readiness.duplicateGroupCount).toBe(1);
  });

  it("computes cleanup readiness score", () => {
    const generated = inventoryFixture("demo.pdf", [
      item("unassigned_wardrobe_1", "wardrobe", "primary", undefined, [2], ["SCHEME ENTRY HALL wardrobe"])
    ]);
    const cleanup = createInventoryCleanupReview({
      inventory: generated,
      context: contextFixture(),
      pages: [page(2, "SCHEME ENTRY HALL wardrobe", "furniture_schedule")]
    });

    expect(cleanup.unassignedPrimaryItems).toHaveLength(1);
    expect(cleanup.unassignedPrimaryItems[0].suggestedRoomId).toBe("room_1");
    expect(cleanup.readiness).toMatchObject({
      unassignedPrimaryCount: 1,
      duplicateGroupCount: 0,
      roomsWithoutPrimaryCount: 2,
      readyForDetailedExtraction: false
    });
  });

  it("suggests a room from furniture category when a floor plan has multiple rooms", () => {
    const pages = [
      page(1, "1 floor\n01 Entry hall 6.0\n02 Kitchen living room 20.0\nkitchen island", "floor_plan")
    ];
    const context = buildProjectContext({ pages });
    const generated = buildRoomFurnitureInventory({
      fileName: "demo.pdf",
      context,
      pages
    });
    const cleanup = createInventoryCleanupReview({
      inventory: generated,
      context,
      pages
    });
    const kitchenSuggestion = cleanup.unassignedPrimaryItems.find((entry) => entry.item.category === "kitchen");

    expect(kitchenSuggestion?.suggestedRoomLabel).toContain("Kitchen living room");
  });

  it("respects cleanup statuses for duplicates and rooms without furniture", () => {
    const generated = inventoryFixture("demo.pdf", [
      item("entry_hall_wardrobe_1", "wardrobe", "primary", "room_1", [4], ["wardrobe tall cabinet"]),
      item("entry_hall_wardrobe_2", "wardrobe", "primary", "room_1", [5], ["wardrobe tall cabinet"])
    ]);
    const openCleanup = createInventoryCleanupReview({
      inventory: generated,
      context: contextFixture(),
      pages: []
    });
    const resolvedCleanup = createInventoryCleanupReview({
      inventory: generated,
      context: contextFixture(),
      pages: [],
      duplicateGroupStatuses: {
        [openCleanup.duplicateGroups[0].groupId]: "keep_separate"
      },
      roomCleanupStatuses: {
        room_2: "no_custom_furniture"
      }
    });

    expect(resolvedCleanup.duplicateGroups[0].status).toBe("keep_separate");
    expect(resolvedCleanup.roomsWithoutPrimary.find((room) => room.roomId === "room_2")?.status).toBe("no_custom_furniture");
    expect(resolvedCleanup.readiness).toMatchObject({
      duplicateGroupCount: 0,
      roomsWithoutPrimaryCount: 0,
      readyForDetailedExtraction: true
    });
  });
});

function contextFromPages(pages: PageReviewItem[]): ProjectContext {
  return buildProjectContext({ pages });
}

function page(pageNumber: number, extractedText: string, finalType: PageType): PageReviewItem {
  return {
    pageNumber,
    predictedType: finalType,
    finalType,
    confidence: 0.8,
    reasons: [],
    extractedText,
    extractedTextPreview: extractedText,
    wasManuallyEdited: false,
    thumbnailDataUrl: ""
  };
}

function contextFixture(): ProjectContext {
  return {
    floors: [],
    rooms: [
      {
        id: "room_1",
        type: "entry_hall",
        roomNumber: "01",
        nameOriginal: "Entry hall",
        pageNumbers: [2, 4, 5],
        confidence: 0.8,
        reasons: []
      },
      {
        id: "room_2",
        type: "bedroom",
        roomNumber: "02",
        nameOriginal: "Bedroom",
        pageNumbers: [6],
        confidence: 0.8,
        reasons: []
      }
    ],
    furniture: [],
    unassignedPages: []
  };
}

function inventoryFixture(fileName: string, items: RoomFurnitureInventory["rooms"][number]["items"]): RoomFurnitureInventory {
  return {
    fileName,
    rooms: [
      {
        roomId: "room_1",
        roomType: "entry_hall",
        items: items.filter((item) => item.roomId === "room_1"),
        sourcePageNumbers: [1],
        confidence: 0.8,
        warnings: []
      },
      {
        roomId: "room_2",
        roomType: "bedroom",
        items: items.filter((item) => item.roomId === "room_2"),
        sourcePageNumbers: [2],
        confidence: 0.8,
        warnings: []
      }
    ],
    unassignedItems: items.filter((item) => !item.roomId),
    summary: {
      totalRooms: 2,
      totalPrimaryItems: items.filter((item) => item.importance === "primary").length,
      totalSecondaryItems: items.filter((item) => item.importance === "secondary").length,
      totalUnassignedItems: items.filter((item) => !item.roomId).length,
      roomsWithoutFurniture: 0
    }
  };
}

function item(
  itemId: string,
  category: RoomFurnitureInventory["rooms"][number]["items"][number]["category"],
  importance: RoomFurnitureInventory["rooms"][number]["items"][number]["importance"],
  roomId?: string,
  sourcePageNumbers = [1],
  sourceTexts = [itemId]
): RoomFurnitureInventory["rooms"][number]["items"][number] {
  return {
    itemId,
    displayName: itemId,
    category,
    importance,
    roomId,
    sourcePageNumbers,
    sourceTexts,
    confidence: 0.8,
    reasons: [],
    status: "detected"
  };
}
