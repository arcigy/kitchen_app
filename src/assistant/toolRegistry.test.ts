import { describe, expect, it } from "vitest";
import { ASSISTANT_TOOL_DEFINITIONS, assistantToolMetadataForOrchestrator, getAssistantToolDefinition } from "./toolRegistry";
import { validateAssistantToolCall, validateAssistantToolInput } from "./toolValidation";

describe("assistant tool registry", () => {
  it("publishes complete machine-readable knowledge for every tool", () => {
    expect(ASSISTANT_TOOL_DEFINITIONS).toHaveLength(40);
    expect(new Set(ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.id)).size).toBe(ASSISTANT_TOOL_DEFINITIONS.length);
    for (const tool of ASSISTANT_TOOL_DEFINITIONS) {
      expect(tool.effect.length).toBeGreaterThan(10);
      expect(tool.preconditions.length).toBeGreaterThan(0);
      expect(tool.postconditions.length).toBeGreaterThan(0);
      expect(tool.examples.length).toBeGreaterThan(0);
      expect(validateAssistantToolInput(tool, tool.examples[0])).toEqual([]);
      if (tool.riskLevel === "high") expect(tool.requiresConfirmation).toBe(true);
    }
  });

  it("gives the orchestrator compact execution and verification metadata", () => {
    const metadata = assistantToolMetadataForOrchestrator();
    expect(metadata).toHaveLength(ASSISTANT_TOOL_DEFINITIONS.length);
    expect(metadata.find((tool) => tool.id === "context.getCurrentView")).toMatchObject({
      operation: "read",
      domain: "view",
      requiresConfirmation: false,
      reversible: false
    });
    expect(metadata.find((tool) => tool.id === "module.patchSelectedParams")).toMatchObject({
      operation: "write",
      reversible: true,
      verificationTools: ["context.getObject", "validation.inspectProject"]
    });
  });

  it("rejects unknown tools and invalid or additional input fields", () => {
    expect(validateAssistantToolCall({ id: "x", toolId: "unknown.tool", input: {} }).errors[0]).toContain("not registered");
    expect(validateAssistantToolCall({ id: "x", toolId: "editor.moveSelection", input: { dxMm: 10 } }).errors).toContain("input.dzMm is required.");
    expect(validateAssistantToolCall({ id: "x", toolId: "selection.clear", input: { hidden: true } }).errors).toContain("input.hidden is not allowed.");
  });

  it("marks destructive and module-insertion tools as confirmation-gated", () => {
    for (const id of ["editor.deleteSelection", "catalog.insertModule", "vendorCatalog.insertResolvedModule"]) {
      expect(getAssistantToolDefinition(id)).toMatchObject({ riskLevel: "high", requiresConfirmation: true });
    }
  });
});
