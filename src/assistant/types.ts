import type { LayoutTool, SelectedKind } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";

export type AssistantRiskLevel = "low" | "medium" | "high";

export type AssistantClientContext = {
  projectId: string | null;
  phaseId: string | null;
  viewMode: string;
  activeViewerTab: string;
  layoutTool: LayoutTool;
  selectedKind: SelectedKind;
  selectedKitchenGroupId: string | null;
  activeKitchenGroupId: string | null;
  selectedInstanceIds: string[];
  selectedWallIds: string[];
  selectedParams: Array<{
    id: string;
    kind: "module" | "wall" | "worktop" | "kitchenGroup" | "floor" | "column" | "section";
    label?: string;
    params?: unknown;
  }>;
  catalogSummary: {
    materialCount: number;
    componentCount: number;
    moduleCount: number;
    moduleTypes: string[];
  };
};

export type AssistantToolDefinition = {
  id: string;
  title: string;
  description: string;
  ownerSystem: string;
  readOnly: boolean;
  riskLevel: AssistantRiskLevel;
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
};

export type AssistantToolCall = {
  id: string;
  toolId: string;
  input: Record<string, unknown>;
};

export type AssistantToolResult = {
  ok: boolean;
  toolId: string;
  output?: unknown;
  error?: string;
  stateDeltaSummary?: string;
};

export type AssistantPlanStep = {
  label: string;
  toolId?: string;
  riskLevel: AssistantRiskLevel;
};

export type AssistantPlan = {
  goal: string;
  steps: AssistantPlanStep[];
  touchedObjects: string[];
  riskLevel: AssistantRiskLevel;
  requiresConfirmation: boolean;
};

export type AssistantValidationReport = {
  confidence: number;
  done: boolean;
  summary: string;
  missingChecks: string[];
  nextAction?: string;
};

export type AssistantChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

export type AssistantRagChunk = {
  id: string;
  source: string;
  title: string;
  text: string;
  tags: string[];
  updatedAt: string;
};

export type AssistantTurnRequest = {
  message: string;
  clientContext: AssistantClientContext;
  conversation?: AssistantChatMessage[];
  toolResults?: AssistantToolResult[];
};

export type AssistantTurnResponse = {
  ok: true;
  assistantMessage: string;
  plan: AssistantPlan | null;
  toolCalls: AssistantToolCall[];
  validation: AssistantValidationReport | null;
  requiresConfirmation: boolean;
  ragSources: Array<{ source: string; title: string }>;
};

export type AssistantErrorResponse = {
  ok: false;
  error: string;
};

export type AssistantPatchModuleParamsInput = {
  instanceId: string;
  patch: Partial<ModuleParams> | Record<string, unknown>;
  sourceKey?: string;
};
