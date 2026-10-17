/**
 * List prices in USD per 1M tokens, used to cost AI calls that the provider does not price itself.
 * Bump PRICE_TABLE_VERSION with every change; stored events keep the version they were priced with
 * and their raw token counts, so history can be re-priced.
 */
export const PRICE_TABLE_VERSION = "openai-2026-10-17";

type ModelPrice = { inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number };

// Source: developers.openai.com model pages (standard tier), checked 2026-10-17.
const OPENAI_PRICES: Record<string, ModelPrice> = {
  "gpt-5.4-mini": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 },
  "gpt-5.4-nano": { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25 }
};

export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

export type PricedUsage = TokenUsage & {
  costUsd: number;
  costBasis: "price_table" | "unpriced";
  priceTableVersion: string | null;
};

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Reads the `usage` object of an OpenAI Responses API payload. Reasoning tokens are billed as output. */
export function readOpenAiUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const details = record.input_tokens_details && typeof record.input_tokens_details === "object"
    ? record.input_tokens_details as Record<string, unknown>
    : {};
  const inputTokens = tokenCount(record.input_tokens);
  return {
    inputTokens,
    cachedInputTokens: Math.min(tokenCount(details.cached_tokens), inputTokens),
    outputTokens: tokenCount(record.output_tokens)
  };
}

export function priceOpenAiUsage(model: string, usage: TokenUsage): PricedUsage {
  // Dated snapshots ("gpt-5.4-mini-2026-03-17") share the base model price.
  const price = OPENAI_PRICES[model] ?? OPENAI_PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  if (!price) return { ...usage, costUsd: 0, costBasis: "unpriced", priceTableVersion: null };
  const uncachedInput = usage.inputTokens - usage.cachedInputTokens;
  const costUsd = (
    uncachedInput * price.inputPerMillion
    + usage.cachedInputTokens * price.cachedInputPerMillion
    + usage.outputTokens * price.outputPerMillion
  ) / 1_000_000;
  return { ...usage, costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, costBasis: "price_table", priceTableVersion: PRICE_TABLE_VERSION };
}
