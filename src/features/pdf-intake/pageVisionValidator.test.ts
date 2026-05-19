import { describe, expect, it } from "vitest";
import {
  createPageVisionValidatorPrompt,
  parsePageVisionValidationJson,
  runPageVisionValidation
} from "./pageVisionValidator";
import type { PageVisionValidationInput } from "./types";

describe("page vision validator", () => {
  it("parses strict validator JSON", () => {
    const results = parsePageVisionValidationJson(JSON.stringify({
      results: [{
        pageNumber: 8,
        pageKind: "measurement_floor_plan",
        hasWalls: true,
        hasDimensionLines: true,
        hasFurniture: false,
        hasTechnicalSymbols: false,
        wallVisibility: "high",
        confidence: 0.93,
        reason: "Clean measured plan."
      }]
    }));

    expect(results[0]).toMatchObject({
      pageNumber: 8,
      pageKind: "measurement_floor_plan",
      hasWalls: true,
      hasFurniture: false
    });
  });

  it("rejects invalid JSON and invalid enum values", () => {
    expect(() => parsePageVisionValidationJson("{bad")).toThrow("valid JSON");
    expect(() => parsePageVisionValidationJson(JSON.stringify({ results: [{ pageNumber: 1, pageKind: "wall_plan" }] }))).toThrow("Invalid pageKind");
  });

  it("creates a prompt that separates furniture and measured floor plans", () => {
    const prompt = createPageVisionValidatorPrompt([page(3, "Pôdorys")]);

    expect(prompt).toContain("measurement_floor_plan");
    expect(prompt).toContain("furniture_floor_plan");
    expect(prompt).toContain("If furniture is visible");
  });

  it("runs through a provider", async () => {
    const result = await runPageVisionValidation({
      pages: [page(11, "ПЛАН МЕБЕЛИ 1 ЭТАЖ")],
      provider: {
        async validatePages() {
          return {
            modelName: "mock-flash-lite",
            json: JSON.stringify({
              results: [{
                pageNumber: 11,
                pageKind: "furniture_floor_plan",
                hasWalls: true,
                hasDimensionLines: true,
                hasFurniture: true,
                hasTechnicalSymbols: false,
                wallVisibility: "high",
                confidence: 0.94,
                reason: "Furniture symbols are visible in the plan."
              }]
            })
          };
        }
      }
    });

    expect(result.modelName).toBe("mock-flash-lite");
    expect(result.results[0].pageKind).toBe("furniture_floor_plan");
  });
});

function page(pageNumber: number, extractedText: string): PageVisionValidationInput {
  return {
    pageNumber,
    imageDataUrl: "data:image/jpeg;base64,AA==",
    extractedText,
    title: extractedText
  };
}
