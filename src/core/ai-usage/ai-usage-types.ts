/** One paid AI provider call, attributed to a client (and project/user when known). */
export type AiUsageEvent = {
  clientId: string;
  usageId: string;
  projectId: string | null;
  userId: string | null;
  /** e.g. "assistant.communicator", "pdf_intake.vision". */
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** "unpriced" keeps the tokens of a model that is missing from the price table. */
  costBasis: "provider" | "price_table" | "unpriced";
  priceTableVersion: string | null;
  providerRequestId: string | null;
  createdAt: string;
};

export interface AiUsageRepository {
  /** Stores the call once; a repeated usage ID or provider request ID is ignored. */
  record(event: AiUsageEvent): Promise<{ recorded: boolean }>;
}

export function createInMemoryAiUsageRepository(): AiUsageRepository & { list(): AiUsageEvent[] } {
  const events: AiUsageEvent[] = [];
  return {
    async record(event) {
      const duplicate = events.some((existing) =>
        (existing.clientId === event.clientId && existing.usageId === event.usageId)
        || (event.providerRequestId !== null && existing.provider === event.provider && existing.providerRequestId === event.providerRequestId));
      if (duplicate) return { recorded: false };
      events.push({ ...event });
      return { recorded: true };
    },
    list: () => events.map((event) => ({ ...event }))
  };
}
