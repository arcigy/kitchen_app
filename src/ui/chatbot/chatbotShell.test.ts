import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AssistantToolDefinition, AssistantTurnResponse } from "../../assistant/types";
import { shouldRenderAssistantPlan } from "./chatbotShell";

function response(toolId: string, requiresConfirmation = false): Pick<AssistantTurnResponse, "plan" | "requiresConfirmation"> {
  return {
    requiresConfirmation,
    plan: {
      goal: "Test",
      riskLevel: requiresConfirmation ? "high" : "low",
      requiresConfirmation,
      touchedObjects: [],
      steps: [{ label: "Step", toolId, riskLevel: requiresConfirmation ? "high" : "low" }]
    }
  };
}

const definitions = [
  { id: "project.getMetadata", readOnly: true },
  { id: "project.save", readOnly: false }
] as AssistantToolDefinition[];

describe("chatbot plan presentation", () => {
  it("keeps simple read-only questions conversational instead of showing a plan card", () => {
    expect(shouldRenderAssistantPlan(response("project.getMetadata"), definitions)).toBe(false);
  });

  it("still shows mutation and confirmation plans", () => {
    expect(shouldRenderAssistantPlan(response("project.save"), definitions)).toBe(true);
    expect(shouldRenderAssistantPlan(response("project.getMetadata", true), definitions)).toBe(true);
  });

  it("keeps a visible debug JSON copy control in the assistant header", () => {
    const source = readFileSync(new URL("./chatbotShell.ts", import.meta.url), "utf8");
    expect(source).toContain('data-chatbot-copy-debug');
    expect(source).toContain('serializeAssistantDebugTrace(state.debugTrace)');
  });
});
