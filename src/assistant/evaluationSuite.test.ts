import { describe, expect, it } from "vitest";
import { ASSISTANT_EVALUATION_SCENARIOS, evaluateAssistantSuite } from "./evaluationSuite";

describe("assistant evaluation suite", () => {
  it("contains more than one hundred complex, confirmation-safe scenarios", () => {
    const report = evaluateAssistantSuite();
    expect(ASSISTANT_EVALUATION_SCENARIOS.length).toBeGreaterThanOrEqual(100);
    expect(ASSISTANT_EVALUATION_SCENARIOS.every((scenario) => scenario.expectedToolIds.length >= 5 && scenario.expectedToolIds.length <= 10)).toBe(true);
    expect(report.unsafeScenarios).toEqual([]);
    expect(report.uncoveredTools).toEqual([]);
    expect(report.estimatedUsd).toBeGreaterThan(0);
  });
});
