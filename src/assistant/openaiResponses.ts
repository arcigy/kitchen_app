import { fetchExternalText } from "../server/external-http";
import type { AssistantDebugRecorder } from "./debugTrace";

export type AssistantAgentRole = "communicator" | "orchestrator" | "analyzer" | "escalation";
export type AssistantReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type AssistantModelAssignment = {
  role: AssistantAgentRole | "executor";
  model: string | null;
  reasoningEffort: AssistantReasoningEffort | null;
  purpose: string;
};

const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

export class OpenAiAssistantRequestError extends Error {
  constructor(
    public readonly role: AssistantAgentRole,
    public readonly status: number,
    public readonly providerCode: string | null
  ) {
    super(`OpenAI ${role} request failed: HTTP ${status}${providerCode ? ` (${providerCode})` : ""}`);
    this.name = "OpenAiAssistantRequestError";
  }
}

export function openAiAssistantFailureMessage(error: unknown): string | null {
  if (!(error instanceof OpenAiAssistantRequestError)) return null;
  if (error.status === 429) {
    return "OpenAI API momentálne nemá dostupný kredit alebo má vyčerpanú kvótu. Po doplnení kreditu požiadavku zopakuj.";
  }
  if (error.status === 401) return "OpenAI API kľúč bol odmietnutý. Skontroluj alebo vymeň uložený kľúč.";
  if (error.status === 403) return "OpenAI účet nemá prístup k požadovanému modelu alebo operácii.";
  if (error.status >= 500) return "OpenAI API je dočasne nedostupné. Po chvíli požiadavku zopakuj.";
  return "OpenAI API požiadavku neprijalo. Skontroluj nastavenie modelov a požiadavku zopakuj.";
}

export function getAssistantModelAssignments(): AssistantModelAssignment[] {
  return [
    {
      role: "communicator",
      model: process.env.OPENAI_ASSISTANT_COMMUNICATOR_MODEL || "gpt-5.4-nano",
      reasoningEffort: "low",
      purpose: "Low-cost task classification, clarification and final Slovak Markdown communication."
    },
    {
      role: "orchestrator",
      model: process.env.OPENAI_ASSISTANT_ORCHESTRATOR_MODEL || "gpt-5.4-mini",
      reasoningEffort: "medium",
      purpose: "Compose typed atomic tools into a dependency-aware workflow with explicit success evidence."
    },
    {
      role: "executor",
      model: null,
      reasoningEffort: null,
      purpose: "Deterministic application code validates and executes tool calls through existing editor owners."
    },
    {
      role: "analyzer",
      model: process.env.OPENAI_ASSISTANT_ANALYZER_MODEL || "gpt-5.4-nano",
      reasoningEffort: "medium",
      purpose: "Cost-efficient independent evidence review; deterministic validation remains authoritative."
    },
    {
      role: "escalation",
      model: process.env.OPENAI_ASSISTANT_ESCALATION_MODEL || "gpt-5.4-mini",
      reasoningEffort: "high",
      purpose: "Higher-effort mini replan only after repeated analyzer rejection; frontier models are opt-in overrides."
    }
  ];
}

function assignment(role: AssistantAgentRole): AssistantModelAssignment {
  const value = getAssistantModelAssignments().find((item) => item.role === role);
  if (!value || !value.model || !value.reasoningEffort) throw new Error(`Missing OpenAI model assignment for ${role}.`);
  return value;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text.trim();
  if (!Array.isArray(record.output)) return "";
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("").trim();
}

function extractReasoningSummaries(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) return [];
  const summaries: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "reasoning" || !Array.isArray(record.summary)) continue;
    for (const summary of record.summary) {
      if (!summary || typeof summary !== "object" || Array.isArray(summary)) continue;
      const text = (summary as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) summaries.push(text.trim());
    }
  }
  return summaries;
}

function extractProviderErrorCode(text: string): string | null {
  try {
    const payload = JSON.parse(text) as { error?: { code?: unknown } };
    return typeof payload.error?.code === "string" ? payload.error.code.slice(0, 120) : null;
  } catch {
    return null;
  }
}

export async function callOpenAiStructured<T>(args: {
  role: AssistantAgentRole;
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: unknown;
  debug?: AssistantDebugRecorder;
}): Promise<T | null> {
  const selected = assignment(args.role);
  const traceInput = {
    schemaName: args.schemaName,
    model: selected.model,
    reasoningEffort: selected.reasoningEffort,
    instructions: args.instructions,
    structuredInput: args.input,
    outputSchema: args.schema
  };
  if (process.env.NODE_ENV === "test" && process.env.OPENAI_ASSISTANT_TEST_LIVE !== "true") {
    args.debug?.record({
      stage: args.schemaName,
      status: "skipped",
      actor: { kind: "model", role: args.role, model: selected.model },
      input: traceInput,
      output: { reason: "Live provider calls are disabled in the test environment." }
    });
    return null;
  }
  const apiKey = process.env.OPENAI_API_KEY || process.env.openai_api_key;
  if (!apiKey) {
    args.debug?.record({
      stage: args.schemaName,
      status: "skipped",
      actor: { kind: "model", role: args.role, model: selected.model },
      input: traceInput,
      output: { reason: "OPENAI_API_KEY is not configured." }
    });
    return null;
  }
  const endpoint = process.env.OPENAI_RESPONSES_ENDPOINT || DEFAULT_OPENAI_ENDPOINT;
  const startedAt = Date.now();
  try {
    const { response, text } = await fetchExternalText(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selected.model,
        store: false,
        reasoning: { effort: selected.reasoningEffort },
        instructions: args.instructions,
        input: JSON.stringify(args.input),
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: args.schemaName,
            strict: true,
            schema: args.schema
          }
        }
      })
    }, { timeoutMs: 45_000, maxBytes: 4 * 1024 * 1024 });
    if (!response.ok) {
      throw new OpenAiAssistantRequestError(args.role, response.status, extractProviderErrorCode(text));
    }
    const payload = JSON.parse(text) as unknown;
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error(`OpenAI ${args.role} returned no structured output.`);
    const structuredOutput = JSON.parse(outputText) as T;
    const payloadRecord = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    args.debug?.record({
      stage: args.schemaName,
      actor: { kind: "model", role: args.role, model: selected.model },
      durationMs: Date.now() - startedAt,
      input: traceInput,
      output: {
        structuredOutput,
        providerResponse: {
          id: typeof payloadRecord.id === "string" ? payloadRecord.id : null,
          status: typeof payloadRecord.status === "string" ? payloadRecord.status : null,
          usage: payloadRecord.usage ?? null,
          reasoningSummaries: extractReasoningSummaries(payload),
          rawReasoningIncluded: false
        }
      }
    });
    return structuredOutput;
  } catch (error) {
    args.debug?.record({
      stage: args.schemaName,
      status: "failed",
      actor: { kind: "model", role: args.role, model: selected.model },
      durationMs: Date.now() - startedAt,
      input: traceInput,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof OpenAiAssistantRequestError
          ? { status: error.status, code: error.providerCode }
          : {})
      }
    });
    throw error;
  }
}
