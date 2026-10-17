import { randomUUID } from "node:crypto";
import type { AiUsageRepository } from "./ai-usage-types";

/** The usage object PDF intake providers return (server/pdf-intake on the ARC-012 branch). */
export type PdfIntakeProviderUsage = {
  provider?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** "reported" by the provider or "estimated" from list prices. */
  costKind?: "reported" | "estimated";
  cached: boolean;
  receiptId?: string;
};

/**
 * Records one PDF intake provider call for the client metrics. Cached answers cost nothing and are not
 * provider calls, so they are skipped. Never throws: metrics must not break the intake run.
 */
export async function recordPdfIntakeUsage(
  repository: AiUsageRepository,
  args: {
    clientId: string;
    projectId: string | null;
    userId: string | null;
    /** e.g. "pdf_intake.vision", "pdf_intake.decision". */
    feature: string;
    usage: PdfIntakeProviderUsage;
    now?: Date;
  }
): Promise<boolean> {
  if (args.usage.cached) return false;
  try {
    const result = await repository.record({
      clientId: args.clientId,
      usageId: randomUUID(),
      projectId: args.projectId,
      userId: args.userId,
      feature: args.feature.startsWith("pdf_intake") ? args.feature : `pdf_intake.${args.feature}`,
      provider: args.usage.provider ?? "openai",
      model: args.usage.model,
      inputTokens: Math.max(0, Math.floor(args.usage.inputTokens || 0)),
      cachedInputTokens: 0,
      outputTokens: Math.max(0, Math.floor(args.usage.outputTokens || 0)),
      costUsd: Math.max(0, Math.round((args.usage.costUsd || 0) * 1_000_000) / 1_000_000),
      costBasis: args.usage.costKind === "reported" ? "provider" : "price_table",
      priceTableVersion: args.usage.costKind === "reported" ? null : "pdf-intake-provider-config",
      providerRequestId: args.usage.receiptId ? args.usage.receiptId.slice(0, 200) : null,
      createdAt: (args.now ?? new Date()).toISOString()
    });
    return result.recorded;
  } catch (error) {
    console.warn("[ai-usage] PDF intake usage was not recorded", error instanceof Error ? error.message : error);
    return false;
  }
}
