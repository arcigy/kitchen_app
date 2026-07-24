import { describe, expect, it } from "vitest";
import type { AssistantClientContext } from "../../assistant/types";
import {
  appendAssistantDebugEvent,
  appendServerDebugTrace,
  completeAssistantDebugTrace,
  createAssistantDebugTraceBundle,
  serializeAssistantDebugTrace
} from "./assistantDebugTrace";

const context = {
  projectId: "project_a",
  phaseId: null,
  viewMode: "3d",
  activeViewerTab: "3d",
  layoutTool: "select",
  selectedKind: null,
  selectedKitchenGroupId: null,
  activeKitchenGroupId: null,
  selectedInstanceIds: [],
  selectedWallIds: [],
  selectedParams: [],
  catalogSummary: { materialCount: 0, componentCount: 0, moduleCount: 0, moduleTypes: [] }
} as AssistantClientContext;

describe("assistant debug trace", () => {
  it("combines client, server and executor events in one ordered JSON trace", () => {
    const trace = createAssistantDebugTraceBundle({ message: "Inspect", context, toolDefinitions: [] });
    appendAssistantDebugEvent(trace, {
      stage: "client_request",
      actor: { kind: "client", role: "chatbot_ui", model: null },
      input: {
        apiKey: "must-not-leak",
        providerError: "Failed at https://example.test?q=1&key=secret-value with Bearer token-value"
      }
    });
    appendServerDebugTrace(trace, {
      schemaVersion: "arcigy-assistant-debug.v1",
      traceId: trace.traceId,
      turnId: "turn_a",
      generatedAt: new Date().toISOString(),
      rawReasoningPolicy: trace.rawReasoningPolicy,
      events: [{
        id: "server_event",
        sequence: 1,
        timestamp: new Date().toISOString(),
        stage: "arcigy_task_classification",
        status: "completed",
        actor: { kind: "model", role: "communicator", model: "gpt-test" },
        output: { mode: "workflow" }
      }]
    });
    completeAssistantDebugTrace(trace);
    const parsed = JSON.parse(serializeAssistantDebugTrace(trace));
    expect(parsed.events.map((event: { sequence: number }) => event.sequence)).toEqual([1, 2]);
    expect(parsed.events[0].input.apiKey).toBe("[REDACTED]");
    expect(parsed.events[0].input.providerError).toContain("key=[REDACTED]");
    expect(parsed.events[0].input.providerError).toContain("Bearer [REDACTED]");
    expect(parsed.events[1]).toMatchObject({
      stage: "arcigy_task_classification",
      actor: { role: "communicator", model: "gpt-test" }
    });
    expect(parsed.completedAt).toEqual(expect.any(String));
  });

  it("ignores a server fragment from another trace", () => {
    const trace = createAssistantDebugTraceBundle({ message: "Inspect", context, toolDefinitions: [] });
    appendServerDebugTrace(trace, {
      schemaVersion: "arcigy-assistant-debug.v1",
      traceId: "foreign",
      turnId: "turn_b",
      generatedAt: new Date().toISOString(),
      rawReasoningPolicy: trace.rawReasoningPolicy,
      events: []
    });
    expect(trace.events).toEqual([]);
  });
});
