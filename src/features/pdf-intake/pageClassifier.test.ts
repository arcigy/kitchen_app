import { describe, expect, it } from "vitest";
import { classifyPageHeuristically } from "./pageClassifier";

describe("PDF intake page classifier", () => {
  it("classifies furniture schedules", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "Vykaz nabytku" });

    expect(result.predictedType).toBe("furniture_schedule");
    expect(result.reasons).toContain("keyword: vykaz nabytku");
  });

  it("classifies furniture floor plans", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "Plan nabytku 1.NP" });

    expect(result.predictedType).toBe("floor_plan");
    expect(result.reasons).toContain("keyword: plan nabytku");
  });

  it("classifies measured floor plans without furniture", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "Podorys 1.NP steny a koty" });

    expect(result.predictedType).toBe("measurement_floor_plan");
    expect(result.reasons).toEqual(expect.arrayContaining(["keyword: podorys", "keyword: 1.np", "keyword: koty"]));
  });

  it("classifies Russian measured plans as measured floor plans", () => {
    const result = classifyPageHeuristically({ pageNumber: 3, extractedText: "ОБМЕРНЫЙ ПЛАН 1 ЭТАЖ" });

    expect(result.predictedType).toBe("measurement_floor_plan");
    expect(result.reasons).toContain("keyword: обмерный план");
  });

  it("classifies common multilingual measured plan variants", () => {
    const samples = [
      "Zameranie 1.NP",
      "Povodny stav - podorys",
      "Existing conditions floor plan",
      "Bestandsplan EG",
      "Aufmassplan 1.OG",
      "ПЛАН ОБМЕРА 2 ЭТАЖ"
    ];

    for (const extractedText of samples) {
      expect(classifyPageHeuristically({ pageNumber: 1, extractedText }).predictedType).toBe("measurement_floor_plan");
    }
  });

  it("keeps technical floor plan variants out of measured plans", () => {
    const result = classifyPageHeuristically({ pageNumber: 8, extractedText: "ПЛАН МОНТАЖА 1 ЭТАЖ podorys koty" });

    expect(result.predictedType).toBe("irrelevant");
    expect(result.reasons[0]).toContain("technical keyword");
  });

  it("classifies visualizations", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "Vizualizacia interieru" });

    expect(result.predictedType).toBe("visualization");
    expect(result.reasons).toContain("keyword: vizualizacia");
  });

  it("classifies irrelevant technical pages", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "Elektroinstalacia" });

    expect(result.predictedType).toBe("irrelevant");
    expect(result.reasons[0]).toContain("technical keyword");
  });

  it("uses keyword scoring for mixed kitchen plan text", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "podorys kuchyna skrina" });

    expect(result.predictedType).toBe("furniture_schedule");
    expect(result.reasons).toEqual(expect.arrayContaining(["keyword: kuchyna", "keyword: skrina"]));
  });

  it("classifies empty pages as low-confidence irrelevant", () => {
    const result = classifyPageHeuristically({ pageNumber: 1, extractedText: "" });

    expect(result.predictedType).toBe("irrelevant");
    expect(result.confidence).toBeLessThan(0.3);
    expect(result.reasons).toContain("no extracted text");
  });
});
