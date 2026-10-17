import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { priceOpenAiUsage, readOpenAiUsage } from "./ai-pricing";
import type { AiUsageRepository } from "./ai-usage-types";

/**
 * Server-side attribution of AI calls. A request handler opens the scope with the authenticated client,
 * user and project; provider clients deep in the call stack record usage without threading the context
 * through every function.
 */
export type AiUsageScope = {
  clientId: string;
  userId: string | null;
  projectId: string | null;
  repository: AiUsageRepository;
};

const storage = new AsyncLocalStorage<AiUsageScope>();
const PROJECT_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export function runWithAiUsageScope<T>(scope: AiUsageScope, run: () => Promise<T>): Promise<T> {
  const projectId = scope.projectId && PROJECT_ID_RE.test(scope.projectId) ? scope.projectId : null;
  return storage.run({ ...scope, projectId }, run);
}

/** Records one OpenAI Responses API call in the current scope. Never throws: usage must not break a request. */
export async function recordOpenAiUsage(args: {
  feature: string;
  model: string;
  providerResponse: Record<string, unknown>;
  now?: Date;
}): Promise<void> {
  const scope = storage.getStore();
  if (!scope) return;
  const usage = readOpenAiUsage(args.providerResponse.usage);
  if (!usage) return;
  const priced = priceOpenAiUsage(args.model, usage);
  try {
    await scope.repository.record({
      clientId: scope.clientId,
      usageId: randomUUID(),
      projectId: scope.projectId,
      userId: scope.userId,
      feature: args.feature,
      provider: "openai",
      model: args.model,
      inputTokens: priced.inputTokens,
      cachedInputTokens: priced.cachedInputTokens,
      outputTokens: priced.outputTokens,
      costUsd: priced.costUsd,
      costBasis: priced.costBasis,
      priceTableVersion: priced.priceTableVersion,
      providerRequestId: typeof args.providerResponse.id === "string" ? args.providerResponse.id.slice(0, 200) : null,
      createdAt: (args.now ?? new Date()).toISOString()
    });
  } catch (error) {
    console.warn("[ai-usage] usage was not recorded", error instanceof Error ? error.message : error);
  }
}
