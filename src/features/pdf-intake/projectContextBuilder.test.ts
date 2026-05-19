import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalization";
import { buildProjectContext, detectFloors, detectFurniture, detectRoomFunctions, detectRoomTableRows, extractRoomTable, normalizeRoom } from "./projectContextBuilder";
import type { PageReviewItem, PageType } from "./types";

describe("PDF intake project context builder", () => {
  it("normalizes latin text without transliterating cyrillic", () => {
    expect(normalizeText(" Kuchy\u0148a K\u00fcche  \u041a\u0443\u0445\u043d\u044f ")).toBe("kuchyna kuche \u043a\u0443\u0445\u043d\u044f");
  });

  it("detects Slovak rooms and furniture", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1.NP\n01 Kuchy\u0148a 12.5\n02 Sp\u00e1l\u0148a 10.0"),
        page(2, "Kuchy\u0148a skrina police", "furniture_schedule")
      ]
    });

    expect(context.floors.map((floor) => floor.id)).toContain("floor_1");
    expect(context.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["kitchen", "bedroom"]));
    expect(context.furniture.map((item) => item.type)).toEqual(expect.arrayContaining(["kitchen", "wardrobe", "shelves"]));
  });

  it("detects German context", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "2 OG\n01 Wohnzimmer 20,5\n02 Schlafzimmer 11.2"),
        page(2, "Visualisierung Schlafzimmer Schrank Bett", "visualization")
      ]
    });

    expect(context.floors.map((floor) => floor.id)).toContain("floor_2");
    expect(context.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["living_room", "bedroom"]));
    expect(context.furniture.map((item) => item.type)).toEqual(expect.arrayContaining(["wardrobe", "bed"]));
  });

  it("detects English context", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1 floor\n01 living room 18.0\n02 office 7.5"),
        page(2, "office desk chair shelves", "furniture_schedule")
      ]
    });

    expect(context.floors.map((floor) => floor.id)).toContain("floor_1");
    expect(context.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["living_room", "office"]));
    expect(context.furniture.map((item) => item.type)).toEqual(expect.arrayContaining(["desk", "chair", "shelves"]));
  });

  it("detects Russian cyrillic context", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1 \u044d\u0442\u0430\u0436\n01 \u043a\u0443\u0445\u043d\u044f 14.2\n02 \u0441\u043f\u0430\u043b\u044c\u043d\u044f 11.0"),
        page(2, "\u0412\u0438\u0437\u0443\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u0441\u043f\u0430\u043b\u044c\u043d\u044f \u0448\u043a\u0430\u0444 \u043a\u0440\u043e\u0432\u0430\u0442\u044c", "visualization")
      ]
    });

    expect(context.floors.map((floor) => floor.id)).toContain("floor_1");
    expect(context.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["kitchen", "bedroom"]));
    expect(context.furniture.map((item) => item.type)).toEqual(expect.arrayContaining(["wardrobe", "bed"]));
  });

  it("ignores floor-plan dimension noise when detecting Russian room schedules", () => {
    const firstFloorRows = [
      "01 \u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f 6,19",
      "02 \u041a\u043e\u0440\u0438\u0434\u043e\u0440-\u043b\u0435\u0441\u0442\u043d\u0438\u0446\u0430 7,73",
      "03 \u0413\u043e\u0441\u0442\u0435\u0432\u043e\u0439 WC 3,64",
      "04 \u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f 27,96",
      "3 460 350 1 290 04 \u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f 27.96",
      "1 670 1 690",
      "2 250 600 210 810 260"
    ].join("\n");
    const secondFloorRows = [
      "01 \u0421\u043f\u0430\u043b\u044c\u043d\u044f 10,24",
      "02 \u041a\u0430\u0431\u0438\u043d\u0435\u0442 13,70",
      "03 \u0414\u0435\u0442\u0441\u043a\u0430\u044f 11,61",
      "04 \u0412\u0430\u043d\u043d\u0430\u044f \u043a\u043e\u043c\u043d\u0430\u0442\u0430 6,73",
      "05 \u041a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f-\u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f 2,67"
    ].join("\n");

    const context = buildProjectContext({
      pages: [
        page(1, `1 \u044d\u0442\u0430\u0436\n${firstFloorRows}`),
        page(2, `1 \u044d\u0442\u0430\u0436\n${firstFloorRows}`),
        page(3, `2 \u044d\u0442\u0430\u0436\n${secondFloorRows}`)
      ]
    });

    expect(context.floors.map((floor) => floor.id)).toEqual(["floor_1", "floor_2"]);
    expect(context.rooms).toHaveLength(9);
    expect(context.rooms.map((room) => room.nameOriginal)).not.toContain("670 1");
    expect(context.rooms.some((room) => room.nameOriginal.includes("460 350"))).toBe(false);
    expect(context.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["entry_hall", "corridor_stairs", "guest_wc", "kitchen_living_room", "bedroom", "office", "children_room", "bathroom", "utility_laundry"]));
    expect(context.rooms.find((room) => room.nameOriginal.includes("\u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f"))?.functions).toEqual(["entry_hall"]);
    expect(context.rooms.find((room) => room.nameOriginal.includes("\u041a\u0443\u0445\u043d\u044f"))?.functions).toEqual(expect.arrayContaining(["kitchen_living_room", "kitchen", "living_room"]));
    expect(context.rooms.find((room) => room.nameOriginal.includes("\u041a\u043e\u0440\u0438\u0434\u043e\u0440"))?.functions).toEqual(expect.arrayContaining(["corridor_stairs", "hallway", "stairs"]));
    expect(context.rooms.find((room) => room.nameOriginal.includes("\u041a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f"))?.functions).toEqual(expect.arrayContaining(["utility_laundry", "boiler_room", "laundry"]));
    expect(context.rooms.every((room) => !room.area || room.area < 100)).toBe(true);
  });

  it("supports one room with multiple functions", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1.NP\n01 Kuchy\u0148a + ob\u00fdva\u010dka 27.5", "floor_plan"),
        page(2, "2 \u044d\u0442\u0430\u0436\n01 \u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f 27,96", "floor_plan"),
        page(3, "3.NP\n01 Chodba + schodisko 8,5", "floor_plan")
      ]
    });

    expect(context.rooms.map((room) => room.type)).toEqual(["kitchen_living_room", "kitchen_living_room", "corridor_stairs"]);
    expect(context.rooms[0].functions).toEqual(expect.arrayContaining(["kitchen_living_room", "kitchen", "living_room"]));
    expect(context.rooms[2].functions).toEqual(expect.arrayContaining(["corridor_stairs", "hallway", "stairs"]));
    expect(normalizeRoom("Kuchy\u0148a + ob\u00fdva\u010dka")).toBe("kitchen_living_room");
    expect(detectRoomFunctions("Kuchy\u0148a + ob\u00fdva\u010dka")).toEqual(expect.arrayContaining(["kitchen_living_room", "kitchen", "living_room"]));
    expect(detectRoomFunctions("Chodba + schodisko")).toEqual(expect.arrayContaining(["corridor_stairs", "hallway", "stairs"]));
    expect(detectRoomFunctions("\u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f")).toEqual(expect.arrayContaining(["kitchen_living_room", "kitchen", "living_room"]));
  });

  it("detects boiler room and laundry room functions", () => {
    expect(normalizeRoom("Kotol\u0148a")).toBe("boiler_room");
    expect(detectRoomFunctions("Pr\u00e1\u010dov\u0148a")).toEqual(["laundry_room"]);
    expect(detectRoomFunctions("Kotol\u0148a + pr\u00e1\u010dov\u0148a")).toEqual(["boiler_room", "laundry_room"]);
  });

  it("extracts Koubkova floor 1 column-block room table", () => {
    const result = extractRoomTable([
      "\u2116",
      "01",
      "02",
      "03",
      "04",
      "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
      "\u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f",
      "\u041a\u043e\u0440\u0438\u0434\u043e\u0440-\u043b\u0435\u0441\u0442\u043d\u0438\u0446\u0430",
      "\u0413\u043e\u0441\u0442\u0435\u0432\u043e\u0439 WC",
      "\u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f",
      "M\u00b2",
      "6,19",
      "7,73",
      "3,64",
      "27,96",
      "45,52 \u043c\u00b2"
    ].join("\n"));

    expect(result.formatDetected).toBe("column_block");
    expect(result.rooms).toHaveLength(4);
    expect(result.rooms.map((room) => [room.roomNumber, room.nameOriginal, room.areaM2, room.nameNormalized])).toEqual([
      ["01", "\u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f", 6.19, "entry_hall"],
      ["02", "\u041a\u043e\u0440\u0438\u0434\u043e\u0440-\u043b\u0435\u0441\u0442\u043d\u0438\u0446\u0430", 7.73, "corridor_stairs"],
      ["03", "\u0413\u043e\u0441\u0442\u0435\u0432\u043e\u0439 WC", 3.64, "guest_wc"],
      ["04", "\u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f", 27.96, "kitchen_living_room"]
    ]);
  });

  it("extracts Koubkova floor 2 column-block room table", () => {
    const result = extractRoomTable([
      "\u2116",
      "01",
      "02",
      "03",
      "04",
      "05",
      "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
      "\u0421\u043f\u0430\u043b\u044c\u043d\u044f",
      "\u041a\u0430\u0431\u0438\u043d\u0435\u0442",
      "\u0414\u0435\u0442\u0441\u043a\u0430\u044f",
      "\u0412\u0430\u043d\u043d\u0430\u044f \u043a\u043e\u043c\u043d\u0430\u0442\u0430",
      "\u041a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f-\u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f",
      "M\u00b2",
      "10,24",
      "13,70",
      "11,61",
      "6,73",
      "2,67",
      "44,95 \u043c\u00b2"
    ].join("\n"));

    expect(result.formatDetected).toBe("column_block");
    expect(result.rooms).toHaveLength(5);
    expect(result.rooms.map((room) => room.nameNormalized)).toEqual(["bedroom", "office", "children_room", "bathroom", "utility_laundry"]);
  });

  it("prefers complete column-block table over partial row matches", () => {
    const result = extractRoomTable([
      "01 \u0421\u043f\u0430\u043b\u044c\u043d\u044f 10,24",
      "\u2116",
      "01",
      "02",
      "03",
      "04",
      "05",
      "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
      "\u0421\u043f\u0430\u043b\u044c\u043d\u044f",
      "\u041a\u0430\u0431\u0438\u043d\u0435\u0442",
      "\u0414\u0435\u0442\u0441\u043a\u0430\u044f",
      "\u0412\u0430\u043d\u043d\u0430\u044f \u043a\u043e\u043c\u043d\u0430\u0442\u0430",
      "\u041a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f-\u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f",
      "M\u00b2",
      "10,24",
      "13,70",
      "11,61",
      "6,73",
      "2,67"
    ].join("\n"));

    expect(result.formatDetected).toBe("column_block");
    expect(result.rooms).toHaveLength(5);
    expect(result.rooms.map((room) => room.nameNormalized)).toContain("office");
  });

  it("extracts mixed room rows when dimensions appear before a room number", () => {
    const result = extractRoomTable([
      "\u041f\u041b\u0410\u041d \u041c\u0415\u0411\u0415\u041b\u0418 2 \u042d\u0422\u0410\u0416",
      "\u2116 \u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 M\u00b2",
      "01 \u0421\u043f\u0430\u043b\u044c\u043d\u044f 10,24",
      "1 470 350 02 \u041a\u0430\u0431\u0438\u043d\u0435\u0442 13,70",
      "03 \u0414\u0435\u0442\u0441\u043a\u0430\u044f 11,61",
      "04 \u0412\u0430\u043d\u043d\u0430\u044f \u043a\u043e\u043c\u043d\u0430\u0442\u0430 6,73",
      "05 \u041a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f-\u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f 2,67"
    ].join("\n"));

    expect(result.rooms).toHaveLength(5);
    expect(result.rooms.map((room) => [room.roomNumber, room.nameNormalized])).toEqual([
      ["01", "bedroom"],
      ["02", "office"],
      ["03", "children_room"],
      ["04", "bathroom"],
      ["05", "utility_laundry"]
    ]);
  });

  it("allows visualization pages to be assigned to multiple rooms", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1 floor\n01 Kitchen 12.0\n02 Bedroom 10.0", "floor_plan"),
        page(2, "Interior view", "visualization")
      ],
      pageRoomOverrides: {
        2: ["room_floor_1_01_kitchen_1200", "room_floor_1_02_bedroom_1000"]
      }
    });

    expect(context.rooms.find((room) => room.nameOriginal === "Kitchen")?.pageNumbers).toContain(2);
    expect(context.rooms.find((room) => room.nameOriginal === "Bedroom")?.pageNumbers).toContain(2);
    expect(context.unassignedPages).toEqual([]);
  });

  it("handles mixed language documents without language detection", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1.NP\n01 Kitchen 12.0\n02 Schlafzimmer 9.5"),
        page(2, "Visualisierung Schlafzimmer wardrobe \u0448\u043a\u0430\u0444", "visualization")
      ]
    });

    expect(context.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["kitchen", "bedroom"]));
    expect(context.furniture.map((item) => item.type)).toContain("wardrobe");
  });

  it("exposes focused low-level detectors", () => {
    expect(detectFloors("2 OG").map((floor) => floor.id)).toEqual(["floor_2"]);
    expect(detectRoomTableRows("01 Bad 8,3")).toEqual([{ roomNumber: "01", nameOriginal: "Bad", area: 8.3 }]);
    expect(detectRoomTableRows("3 460 350 1 290 04 \u041a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f 27.96")).toEqual([]);
    expect(detectRoomTableRows("1 670 1 690")).toEqual([]);
    expect(normalizeRoom("Kinderzimmer")).toBe("children_room");
    expect(normalizeRoom("\u041f\u0440\u0438\u0445\u043e\u0436\u0430\u044f")).toBe("entry_hall");
    expect(detectRoomFunctions("Vstupn\u00e1 hala")).toEqual(["entry_hall"]);
    expect(detectFurniture("Schreibtisch und Stuhl").map((item) => item.type)).toEqual(["desk", "chair"]);
  });

  it("builds context only from accepted relevant page types", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "01 Kitchen 12.0", "irrelevant"),
        page(2, "1 floor\n01 Office 8.0", "floor_plan"),
        page(3, "Bedroom wardrobe", "visualization")
      ]
    });

    expect(context.rooms.map((room) => room.nameOriginal)).toEqual(["Office"]);
    expect(context.rooms.map((room) => room.nameOriginal)).not.toContain("Kitchen");
    expect(context.furniture.map((item) => item.type)).toEqual(["wardrobe"]);
  });

  it("keeps floor plan pages related to multiple rooms", () => {
    const context = buildProjectContext({
      pages: [
        page(1, "1 floor\n01 Kitchen 12.0\n02 Bedroom 10.0", "floor_plan")
      ]
    });

    expect(context.rooms).toHaveLength(2);
    expect(context.rooms.every((room) => room.pageNumbers.includes(1))).toBe(true);
    expect(context.unassignedPages).toEqual([]);
  });
});

function page(pageNumber: number, extractedText: string, finalType: PageType = "floor_plan"): PageReviewItem {
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
