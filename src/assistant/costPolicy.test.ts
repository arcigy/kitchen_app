import { describe, expect, it } from "vitest";
import { ASSISTANT_COST_POLICY, enforceAssistantWorkflowBudget, toolCallsWithinAssistantBudget } from "./costPolicy";
import type { AssistantWorkflowState } from "./types";

describe("assistant cost policy", () => {
  it("bounds planned work without leaving dependencies to discarded steps", () => {
    const workflow: AssistantWorkflowState = {
      workflowId: "wf_budget",
      goal: "bounded plan",
      successCriteria: [],
      iteration: 1,
      maxIterations: 99,
      status: "planned",
      completedStepIds: [],
      steps: Array.from({ length: ASSISTANT_COST_POLICY.maxWorkflowSteps + 2 }, (_, index) => ({
        id: `step_${index}`,
        label: "Read",
        toolId: "context.getSelection",
        input: {},
        dependsOn: index === 0 ? [] : [`step_${index - 1}`],
        expectedEvidence: [],
        onFailure: "stop" as const,
        riskLevel: "low" as const
      }))
    };

    const bounded = enforceAssistantWorkflowBudget(workflow);
    expect(bounded.steps).toHaveLength(ASSISTANT_COST_POLICY.maxWorkflowSteps);
    expect(bounded.maxIterations).toBe(ASSISTANT_COST_POLICY.maxWorkflowIterations);
    expect(bounded.steps.flatMap((step) => step.dependsOn)).not.toContain(`step_${ASSISTANT_COST_POLICY.maxWorkflowSteps}`);
    expect(toolCallsWithinAssistantBudget(bounded.steps.map((step) => ({ id: step.id, toolId: step.toolId, input: step.input })))).toBe(true);
  });
});
