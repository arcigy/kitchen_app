import type { LayoutTool, SelectedKind } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import type { AppLocale } from "../i18n";
import type { ClientRole } from "../core/client/client-types";

export type AssistantRiskLevel = "low" | "medium" | "high";
export type AssistantToolOperation = "read" | "write" | "verify";
export type AssistantExecutionPhase = "answer" | "plan" | "execute" | "verify" | "complete" | "failed" | "clarify";

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
  effect: string;
  preconditions: string[];
  postconditions: string[];
  units?: Record<string, string>;
  examples: Array<Record<string, unknown>>;
  readOnly: boolean;
  riskLevel: AssistantRiskLevel;
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  operation?: AssistantToolOperation;
  domain?: string;
  tags?: string[];
  reversible?: boolean;
  verificationTools?: string[];
  minimumRole?: ClientRole;
};

export type AssistantOrchestratorToolMetadata = {
  id: string;
  title: string;
  description: string;
  ownerSystem: string;
  operation: AssistantToolOperation;
  domain: string;
  effect: string;
  preconditions: string[];
  postconditions: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  riskLevel: AssistantRiskLevel;
  requiresConfirmation: boolean;
  reversible: boolean;
  verificationTools: string[];
  tags: string[];
  minimumRole: ClientRole;
};

export type AssistantToolCall = {
  id: string;
  toolId: string;
  input: Record<string, unknown>;
  confirmed?: boolean;
};

export type AssistantCapabilityBoundary = {
  id: string;
  title: string;
  status: "available" | "partially-available" | "not-exposed";
  ownerSystem: string;
  supportedByTools: string[];
  exactBehavior: string;
  limitation?: string;
};

export type AssistantCapabilityPack = {
  id: string;
  title: string;
  domains: string[];
  keywords: string[];
  toolIds: string[];
  description: string;
};

export type AssistantCapabilityDiscovery = {
  packIds: string[];
  toolIds: string[];
  fallbackToFullRegistry: boolean;
  rationale: string;
};

export type AssistantToolResult = {
  ok: boolean;
  toolId: string;
  callId?: string;
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
  evidence?: string[];
  failedStepIds?: string[];
  repairInstruction?: string;
};

export type AssistantTaskClassification = {
  mode: "answer" | "workflow" | "clarify";
  normalizedGoal: string;
  rationale: string;
  successCriteria: string[];
  clarificationQuestion?: string;
};

export type AssistantWorkflowStep = {
  id: string;
  label: string;
  toolId: string;
  input: Record<string, unknown>;
  dependsOn: string[];
  expectedEvidence: string[];
  onFailure: "retry" | "replan" | "stop";
  riskLevel: AssistantRiskLevel;
};

export type AssistantWorkflowState = {
  workflowId: string;
  goal: string;
  successCriteria: string[];
  steps: AssistantWorkflowStep[];
  iteration: number;
  maxIterations: number;
  status: "planned" | "executing" | "verifying" | "repairing" | "complete" | "failed";
  completedStepIds: string[];
  capabilityDiscovery?: AssistantCapabilityDiscovery;
  lastError?: string;
};

export type AssistantChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

export type AssistantDebugActor = {
  kind: "client" | "controller" | "model" | "executor" | "analyzer";
  role: string;
  model: string | null;
};

export type AssistantDebugEvent = {
  id: string;
  sequence: number;
  timestamp: string;
  durationMs?: number;
  stage: string;
  status: "completed" | "failed" | "skipped";
  actor: AssistantDebugActor;
  input?: unknown;
  output?: unknown;
  error?: {
    name: string;
    message: string;
    status?: number;
    code?: string | null;
  };
};

export type AssistantDebugTraceFragment = {
  schemaVersion: "arcigy-assistant-debug.v1";
  traceId: string;
  turnId: string;
  generatedAt: string;
  rawReasoningPolicy: {
    rawChainOfThoughtAvailable: false;
    explanation: string;
  };
  events: AssistantDebugEvent[];
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
  /** UI locale selected in the current tenant session. */
  locale?: AppLocale;
  clientContext: AssistantClientContext;
  conversation?: AssistantChatMessage[];
  toolResults?: AssistantToolResult[];
  workflow?: AssistantWorkflowState | null;
  debugTraceId?: string;
  debugCycle?: number;
};

export type AssistantTurnResponse = {
  ok: true;
  assistantMessage: string;
  plan: AssistantPlan | null;
  toolCalls: AssistantToolCall[];
  validation: AssistantValidationReport | null;
  requiresConfirmation: boolean;
  ragSources: Array<{ source: string; title: string }>;
  phase?: AssistantExecutionPhase;
  classification?: AssistantTaskClassification | null;
  workflow?: AssistantWorkflowState | null;
  capabilityDiscovery?: AssistantCapabilityDiscovery;
  debugTrace?: AssistantDebugTraceFragment;
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
