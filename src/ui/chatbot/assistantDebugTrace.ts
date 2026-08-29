import { redactAssistantDebugValue } from "../../assistant/debugTrace";
import type {
  AssistantClientContext,
  AssistantDebugActor,
  AssistantDebugEvent,
  AssistantDebugTraceFragment,
  AssistantToolDefinition
} from "../../assistant/types";

export type AssistantDebugTraceBundle = {
  schemaVersion: "arcigy-assistant-debug.v1";
  traceId: string;
  startedAt: string;
  completedAt: string | null;
  rawReasoningPolicy: AssistantDebugTraceFragment["rawReasoningPolicy"];
  request: {
    message: string;
    initialContext: AssistantClientContext;
    availableTools: AssistantToolDefinition[];
  };
  events: AssistantDebugEvent[];
};

function traceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAssistantDebugTraceBundle(args: {
  message: string;
  context: AssistantClientContext;
  toolDefinitions: AssistantToolDefinition[];
}): AssistantDebugTraceBundle {
  return {
    schemaVersion: "arcigy-assistant-debug.v1",
    traceId: traceId(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    rawReasoningPolicy: {
      rawChainOfThoughtAvailable: false,
      explanation: "OpenAI raw reasoning tokens are not exposed. This trace contains the structured model decisions, workflow, tool evidence and deterministic system actions."
    },
    request: redactAssistantDebugValue({
      message: args.message,
      initialContext: args.context,
      availableTools: args.toolDefinitions
    }) as AssistantDebugTraceBundle["request"],
    events: []
  };
}

export function appendAssistantDebugEvent(
  trace: AssistantDebugTraceBundle,
  event: {
    stage: string;
    status?: AssistantDebugEvent["status"];
    actor: AssistantDebugActor;
    durationMs?: number;
    input?: unknown;
    output?: unknown;
    error?: AssistantDebugEvent["error"];
  }
): void {
  trace.events.push({
    id: `${trace.traceId}_event_${trace.events.length + 1}`,
    sequence: trace.events.length + 1,
    timestamp: new Date().toISOString(),
    stage: event.stage,
    status: event.status ?? "completed",
    actor: { ...event.actor },
    ...(event.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.round(event.durationMs)) }),
    ...(event.input === undefined ? {} : { input: redactAssistantDebugValue(event.input) }),
    ...(event.output === undefined ? {} : { output: redactAssistantDebugValue(event.output) }),
    ...(event.error === undefined ? {} : { error: { ...event.error } })
  });
}

export function appendServerDebugTrace(
  trace: AssistantDebugTraceBundle,
  fragment: AssistantDebugTraceFragment | undefined
): void {
  if (!fragment || fragment.traceId !== trace.traceId) return;
  trace.rawReasoningPolicy = { ...fragment.rawReasoningPolicy };
  for (const event of fragment.events) {
    appendAssistantDebugEvent(trace, {
      stage: event.stage,
      status: event.status,
      actor: event.actor,
      durationMs: event.durationMs,
      input: event.input,
      output: event.output,
      error: event.error
    });
  }
}

export function completeAssistantDebugTrace(trace: AssistantDebugTraceBundle): void {
  trace.completedAt = new Date().toISOString();
}

export function serializeAssistantDebugTrace(trace: AssistantDebugTraceBundle): string {
  return JSON.stringify(redactAssistantDebugValue(trace), null, 2);
}
