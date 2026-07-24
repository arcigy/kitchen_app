import { afterEach, describe, expect, it, vi } from "vitest";
const { fetchExternalTextMock } = vi.hoisted(() => ({ fetchExternalTextMock: vi.fn() }));
vi.mock("../server/external-http", () => ({ fetchExternalText: fetchExternalTextMock }));
import {
  callOpenAiStructured,
  getAssistantModelAssignments,
  openAiAssistantFailureMessage,
  OpenAiAssistantRequestError
} from "./openaiResponses";
import { createAssistantDebugRecorder } from "./debugTrace";

afterEach(() => {
  delete process.env.OPENAI_ASSISTANT_TEST_LIVE;
  delete process.env.OPENAI_API_KEY;
  fetchExternalTextMock.mockReset();
});

describe("OpenAI assistant model routing", () => {
  it("uses smaller models for communication and routine orchestration, with deterministic execution", () => {
    const assignments = getAssistantModelAssignments();
    expect(assignments.find((item) => item.role === "communicator")).toMatchObject({ model: "gpt-5.4-nano", reasoningEffort: "low" });
    expect(assignments.find((item) => item.role === "orchestrator")).toMatchObject({ model: "gpt-5.4-mini", reasoningEffort: "medium" });
    expect(assignments.find((item) => item.role === "analyzer")).toMatchObject({ model: "gpt-5.4-nano", reasoningEffort: "medium" });
    expect(assignments.find((item) => item.role === "escalation")).toMatchObject({ model: "gpt-5.4-mini", reasoningEffort: "high" });
    expect(assignments.find((item) => item.role === "executor")).toMatchObject({ model: null, reasoningEffort: null });
  });

  it("does not make live OpenAI calls during ordinary tests", async () => {
    await expect(callOpenAiStructured({
      role: "communicator",
      schemaName: "test",
      schema: { type: "object" },
      instructions: "test",
      input: {}
    })).resolves.toBeNull();
    expect(fetchExternalTextMock).not.toHaveBeenCalled();
  });

  it("sends strict structured workflow inputs through the Responses API", async () => {
    process.env.OPENAI_ASSISTANT_TEST_LIVE = "true";
    process.env.OPENAI_API_KEY = "test-only-key";
    fetchExternalTextMock.mockResolvedValue({
      response: { ok: true, status: 200 },
      text: JSON.stringify({ output_text: JSON.stringify({ mode: "workflow" }) })
    });

    const debug = createAssistantDebugRecorder("trace_test");
    await expect(callOpenAiStructured<{ mode: string }>({
      role: "orchestrator",
      schemaName: "workflow_test",
      schema: { type: "object", properties: { mode: { type: "string" } }, required: ["mode"], additionalProperties: false },
      instructions: "Compose atomic tools.",
      input: { goal: "Inspect project" },
      debug
    })).resolves.toEqual({ mode: "workflow" });

    const [url, init, limits] = fetchExternalTextMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer test-only-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      store: false,
      reasoning: { effort: "medium" },
      instructions: "Compose atomic tools.",
      text: { verbosity: "low", format: { type: "json_schema", name: "workflow_test", strict: true } }
    });
    expect(body.reasoning).not.toHaveProperty("context");
    expect(JSON.parse(body.input)).toEqual({ goal: "Inspect project" });
    expect(limits).toMatchObject({ timeoutMs: 45_000 });
    expect(debug.fragment().events).toEqual([
      expect.objectContaining({
        stage: "workflow_test",
        actor: { kind: "model", role: "orchestrator", model: "gpt-5.4-mini" },
        output: expect.objectContaining({
          structuredOutput: { mode: "workflow" },
          providerResponse: expect.objectContaining({ rawReasoningIncluded: false })
        })
      })
    ]);
    expect(JSON.stringify(debug.fragment())).not.toContain("test-only-key");
  });

  it("reports quota failures without exposing provider response text or credentials", async () => {
    process.env.OPENAI_ASSISTANT_TEST_LIVE = "true";
    process.env.OPENAI_API_KEY = "test-only-key";
    fetchExternalTextMock.mockResolvedValue({
      response: { ok: false, status: 429 },
      text: JSON.stringify({
        error: {
          message: "provider detail that must not reach the user",
          code: "insufficient_quota"
        }
      })
    });

    const request = callOpenAiStructured({
      role: "communicator",
      schemaName: "test",
      schema: { type: "object" },
      instructions: "test",
      input: {}
    });

    await expect(request).rejects.toMatchObject({
      name: "OpenAiAssistantRequestError",
      status: 429,
      providerCode: "insufficient_quota"
    });
    expect(openAiAssistantFailureMessage(new OpenAiAssistantRequestError("communicator", 429, "insufficient_quota")))
      .toContain("vyčerpanú kvótu");
  });
});
