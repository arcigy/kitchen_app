import { describe, expect, it } from "vitest";
import { applyImportedPageTypes, createEvaluationReport, createGroundTruthExport } from "./evaluation";
import type { PageReviewItem, PageType } from "./types";

describe("PDF intake evaluation", () => {
  it("computes accuracy", () => {
    const report = createEvaluationReport({
      fileName: "project.pdf",
      pages: [
        page(1, "floor_plan", "floor_plan"),
        page(2, "visualization", "irrelevant"),
        page(3, "irrelevant", "irrelevant")
      ]
    });

    expect(report.evaluatedPages).toBe(3);
    expect(report.correctCount).toBe(2);
    expect(report.wrongCount).toBe(1);
    expect(report.accuracy).toBe(0.6667);
  });

  it("builds a confusion matrix by expected and predicted types", () => {
    const report = createEvaluationReport({
      fileName: "project.pdf",
      pages: [
        page(1, "floor_plan", "floor_plan"),
        page(2, "floor_plan", "furniture_schedule"),
        page(3, "visualization", "irrelevant")
      ]
    });

    expect(report.confusionMatrix.floor_plan.floor_plan).toBe(1);
    expect(report.confusionMatrix.floor_plan.furniture_schedule).toBe(1);
    expect(report.confusionMatrix.visualization.irrelevant).toBe(1);
    expect(report.confusionMatrix.irrelevant.irrelevant).toBe(0);
  });

  it("returns mistakes with page details", () => {
    const report = createEvaluationReport({
      fileName: "project.pdf",
      pages: [
        page(5, "floor_plan", "furniture_schedule", {
          finalType: "furniture_schedule",
          reasons: ["keyword: kuchyna"]
        })
      ]
    });

    expect(report.mistakes).toEqual([
      {
        pageNumber: 5,
        expectedType: "floor_plan",
        predictedType: "furniture_schedule",
        finalType: "furniture_schedule",
        reasons: ["keyword: kuchyna"]
      }
    ]);
    expect(report.frequentErrors).toEqual([
      {
        expectedType: "floor_plan",
        predictedType: "furniture_schedule",
        count: 1
      }
    ]);
  });

  it("exports final types as ground truth", () => {
    const groundTruth = createGroundTruthExport({
      fileName: "project.pdf",
      pages: [
        page(1, "irrelevant", "irrelevant", { finalType: "floor_plan" }),
        page(2, "visualization", "visualization")
      ]
    });

    expect(groundTruth).toEqual({
      fileName: "project.pdf",
      pages: [
        { pageNumber: 1, expectedType: "floor_plan" },
        { pageNumber: 2, expectedType: "visualization" }
      ]
    });
  });

  it("ignores pages without expectedType", () => {
    const report = createEvaluationReport({
      fileName: "project.pdf",
      pages: [
        page(1, "floor_plan", "floor_plan"),
        page(2, undefined, "irrelevant")
      ]
    });

    expect(report.evaluatedPages).toBe(1);
    expect(report.correctCount).toBe(1);
    expect(report.accuracy).toBe(1);
    expect(report.confusionMatrix.irrelevant.irrelevant).toBe(0);
  });

  it("imports ground-truth JSON as final page types", () => {
    const pages = [page(1, undefined, "irrelevant"), page(2, undefined, "irrelevant")];
    const result = applyImportedPageTypes(pages, JSON.stringify({
      fileName: "project.pdf",
      pages: [{ pageNumber: 1, expectedType: "floor_plan" }]
    }));

    expect(result).toEqual({ applied: 1, skipped: 0 });
    expect(pages[0].finalType).toBe("floor_plan");
    expect(pages[0].wasManuallyEdited).toBe(true);
  });

  it("imports page-review JSON as final page types and counts skipped pages", () => {
    const pages = [page(1, undefined, "irrelevant")];
    const result = applyImportedPageTypes(pages, JSON.stringify({
      fileName: "project.pdf",
      pages: [
        { pageNumber: 1, finalType: "visualization" },
        { pageNumber: 9, finalType: "floor_plan" }
      ]
    }));

    expect(result).toEqual({ applied: 1, skipped: 1 });
    expect(pages[0].finalType).toBe("visualization");
    expect(pages[0].wasManuallyEdited).toBe(true);
  });
});

function page(
  pageNumber: number,
  expectedType: PageType | undefined,
  predictedType: PageType,
  overrides: Partial<PageReviewItem> = {}
): PageReviewItem {
  return {
    pageNumber,
    expectedType,
    predictedType,
    finalType: predictedType,
    confidence: 0.8,
    reasons: [],
    extractedText: "",
    extractedTextPreview: "",
    wasManuallyEdited: false,
    thumbnailDataUrl: "",
    ...overrides
  };
}
