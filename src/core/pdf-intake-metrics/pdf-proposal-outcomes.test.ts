import { describe, expect, it, vi } from "vitest";
import { createInMemoryAiUsageRepository, type AiUsageRepository } from "../ai-usage/ai-usage-types";
import { recordPdfIntakeUsage } from "../ai-usage/pdf-intake-usage";
import { createInMemoryPdfProposalOutcomeRepository, diffProposalOutcomes } from "./pdf-proposal-outcomes";

describe("PDF proposal outcomes", () => {
  it("classifies every proposal against what the person accepted", () => {
    const outcomes = diffProposalOutcomes({
      clientId: "client_delfi",
      projectId: "p1",
      documentSha256: "doc-a",
      proposed: [
        { id: "room-1", kind: "room", source: "ai" },
        { id: "wall-1", kind: "wall", source: "rule" },
        { id: "cab-1", kind: "furniture", source: "ai" }
      ],
      accepted: [
        { id: "room-1", kind: "room", changedFields: 0 },
        { id: "wall-1", kind: "wall", changedFields: 2 },
        { id: "cab-9", kind: "furniture", changedFields: 0 }
      ],
      decidedByUserId: "u1",
      decidedAt: new Date("2026-10-12T09:00:00Z")
    });
    expect(outcomes.map((item) => [item.itemId, item.proposedBy, item.outcome, item.changedFields])).toEqual([
      ["room-1", "ai", "accepted", 0],
      ["wall-1", "rule", "corrected", 2],
      ["cab-1", "ai", "rejected", 0],
      ["cab-9", "user", "added_by_user", 0]
    ]);
    expect(outcomes[0]).toMatchObject({ clientId: "client_delfi", decidedByUserId: "u1", decidedAt: "2026-10-12T09:00:00.000Z" });
  });

  it("keeps only the latest decision per proposed item", async () => {
    const repository = createInMemoryPdfProposalOutcomeRepository();
    const base = { clientId: "c", projectId: "p", documentSha256: "d", proposed: [{ id: "r", kind: "room", source: "ai" as const }], decidedByUserId: "u1" };
    await repository.upsert(diffProposalOutcomes({ ...base, accepted: [{ id: "r", kind: "room", changedFields: 0 }], decidedAt: new Date("2026-10-12T09:00:00Z") }));
    await repository.upsert(diffProposalOutcomes({ ...base, accepted: [{ id: "r", kind: "room", changedFields: 1 }], decidedAt: new Date("2026-10-13T09:00:00Z") }));
    expect(repository.list()).toEqual([expect.objectContaining({ itemId: "r", outcome: "corrected", decidedAt: "2026-10-13T09:00:00.000Z" })]);
  });
});

describe("PDF intake usage", () => {
  it("records provider calls with the intake's own cost and skips cached answers", async () => {
    const repository = createInMemoryAiUsageRepository();
    const args = { clientId: "client_delfi", projectId: "p1", userId: "u1", feature: "vision", now: new Date("2026-10-12T08:00:00Z") };
    await expect(recordPdfIntakeUsage(repository, { ...args, usage: { model: "gpt-6-luna", inputTokens: 1000, outputTokens: 200, costUsd: 0.0123456789, costKind: "reported", cached: false, receiptId: "rcpt-1" } })).resolves.toBe(true);
    await expect(recordPdfIntakeUsage(repository, { ...args, usage: { model: "gpt-6-luna", inputTokens: 1000, outputTokens: 200, costUsd: 0, cached: true } })).resolves.toBe(false);
    expect(repository.list()).toEqual([expect.objectContaining({
      feature: "pdf_intake.vision", provider: "openai", model: "gpt-6-luna", costUsd: 0.012346, costBasis: "provider", providerRequestId: "rcpt-1"
    })]);
  });

  it("never lets a storage failure break the intake run", async () => {
    const failing: AiUsageRepository = { record: vi.fn(async () => { throw new Error("database down"); }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(recordPdfIntakeUsage(failing, {
      clientId: "c", projectId: null, userId: null, feature: "pdf_intake.decision",
      usage: { model: "jev-1.13.0", inputTokens: 1, outputTokens: 1, costUsd: 0.001, costKind: "estimated", cached: false }
    })).resolves.toBe(false);
    warn.mockRestore();
  });
});
