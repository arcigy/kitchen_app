import { describe, expect, it } from "vitest";
import { ASSISTANT_EVALUATION_SCENARIOS, evaluateAssistantSuite } from "./evaluationSuite";

describe("assistant evaluation suite", () => {
  it("contains more than one hundred concrete user-facing kitchen tasks", () => {
    const report = evaluateAssistantSuite();
    expect(ASSISTANT_EVALUATION_SCENARIOS.length).toBeGreaterThanOrEqual(100);
    expect(ASSISTANT_EVALUATION_SCENARIOS.every((scenario) => scenario.expectedToolIds.length >= 5 && scenario.expectedToolIds.length <= 10)).toBe(true);
    expect(report.unsafeScenarios).toEqual([]);
    expect(report.uncoveredTools).toEqual([]);
    expect(report.estimatedUsd).toBeGreaterThan(0);
    const prompts = ASSISTANT_EVALUATION_SCENARIOS.map((scenario) => scenario.prompt);
    expect(prompts).toContain("Označené spodné skrinky nahraď modulom skosený rohový modul; zachovaj materiál korpusu, prepočítaj cenu a skontroluj rohové napojenie.");
    expect(prompts).toContain("Zmeň výšku označenej kuchyne na 900 mm vrátane sokla a over všetky spodné moduly aj pracovnú dosku.");
    expect(prompts).toContain("Postav L-kuchyňu s ramenami 3000 a 2400 mm, s rohovou spodnou skrinkou, drezom, varnou doskou, dvoma hornými skrinkami a bielym korpusom.");
    expect(prompts.every((prompt) => !prompt.startsWith("Komplexne priprav"))).toBe(true);
  });
});
