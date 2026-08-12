import type { AssistantToolCall, AssistantWorkflowState } from "./types";

export const ASSISTANT_COST_POLICY = {
  maxCapabilityPacksPerTurn: 2,
  maxWorkflowSteps: 12,
  maxWorkflowIterations: 5,
  maxClientCycles: 8
} as const;

export function enforceAssistantWorkflowBudget(workflow: AssistantWorkflowState): AssistantWorkflowState {
  const steps = workflow.steps.slice(0, ASSISTANT_COST_POLICY.maxWorkflowSteps);
  const allowedIds = new Set(steps.map((step) => step.id));
  return {
    ...workflow,
    steps: steps.map((step) => ({ ...step, dependsOn: step.dependsOn.filter((id) => allowedIds.has(id)) })),
    maxIterations: Math.min(workflow.maxIterations, ASSISTANT_COST_POLICY.maxWorkflowIterations)
  };
}

export function toolCallsWithinAssistantBudget(calls: readonly AssistantToolCall[]): boolean {
  return calls.length <= ASSISTANT_COST_POLICY.maxWorkflowSteps;
}
