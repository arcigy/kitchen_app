import { describe, expect, it, vi } from "vitest";
import { PRICE_TABLE_VERSION, priceOpenAiUsage, readOpenAiUsage } from "./ai-pricing";
import { recordOpenAiUsage, runWithAiUsageScope } from "./ai-usage-context";
import { createInMemoryAiUsageRepository, type AiUsageRepository } from "./ai-usage-types";

const providerResponse = {
  id: "resp_123",
  usage: {
    input_tokens: 12_000,
    input_tokens_details: { cached_tokens: 2_000 },
    output_tokens: 3_000,
    output_tokens_details: { reasoning_tokens: 1_200 }
  }
};

describe("AI usage pricing", () => {
  it("prices cached input separately and bills reasoning as output", () => {
    const usage = readOpenAiUsage(providerResponse.usage)!;
    expect(usage).toEqual({ inputTokens: 12_000, cachedInputTokens: 2_000, outputTokens: 3_000 });
    // 10k uncached * 0.75 + 2k cached * 0.075 + 3k output * 4.50 = 0.0075 + 0.00015 + 0.0135
    expect(priceOpenAiUsage("gpt-5.4-mini", usage)).toMatchObject({ costUsd: 0.02115, costBasis: "price_table", priceTableVersion: PRICE_TABLE_VERSION });
    expect(priceOpenAiUsage("gpt-5.4-nano-2026-03-17", usage).costUsd).toBeCloseTo(0.005790, 6);
  });

  it("keeps the tokens of an unknown model without inventing a price", () => {
    expect(priceOpenAiUsage("gpt-9-unknown", { inputTokens: 5, cachedInputTokens: 0, outputTokens: 7 }))
      .toEqual({ inputTokens: 5, cachedInputTokens: 0, outputTokens: 7, costUsd: 0, costBasis: "unpriced", priceTableVersion: null });
  });

  it("ignores malformed usage", () => {
    expect(readOpenAiUsage(null)).toBeNull();
    expect(readOpenAiUsage({ input_tokens: -4, input_tokens_details: { cached_tokens: 99 }, output_tokens: "3" }))
      .toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });
});

describe("AI usage attribution", () => {
  it("records a provider call in the request scope with client, user and project", async () => {
    const repository = createInMemoryAiUsageRepository();
    await runWithAiUsageScope({ clientId: "client_a", userId: "user-1", projectId: "kitchen-1", repository }, () =>
      recordOpenAiUsage({ feature: "assistant.communicator", model: "gpt-5.4-nano", providerResponse, now: new Date("2026-10-17T10:00:00Z") }));

    expect(repository.list()).toEqual([expect.objectContaining({
      clientId: "client_a",
      userId: "user-1",
      projectId: "kitchen-1",
      feature: "assistant.communicator",
      provider: "openai",
      model: "gpt-5.4-nano",
      providerRequestId: "resp_123",
      createdAt: "2026-10-17T10:00:00.000Z"
    })]);
  });

  it("drops an unsafe project ID and does nothing outside a scope", async () => {
    const repository = createInMemoryAiUsageRepository();
    await recordOpenAiUsage({ feature: "assistant.analyzer", model: "gpt-5.4-nano", providerResponse });
    expect(repository.list()).toHaveLength(0);

    await runWithAiUsageScope({ clientId: "client_a", userId: null, projectId: "../other tenant", repository }, () =>
      recordOpenAiUsage({ feature: "assistant.analyzer", model: "gpt-5.4-nano", providerResponse }));
    expect(repository.list()[0].projectId).toBeNull();
  });

  it("never lets a storage failure break the AI request", async () => {
    const failing: AiUsageRepository = { record: vi.fn(async () => { throw new Error("database down"); }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runWithAiUsageScope({ clientId: "client_a", userId: null, projectId: null, repository: failing }, () =>
      recordOpenAiUsage({ feature: "assistant.planner", model: "gpt-5.4-mini", providerResponse }))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
