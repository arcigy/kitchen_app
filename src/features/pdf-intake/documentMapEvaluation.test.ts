import { describe, expect, it } from "vitest";
import { buildDocumentMap } from "./documentMapBuilder";
import { evaluateDocumentMap } from "./documentMapEvaluation";
import type { DocumentMap, PageReviewItem, PageType } from "./types";

describe("Document Map evaluation", () => {
  it("reports page type accuracy and relevant recall", () => {
    const expected = buildDocumentMap({
      fileName: "eval.pdf",
      pages: [
        page(1, "ПЛАН МЕБЕЛИ 1 ЭТАЖ"),
        page(2, "СХЕМА МЕБЕЛИ ПРИХОЖАЯ"),
        page(3, "ПЛАН РОЗЕТОК 1 ЭТАЖ")
      ]
    });
    const generated: DocumentMap = {
      ...expected,
      pages: expected.pages.map((item) => item.pageNumber === 2 ? { ...item, pageType: "unknown" } : item)
    };

    const report = evaluateDocumentMap(generated, expected);

    expect(report.pageTypeAccuracy).toBe(0.6667);
    expect(report.relevantPageRecall).toBe(0.5);
    expect(report.falsePositiveTechnicalAsFurniture).toBe(0);
  });

  it("detects technical floorplan false positives", () => {
    const expected = buildDocumentMap({ fileName: "eval.pdf", pages: [page(1, "ПЛАН РОЗЕТОК 1 ЭТАЖ")] });
    const generated: DocumentMap = {
      ...expected,
      pages: expected.pages.map((item) => ({ ...item, pageType: "furniture_floor_plan" }))
    };

    expect(evaluateDocumentMap(generated, expected).falsePositiveTechnicalAsFurniture).toBe(1);
  });

  it("evaluates primary furniture plans per floor", () => {
    const expected = buildDocumentMap({ fileName: "eval.pdf", pages: [page(1, "ПЛАН МЕБЕЛИ 1 ЭТАЖ"), page(2, "ПЛАН МЕБЕЛИ 2 ЭТАЖ")] });
    const generated: DocumentMap = {
      ...expected,
      floors: expected.floors.map((floor) => floor.floorId === "floor_2" ? { ...floor, primaryFurniturePlanPages: [], fallbackMeasurementPlanPages: [] } : floor)
    };

    expect(evaluateDocumentMap(generated, expected).primaryFurniturePlan.missingFloorIds).toEqual(["floor_2"]);
  });

  it("evaluates room extraction and area tolerance", () => {
    const expected = buildDocumentMap({ fileName: "eval.pdf", pages: [page(1, "ПЛАН МЕБЕЛИ 1 ЭТАЖ\n01 Прихожая 6,19")] });
    const generated: DocumentMap = {
      ...expected,
      floors: expected.floors.map((floor) => ({
        ...floor,
        rooms: floor.rooms.map((room) => ({
          ...room,
          knownParameters: { ...room.knownParameters, areaM2: 6.3 }
        }))
      }))
    };

    const report = evaluateDocumentMap(generated, expected);

    expect(report.rooms.found).toBe(1);
    expect(report.rooms.roomTypeMatches).toBe(1);
    expect(report.rooms.areaMatches).toBe(1);
  });

  it("evaluates missing room links", () => {
    const expected = buildDocumentMap({
      fileName: "eval.pdf",
      pages: [
        page(1, "ПЛАН МЕБЕЛИ 1 ЭТАЖ\n01 Прихожая 6,19"),
        page(2, "СХЕМА МЕБЕЛИ ПРИХОЖАЯ")
      ]
    });
    const generated: DocumentMap = { ...expected, roomPageLinks: expected.roomPageLinks.filter((link) => !link.pageNumbers.includes(2)) };

    expect(evaluateDocumentMap(generated, expected).roomPageLinks.missing.length).toBeGreaterThan(0);
  });

  it("keeps module robust when pages are missing from generated map", () => {
    const expected = buildDocumentMap({ fileName: "eval.pdf", pages: [page(1, "Furniture Layout 2nd Floor Bedroom")] });
    const generated: DocumentMap = { ...expected, pages: [] };

    const report = evaluateDocumentMap(generated, expected);

    expect(report.evaluatedPages).toBe(0);
    expect(report.pageTypeAccuracy).toBe(0);
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
