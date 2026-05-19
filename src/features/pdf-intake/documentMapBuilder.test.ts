import { describe, expect, it } from "vitest";
import {
  buildDocumentMap,
  classifyDocumentMapPage,
  extractPageTitle,
  normalizeFloorLabel
} from "./documentMapBuilder";
import type { PageReviewItem, PageType } from "./types";

describe("Document Map Builder v1", () => {
  it("classifies Koubkova furniture floor plan 1", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(1, "ПЛАН МЕБЕЛИ 1 ЭТАЖ")] });

    expect(map.pages[0].pageType).toBe("furniture_floor_plan");
    expect(map.pages[0].floorId).toBe("floor_1");
    expect(map.pages[0].isPrimaryFurniturePlan).toBe(true);
  });

  it("classifies Koubkova furniture floor plan 2", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(2, "ПЛАН МЕБЕЛИ 2 ЭТАЖ")] });

    expect(map.pages[0].pageType).toBe("furniture_floor_plan");
    expect(map.pages[0].floorId).toBe("floor_2");
  });

  it("classifies measurement floor plan", () => {
    const result = classifyDocumentMapPage("ОБМЕРНЫЙ ПЛАН 1 ЭТАЖ");

    expect(result.pageType).toBe("measurement_floor_plan");
    expect(normalizeFloorLabel("ОБМЕРНЫЙ ПЛАН 1 ЭТАЖ").floorId).toBe("floor_1");
  });

  it("classifies real Russian measured floor plan text", () => {
    const result = classifyDocumentMapPage("ОБМЕРНЫЙ ПЛАН 1 ЭТАЖ");

    expect(result.pageType).toBe("measurement_floor_plan");
    expect(result.documentKind).toBe("measurement_plan");
    expect(normalizeFloorLabel("ОБМЕРНЫЙ ПЛАН 1 ЭТАЖ").floorId).toBe("floor_1");
  });

  it("classifies multilingual measured floor plan title variants", () => {
    const samples = [
      "Zameranie 1.NP",
      "Povodny stav - podorys",
      "Existing conditions floor plan",
      "Bestandsplan EG",
      "Aufmassplan 1.OG",
      "ПЛАН ОБМЕРА 2 ЭТАЖ"
    ];

    for (const sample of samples) {
      expect(classifyDocumentMapPage(sample).pageType).toBe("measurement_floor_plan");
    }
  });

  it("does not classify installation drawings as measured floor plans", () => {
    const result = classifyDocumentMapPage("ПЛАН МОНТАЖА 1 ЭТАЖ");

    expect(result.pageType).toBe("technical_floor_plan");
    expect(result.technicalSubtype).toBe("installation");
  });

  it("classifies plumbing plan as technical", () => {
    const result = classifyDocumentMapPage("ПЛАН САНТЕХНИКИ 1 ЭТАЖ");

    expect(result.pageType).toBe("technical_floor_plan");
    expect(result.technicalSubtype).toBe("plumbing");
  });

  it("classifies sockets plan as technical", () => {
    const result = classifyDocumentMapPage("ПЛАН РОЗЕТОК 2 ЭТАЖ");

    expect(result.pageType).toBe("technical_floor_plan");
    expect(result.technicalSubtype).toBe("sockets");
  });

  it("classifies furniture technical sheet and room hint", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(6, "СХЕМА МЕБЕЛИ ПРИХОЖАЯ")] });

    expect(map.pages[0].pageType).toBe("furniture_technical_sheet");
    expect(map.pages[0].roomHints).toContain("entry_hall");
  });

  it("classifies visualization and room hint", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(7, "ВИЗУАЛИЗАЦИЯ СПАЛЬНЯ")] });

    expect(map.pages[0].pageType).toBe("visualization");
    expect(map.pages[0].roomHints).toContain("bedroom");
  });

  it("extracts Koubkova floor 1 column block rooms", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(8, [
      "ПЛАН МЕБЕЛИ 1 ЭТАЖ",
      "№",
      "01",
      "02",
      "03",
      "04",
      "Наименование",
      "Прихожая",
      "Коридор-лестница",
      "Гостевой WC",
      "Кухня-гостиная",
      "M²",
      "6,19",
      "7,73",
      "3,64",
      "27,96",
      "45,52 м²"
    ].join("\n"))] });

    expect(map.floors[0].rooms).toHaveLength(4);
    expect(map.floors[0].rooms.map((room) => [room.roomNumber, room.roomType, room.knownParameters.areaM2])).toEqual([
      ["01", "entry_hall", 6.19],
      ["02", "corridor_stairs", 7.73],
      ["03", "guest_wc", 3.64],
      ["04", "kitchen_living_room", 27.96]
    ]);
  });

  it("extracts Koubkova floor 2 column block rooms", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(9, [
      "ПЛАН МЕБЕЛИ 2 ЭТАЖ",
      "№",
      "01",
      "02",
      "03",
      "04",
      "05",
      "Наименование",
      "Спальня",
      "Кабинет",
      "Детская",
      "Ванная комната",
      "Котельная-прачечная",
      "M²",
      "10,24",
      "13,70",
      "11,61",
      "6,73",
      "2,67",
      "44,95 м²"
    ].join("\n"))] });

    expect(map.floors[0].rooms).toHaveLength(5);
    expect(map.floors[0].rooms.map((room) => room.roomType)).toEqual(["bedroom", "office", "children_room", "bathroom", "utility_laundry"]);
  });

  it("extracts mixed room table rows", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(10, "ПЛАН МЕБЕЛИ 2 ЭТАЖ\n1 470 350 02 Кабинет 13,70")] });

    expect(map.floors[0].rooms[0].roomNumber).toBe("02");
    expect(map.floors[0].rooms[0].roomType).toBe("office");
    expect(map.floors[0].rooms[0].knownParameters.areaM2).toBe(13.7);
  });

  it("handles German furniture plan", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(11, "Möbelplan EG Küche Wohnzimmer")] });

    expect(map.pages[0].pageType).toBe("furniture_floor_plan");
    expect(map.pages[0].floorId).toBe("floor_1");
    expect(map.pages[0].roomHints).toContain("kitchen_living_room");
  });

  it("handles English furniture layout", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(12, "Furniture Layout 2nd Floor Bedroom")] });

    expect(map.pages[0].pageType).toBe("furniture_floor_plan");
    expect(map.pages[0].floorId).toBe("floor_2");
    expect(map.pages[0].roomHints).toContain("bedroom");
  });

  it("does not make technical electrical pages primary furniture plans", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(13, "Elektro zásuvky vypínače 1.NP")] });

    expect(map.pages[0].pageType).toBe("technical_floor_plan");
    expect(map.pages[0].isPrimaryFurniturePlan).toBe(false);
    expect(map.floors[0].primaryFurniturePlanPages).toEqual([]);
  });

  it("stores unknown extra parameters instead of dropping them", () => {
    const map = buildDocumentMap({ fileName: "test.pdf", pages: [page(14, [
      "Pôdorys 1.NP",
      "01 Predsieň 6,2",
      "Material podlahy: dubová podlaha"
    ].join("\n"))] });

    expect(map.floors[0].rooms[0].extraParameters[0]).toMatchObject({
      keyNormalized: "floor_finish",
      valueOriginal: "dubová podlaha"
    });
  });

  it("extracts priority title and ignores metadata", () => {
    expect(extractPageTitle(["GSPublisherVersion 123", "01.01.2025", "СХЕМА МЕБЕЛИ ПРИХОЖАЯ"].join("\n"))).toBe("СХЕМА МЕБЕЛИ ПРИХОЖАЯ");
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
