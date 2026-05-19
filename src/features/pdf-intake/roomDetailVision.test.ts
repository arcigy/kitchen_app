import { describe, expect, it } from "vitest";
import {
  mergeRoomDetailExtractions,
  parseRoomDetailVisionJson,
  runRoomDetailVisionExtraction,
  shouldRunVisionFallback,
  type RoomDetailVisionInput
} from "./roomDetailVision";
import type { RoomDetailExtraction } from "./types";

describe("room detail vision fallback", () => {
  it("uses mock vision response to add wardrobe, bench, and shelves", async () => {
    const result = await runRoomDetailVisionExtraction({
      textExtraction: textExtractionFixture(),
      visionInput: visionInputFixture(),
      provider: {
        async extractRoomDetail() {
          return { modelName: "mock-vision", json: JSON.stringify(visionExtractionFixture()) };
        }
      }
    });

    expect(result?.modelName).toBe("mock-vision");
    expect(result?.extraction.items.map((item) => item.category)).toEqual(expect.arrayContaining(["wardrobe", "bench", "shelves"]));
  });

  it("rejects invalid vision JSON", () => {
    expect(() => parseRoomDetailVisionJson("{bad")).toThrow("Vision room detail response must be valid JSON.");
    expect(() => parseRoomDetailVisionJson(JSON.stringify({ fileName: "x" }))).toThrow("Vision room detail response must include roomId.");
  });

  it("does not fail when provider is not configured", async () => {
    await expect(runRoomDetailVisionExtraction({
      textExtraction: textExtractionFixture(),
      visionInput: visionInputFixture()
    })).resolves.toBeNull();
  });

  it("preserves text materials and raw dimensions when merging text and vision", () => {
    const merged = mergeRoomDetailExtractions(textExtractionFixture(), visionExtractionFixture());

    const unknown = merged.items.find((item) => item.category === "unknown");
    expect(unknown?.materials.map((material) => material.rawText)).toContain("EGGER U156 ST9");
    expect(unknown?.dimensions.rawDimensionTexts).toContain("dimension numbers: 1680, 600, 2450");
  });

  it("triggers vision fallback for missing primary, unknown sheet, or all-review detail", () => {
    expect(shouldRunVisionFallback(textExtractionFixture())).toBe(true);
    expect(shouldRunVisionFallback({
      ...textExtractionFixture(),
      items: [{ ...visionExtractionFixture().items[0], needsHumanReview: false }]
    })).toBe(false);
  });
});

function textExtractionFixture(): RoomDetailExtraction {
  return {
    fileName: "koubkova.pdf",
    roomId: "room_entry",
    roomType: "entry_hall",
    roomNameOriginal: "Прихожая",
    sourcePageNumbers: [41, 42],
    items: [
      {
        itemId: "entry_hall_unknown_technical_sheet_1",
        displayName: "Entry Hall Unknown Technical Sheet 1",
        category: "unknown",
        importance: "unknown",
        dimensions: {
          widthMm: null,
          heightMm: null,
          depthMm: null,
          rawDimensionTexts: ["dimension numbers: 1680, 600, 2450"]
        },
        components: ["unknown"],
        materials: [{ rawText: "EGGER U156 ST9", brand: "EGGER", code: "U156", confidence: 0.78 }],
        sourcePageNumbers: [42],
        sourceTexts: ["СХЕМА МЕБЕЛИ ПРИХОЖАЯ"],
        confidence: 0.42,
        needsHumanReview: true,
        reasons: ["text-only unknown"]
      }
    ],
    warnings: ["unknown technical sheet"],
    confidence: 0.42
  };
}

function visionExtractionFixture(): RoomDetailExtraction {
  return {
    fileName: "koubkova.pdf",
    roomId: "room_entry",
    roomType: "entry_hall",
    roomNameOriginal: "Прихожая",
    sourcePageNumbers: [41, 42],
    items: [
      detailItem("entry_hall_wardrobe_1", "Entry Hall Wardrobe 1", "wardrobe", ["closed_cabinet", "hanger_section"]),
      detailItem("entry_hall_bench_1", "Entry Hall Bench 1", "bench", ["bench"]),
      detailItem("entry_hall_shelves_1", "Entry Hall Shelves 1", "shelves", ["open_shelves"])
    ],
    warnings: ["vision dimensions need review"],
    confidence: 0.76
  };
}

function detailItem(
  itemId: string,
  displayName: string,
  category: RoomDetailExtraction["items"][number]["category"],
  components: RoomDetailExtraction["items"][number]["components"]
): RoomDetailExtraction["items"][number] {
  return {
    itemId,
    displayName,
    category,
    importance: "primary",
    dimensions: {
      widthMm: null,
      heightMm: null,
      depthMm: null,
      rawDimensionTexts: ["1680 / 600 / 2450 visible dimension candidates"]
    },
    components,
    materials: [{ rawText: "EGGER U156 ST9", brand: "EGGER", code: "U156", confidence: 0.74 }],
    sourcePageNumbers: [42],
    sourceTexts: ["vision item"],
    confidence: 0.76,
    needsHumanReview: true,
    reasons: ["mock vision"]
  };
}

function visionInputFixture(): RoomDetailVisionInput {
  return {
    room: {
      roomId: "room_entry",
      roomType: "entry_hall",
      roomNameOriginal: "Прихожая",
      sourcePageNumbers: [41, 42]
    },
    sourcePages: [
      {
        pageNumber: 42,
        finalType: "furniture_schedule",
        imageDataUrl: "data:image/png;base64,abc",
        extractedText: "СХЕМА МЕБЕЛИ ПРИХОЖАЯ",
        title: "СХЕМА МЕБЕЛИ ПРИХОЖАЯ"
      }
    ],
    inventoryItems: [],
    relatedPages: [{ pageNumber: 42, finalType: "furniture_schedule", title: "СХЕМА МЕБЕЛИ ПРИХОЖАЯ" }]
  };
}
