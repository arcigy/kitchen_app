import type {
  AssistantDebugActor,
  AssistantDebugEvent,
  AssistantDebugTraceFragment
} from "./types";

const sensitiveKey = /authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret/i;

function redactSensitiveString(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',}]+/giu, "Bearer [REDACTED]")
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s"',}]+/giu, "$1[REDACTED]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/gu, "[REDACTED_API_KEY]");
}

export function redactAssistantDebugValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactSensitiveString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactAssistantDebugValue(item, seen));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitiveKey.test(key) ? "[REDACTED]" : redactAssistantDebugValue(item, seen);
  }
  return output;
}

export type AssistantDebugRecorder = {
  traceId: string;
  turnId: string;
  record: (event: {
    stage: string;
    status?: AssistantDebugEvent["status"];
    actor: AssistantDebugActor;
    durationMs?: number;
    input?: unknown;
    output?: unknown;
    error?: AssistantDebugEvent["error"];
  }) => void;
  hasModelStage: (stage: string) => boolean;
  modelForStage: (stage: string) => string | null;
  fragment: () => AssistantDebugTraceFragment;
};

function debugId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAssistantDebugRecorder(traceId?: string): AssistantDebugRecorder {
  const resolvedTraceId = traceId?.trim() || debugId("trace");
  const turnId = debugId("turn");
  const events: AssistantDebugEvent[] = [];
  return {
    traceId: resolvedTraceId,
    turnId,
    record(event) {
      events.push({
        id: `${turnId}_event_${events.length + 1}`,
        sequence: events.length + 1,
        timestamp: new Date().toISOString(),
        stage: event.stage,
        status: event.status ?? "completed",
        actor: { ...event.actor },
        ...(event.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.round(event.durationMs)) }),
        ...(event.input === undefined ? {} : { input: redactAssistantDebugValue(event.input) }),
        ...(event.output === undefined ? {} : { output: redactAssistantDebugValue(event.output) }),
        ...(event.error === undefined ? {} : { error: { ...event.error } })
      });
    },
    hasModelStage(stage) {
      return events.some((event) => event.actor.kind === "model" && event.stage === stage && event.status === "completed");
    },
    modelForStage(stage) {
      return events.find((event) =>
        event.actor.kind === "model" && event.stage === stage && event.status === "completed"
      )?.actor.model ?? null;
    },
    fragment() {
      return {
        schemaVersion: "arcigy-assistant-debug.v1",
        traceId: resolvedTraceId,
        turnId,
        generatedAt: new Date().toISOString(),
        rawReasoningPolicy: {
          rawChainOfThoughtAvailable: false,
          explanation: "OpenAI raw reasoning tokens are not exposed. This trace contains the structured model decisions, workflow, tool evidence and deterministic system actions."
        },
        events: events.map((event) => ({ ...event, actor: { ...event.actor } }))
      };
    }
  };
}
