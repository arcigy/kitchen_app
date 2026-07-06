import type { AssistantToolDefinition } from "./types";

export const ASSISTANT_TOOL_DEFINITIONS: AssistantToolDefinition[] = [
  {
    id: "context.getSelection",
    title: "Read current selection",
    description: "Reads active view, selected objects and selected parameters from the live editor.",
    ownerSystem: "editor-context",
    readOnly: true,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "module.patchSelectedParams",
    title: "Patch selected module parameters",
    description: "Updates parameters on selected kitchen module instances through the existing rebuild path.",
    ownerSystem: "module-editor",
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        instanceIds: { type: "array", items: { type: "string" } },
        patch: { type: "object" },
        sourceKey: { type: "string" }
      },
      required: ["instanceIds", "patch"],
      additionalProperties: false
    }
  },
  {
    id: "vendorCatalog.insertResolvedModule",
    title: "Insert resolved PINO module",
    description: "Inserts one exact tenant-scoped PINO/Nobilia module that was already resolved from the user's text description.",
    ownerSystem: "vendor-catalog-assistant",
    readOnly: false,
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        catalogKey: { type: "string" },
        productTemplateId: { type: "string" },
        productTemplateName: { type: "string" },
        moduleType: { type: "string" },
        modulePackageId: { type: "string" },
        initialParams: { type: "object" }
      },
      required: ["catalogKey", "productTemplateId", "moduleType", "modulePackageId", "initialParams"],
      additionalProperties: false
    }
  }
];

export function getAssistantToolDefinition(toolId: string): AssistantToolDefinition | null {
  return ASSISTANT_TOOL_DEFINITIONS.find((tool) => tool.id === toolId) ?? null;
}

export function assistantToolSummary(): string {
  return ASSISTANT_TOOL_DEFINITIONS
    .map((tool) => `${tool.id}: ${tool.description} risk=${tool.riskLevel} confirm=${tool.requiresConfirmation}`)
    .join("\n");
}
