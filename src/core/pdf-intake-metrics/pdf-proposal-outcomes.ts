import { withSchemaClient } from "../database/postgres-client";

/**
 * What happened to each object PDF intake proposed (a room, wall, opening or piece of furniture) once a
 * person accepted the drawing. Feeds the "% of proposals corrected" client metric.
 */
export type PdfProposalOutcome = {
  clientId: string;
  projectId: string;
  documentSha256: string;
  itemId: string;
  itemKind: string;
  proposedBy: "ai" | "rule" | "user";
  outcome: "accepted" | "corrected" | "rejected" | "added_by_user";
  changedFields: number;
  decidedByUserId: string | null;
  decidedAt: string;
};

export interface PdfProposalOutcomeRepository {
  /** Stores the latest decision per proposed item; a later acceptance of the same drawing replaces it. */
  upsert(outcomes: PdfProposalOutcome[]): Promise<void>;
}

export type ProposedItem = { id: string; kind: string; source: "ai" | "rule" };
export type AcceptedItem = { id: string; kind: string; changedFields: number };

/**
 * Compares what intake proposed with what the person accepted. Items are matched by ID: kept and
 * unchanged = accepted, kept with changes = corrected, missing = rejected, new = added by the user.
 */
export function diffProposalOutcomes(args: {
  clientId: string;
  projectId: string;
  documentSha256: string;
  proposed: readonly ProposedItem[];
  accepted: readonly AcceptedItem[];
  decidedByUserId: string | null;
  decidedAt: Date;
}): PdfProposalOutcome[] {
  const base = {
    clientId: args.clientId,
    projectId: args.projectId,
    documentSha256: args.documentSha256,
    decidedByUserId: args.decidedByUserId,
    decidedAt: args.decidedAt.toISOString()
  };
  const accepted = new Map(args.accepted.map((item) => [item.id, item]));
  const proposedIds = new Set(args.proposed.map((item) => item.id));
  const outcomes: PdfProposalOutcome[] = args.proposed.map((item) => {
    const kept = accepted.get(item.id);
    const changedFields = kept ? Math.max(0, Math.floor(kept.changedFields)) : 0;
    return {
      ...base,
      itemId: item.id,
      itemKind: item.kind,
      proposedBy: item.source,
      outcome: !kept ? "rejected" : changedFields > 0 ? "corrected" : "accepted",
      changedFields
    };
  });
  for (const item of args.accepted) {
    if (proposedIds.has(item.id)) continue;
    outcomes.push({ ...base, itemId: item.id, itemKind: item.kind, proposedBy: "user", outcome: "added_by_user", changedFields: 0 });
  }
  return outcomes;
}

export function createPostgresPdfProposalOutcomeRepository(database: { connectionString: string; schema: string }): PdfProposalOutcomeRepository {
  return {
    async upsert(outcomes) {
      if (outcomes.length === 0) return;
      await withSchemaClient(database.connectionString, database.schema, async (client) => {
        for (const outcome of outcomes) {
          await client.query(
            `INSERT INTO arcigy_pdf_proposal_outcomes
               (client_id, project_id, document_sha256, item_id, item_kind, proposed_by, outcome, changed_fields, decided_by_user_id, decided_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (client_id, project_id, document_sha256, item_id) DO UPDATE SET
               item_kind = EXCLUDED.item_kind, proposed_by = EXCLUDED.proposed_by, outcome = EXCLUDED.outcome,
               changed_fields = EXCLUDED.changed_fields, decided_by_user_id = EXCLUDED.decided_by_user_id,
               decided_at = EXCLUDED.decided_at`,
            [outcome.clientId, outcome.projectId, outcome.documentSha256, outcome.itemId, outcome.itemKind,
              outcome.proposedBy, outcome.outcome, outcome.changedFields, outcome.decidedByUserId, outcome.decidedAt]
          );
        }
      });
    }
  };
}

export function createInMemoryPdfProposalOutcomeRepository(): PdfProposalOutcomeRepository & { list(): PdfProposalOutcome[] } {
  const rows = new Map<string, PdfProposalOutcome>();
  return {
    async upsert(outcomes) {
      for (const outcome of outcomes) {
        rows.set([outcome.clientId, outcome.projectId, outcome.documentSha256, outcome.itemId].join("\u0000"), { ...outcome });
      }
    },
    list: () => [...rows.values()].map((row) => ({ ...row }))
  };
}
