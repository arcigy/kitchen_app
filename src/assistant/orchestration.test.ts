import { describe, expect, it } from "vitest";
import type { AssistantClientContext, AssistantWorkflowState } from "./types";
import { runAssistantTurn } from "./agent";
import {
  analyzePricingReadWorkflow,
  formatVerifiedAssistantResult,
  hasRemainingWorkflowSteps,
  readyWorkflowToolCalls,
  sanitizeAnalyzerCalls
} from "./orchestration";

const clientContext: AssistantClientContext = {
  projectId: "project_1",
  phaseId: "phase_1",
  viewMode: "2d",
  activeViewerTab: "floorplan",
  layoutTool: "select",
  selectedKind: null,
  selectedKitchenGroupId: null,
  activeKitchenGroupId: null,
  selectedInstanceIds: [],
  selectedWallIds: [],
  selectedParams: [],
  catalogSummary: { materialCount: 0, componentCount: 0, moduleCount: 0, moduleTypes: [] }
};

function workflow(): AssistantWorkflowState {
  return {
    workflowId: "wf_1",
    goal: "Read and validate the project.",
    successCriteria: ["Project metadata and validity are known."],
    iteration: 1,
    maxIterations: 5,
    status: "executing",
    completedStepIds: [],
    steps: [
      {
        id: "read_project",
        label: "Read project",
        toolId: "project.getMetadata",
        input: {},
        dependsOn: [],
        expectedEvidence: ["Project identity"],
        onFailure: "replan",
        riskLevel: "low"
      },
      {
        id: "validate_project",
        label: "Validate project",
        toolId: "validation.inspectProject",
        input: {},
        dependsOn: ["read_project"],
        expectedEvidence: ["No validation errors"],
        onFailure: "replan",
        riskLevel: "low"
      }
    ]
  };
}

describe("assistant workflow orchestration", () => {
  it("only releases dependency-ready atomic calls", () => {
    const state = workflow();
    expect(readyWorkflowToolCalls(state).map((call) => call.id)).toEqual(["read_project"]);
    expect(readyWorkflowToolCalls({ ...state, completedStepIds: ["read_project"] }).map((call) => call.id)).toEqual(["validate_project"]);
    expect(hasRemainingWorkflowSteps({ ...state, completedStepIds: ["read_project", "validate_project"] })).toBe(false);
  });

  it("allows the independent analyzer to request only read or verify tools", () => {
    const calls = sanitizeAnalyzerCalls({
      mode: "repair",
      confidence: 0.4,
      summary: "The write needs correction.",
      missingChecks: [],
      evidence: [],
      failedStepIds: ["patch"],
      repairInstruction: "Use a valid width.",
      nextCalls: [
        { toolId: "module.patchSelectedParams", inputJson: JSON.stringify({ instanceIds: ["module_1"], patch: { widthMm: 800 } }), reason: "repair" },
        { toolId: "context.getObject", inputJson: JSON.stringify({ kind: "module", id: "module_1" }), reason: "verify" }
      ]
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.toolId).toBe("context.getObject");
  });

  it("does not report completion while a dependent verification step remains", async () => {
    const response = await runAssistantTurn({
      message: "Skontroluj projekt.",
      clientContext,
      workflow: workflow(),
      toolResults: [{ ok: true, callId: "read_project", toolId: "project.getMetadata", output: { projectId: "project_1" } }],
      ragChunks: []
    });

    expect(response.phase).toBe("execute");
    expect(response.toolCalls).toEqual([{ id: "validate_project", toolId: "validation.inspectProject", input: {} }]);
    expect(response.workflow?.completedStepIds).toContain("read_project");
  });

  it("finishes only after every workflow step has independent evidence", async () => {
    const state = { ...workflow(), completedStepIds: ["read_project"], iteration: 2 };
    const response = await runAssistantTurn({
      message: "Skontroluj projekt.",
      clientContext,
      workflow: state,
      toolResults: [{ ok: true, callId: "validate_project", toolId: "validation.inspectProject", output: { valid: true, diagnostics: [] } }],
      ragChunks: []
    });

    expect(response.phase).toBe("complete");
    expect(response.toolCalls).toEqual([]);
    expect(response.validation?.done).toBe(true);
    expect(response.workflow?.completedStepIds).toEqual(["read_project", "validate_project"]);
  });

  it("formats exact read evidence as user-facing Markdown", () => {
    const state: AssistantWorkflowState = {
      ...workflow(),
      goal: "Zistiť počet modulov.",
      status: "complete",
      completedStepIds: ["read_project", "validate_project"]
    };
    const message = formatVerifiedAssistantResult({
      workflow: state,
      validation: { confidence: 0.9, done: true, summary: "Kontrola prešla.", missingChecks: [] },
      toolResults: [{
        ok: true,
        toolId: "context.queryObjects",
        output: { total: 4, truncated: false, objects: [] },
        stateDeltaSummary: "Queried live project objects."
      }]
    });

    expect(message).toContain("## Hotovo");
    expect(message).toContain("**Počet nájdených objektov:** 4");
    expect(message).not.toContain("context.queryObjects");
  });

  it("finishes a read-only pricing workflow with an explicit incomplete-price warning", () => {
    const state: AssistantWorkflowState = {
      ...workflow(),
      goal: "Zistiť presnú aktuálnu cenu projektu podľa BOM.",
      status: "verifying",
      steps: [{
        id: "read_price",
        label: "Read price",
        toolId: "pricing.getSummary",
        input: {},
        dependsOn: [],
        expectedEvidence: ["Current BOM-backed price"],
        onFailure: "stop",
        riskLevel: "low"
      }]
    };
    const toolResults = [{
      ok: true,
      callId: "read_price",
      toolId: "pricing.getSummary",
      output: {
        quote: {
          finalPrice: 899.42,
          marginView: { summary: { missingPriceCount: 1 } }
        },
        entities: [{
          id: "worktop_1",
          label: "Pracovná doska",
          pricingStatus: "incomplete",
          validationErrors: ["Missing price"],
          finalPrice: 0
        }]
      },
      stateDeltaSummary: "Calculated the current BOM-backed project price."
    }];

    const validation = analyzePricingReadWorkflow(state, toolResults);
    expect(validation).toMatchObject({ done: true, confidence: 0.94, missingChecks: [] });
    expect(validation?.summary).toContain("899,42 €");
    expect(validation?.summary).toContain("1 položka nemá");

    const message = formatVerifiedAssistantResult({
      workflow: { ...state, status: "complete" },
      validation: validation!,
      toolResults
    });
    expect(message).toContain("**Aktuálna vypočítaná cena:** 899,42 €");
    expect(message).toContain("**Upozornenie:** 1 položka nemá cenu");
    expect(message).toContain("Pracovná doska");
  });

  it("answers an exact project-name read as a direct conversational sentence", () => {
    const state: AssistantWorkflowState = {
      ...workflow(),
      goal: "Zistiť názov projektu.",
      status: "complete",
      steps: [{
        id: "read_name",
        label: "Read project name",
        toolId: "project.getMetadata",
        input: {},
        dependsOn: [],
        expectedEvidence: ["Project name"],
        onFailure: "stop",
        riskLevel: "low"
      }]
    };
    const message = formatVerifiedAssistantResult({
      workflow: state,
      validation: { confidence: 1, done: true, summary: "Metadata read.", missingChecks: [] },
      toolResults: [{
        ok: true,
        callId: "read_name",
        toolId: "project.getMetadata",
        output: { project: { name: "QA Kitchen Alpha" }, saveRevision: 7 }
      }]
    });

    expect(message).toBe("Tento projekt sa volá **QA Kitchen Alpha**.");
    expect(message).not.toContain("Metadata read");
  });
});
