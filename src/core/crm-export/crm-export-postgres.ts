import { withSchemaClient } from "../database/postgres-client";
import type { CrmExportOutbox, CrmExportSource, StoredCrmBatch } from "./crm-export-runner";
import type { CrmExportPayload, CrmSourceRows } from "./crm-export-types";

type Database = { connectionString: string; schema: string };

const MAX_DELIVERY_ATTEMPTS = 200;
const EXPORT_LOCK_KEY = "arcigy_crm_export";

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function createPostgresCrmExportSource(database: Database): CrmExportSource {
  return {
    readRows(clientKeys, from, to) {
      return withSchemaClient(database.connectionString, database.schema, async (client): Promise<CrmSourceRows> => {
        const keys = [...clientKeys];
        const window = [keys, from.toISOString(), to.toISOString()];
        const [organizations, users, projects, events, aiUsage, pdfOutcomes] = await Promise.all([
          client.query<{ organization_id: string; name: string }>(
            "SELECT organization_id, name FROM arcigy_organizations WHERE organization_id = ANY($1)", [keys]),
          client.query<{ organization_id: string; user_id: string; name: string; position: string; is_active: boolean; role: string | null }>(
            `SELECT u.organization_id, u.user_id, u.name, u.position, u.is_active, m.role
             FROM arcigy_organization_users u
             LEFT JOIN arcigy_organization_memberships m ON m.organization_id = u.organization_id AND m.user_id = u.user_id
             WHERE u.organization_id = ANY($1)
             ORDER BY u.organization_id, u.user_id`, [keys]),
          client.query<{ client_id: string; project_id: string; created_at: Date; created_by_user_id: string }>(
            `SELECT client_id, project_id, created_at, created_by_user_id FROM arcigy_projects
             WHERE client_id = ANY($1) AND created_at >= $2 AND created_at < $3`, window),
          client.query<{ client_id: string; project_id: string; actor_user_id: string; event_type: string; created_at: Date; data: Record<string, unknown> }>(
            `SELECT client_id, project_id, actor_user_id, event_type, created_at, data FROM arcigy_project_activity_events
             WHERE client_id = ANY($1) AND created_at >= $2 AND created_at < $3`, window),
          client.query<{ client_id: string; project_id: string | null; user_id: string | null; feature: string; cost_usd: string; cost_basis: string; created_at: Date }>(
            `SELECT client_id, project_id, user_id, feature, cost_usd, cost_basis, created_at FROM arcigy_ai_usage_events
             WHERE client_id = ANY($1) AND created_at >= $2 AND created_at < $3`, window),
          client.query<{ client_id: string; project_id: string; document_sha256: string; proposed_by: string; outcome: string; decided_by_user_id: string | null; decided_at: Date }>(
            `SELECT client_id, project_id, document_sha256, proposed_by, outcome, decided_by_user_id, decided_at
             FROM arcigy_pdf_proposal_outcomes
             WHERE client_id = ANY($1) AND decided_at >= $2 AND decided_at < $3`, window)
        ]);
        return {
          organizations: organizations.rows.map((row) => ({ clientId: row.organization_id, name: row.name })),
          users: users.rows.map((row) => ({ clientId: row.organization_id, userId: row.user_id, name: row.name, position: row.position, isActive: row.is_active, role: row.role })),
          projects: projects.rows.map((row) => ({ clientId: row.client_id, projectId: row.project_id, createdAt: iso(row.created_at), createdByUserId: row.created_by_user_id })),
          events: events.rows.map((row) => ({ clientId: row.client_id, projectId: row.project_id, actorUserId: row.actor_user_id, eventType: row.event_type, createdAt: iso(row.created_at), data: row.data ?? {} })),
          aiUsage: aiUsage.rows.map((row) => ({ clientId: row.client_id, projectId: row.project_id, userId: row.user_id, feature: row.feature, costUsd: Number(row.cost_usd), costBasis: row.cost_basis, createdAt: iso(row.created_at) })),
          pdfOutcomes: pdfOutcomes.rows.map((row) => ({ clientId: row.client_id, projectId: row.project_id, documentSha256: row.document_sha256, proposedBy: row.proposed_by, outcome: row.outcome, decidedByUserId: row.decided_by_user_id, decidedAt: iso(row.decided_at) }))
        };
      });
    }
  };
}

export function createPostgresCrmExportOutbox(database: Database): CrmExportOutbox {
  const run = <T>(fn: Parameters<typeof withSchemaClient<T>>[2]) => withSchemaClient(database.connectionString, database.schema, fn);
  return {
    async store(payload: CrmExportPayload, sha256: string) {
      await run((client) => client.query(
        `INSERT INTO arcigy_crm_export_batches (batch_id, schema_version, date_from, date_to, payload, payload_sha256)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (batch_id) DO NOTHING`,
        [payload.batch_id, payload.schema_version, payload.date_from, payload.date_to, JSON.stringify(payload), sha256]
      ));
    },
    async due(): Promise<StoredCrmBatch[]> {
      const result = await run((client) => client.query<{ batch_id: string; payload: CrmExportPayload; attempts: number }>(
        `SELECT batch_id, payload, attempts FROM arcigy_crm_export_batches
         WHERE state IN ('pending', 'failed') AND attempts < $1
         ORDER BY created_at, batch_id`, [MAX_DELIVERY_ATTEMPTS]));
      return result.rows.map((row) => ({ batchId: row.batch_id, payload: row.payload, attempts: row.attempts }));
    },
    async markDelivered(batchId, at) {
      await run((client) => client.query(
        `UPDATE arcigy_crm_export_batches SET state = 'delivered', delivered_at = $2, attempts = attempts + 1, last_error = NULL
         WHERE batch_id = $1`, [batchId, at.toISOString()]));
    },
    async markFailed(batchId, error) {
      await run((client) => client.query(
        `UPDATE arcigy_crm_export_batches SET state = 'failed', attempts = attempts + 1, last_error = $2 WHERE batch_id = $1`,
        [batchId, error.slice(0, 2000)]));
    },
    async lastDeliveredDateTo() {
      const result = await run((client) => client.query<{ date_to: string | null }>(
        "SELECT to_char(max(date_to), 'YYYY-MM-DD') AS date_to FROM arcigy_crm_export_batches WHERE state = 'delivered'"));
      return result.rows[0]?.date_to ?? null;
    }
  };
}

/**
 * Runs `fn` only if no other replica or process is exporting (session-level advisory lock).
 * Returns null when the lock is held elsewhere.
 */
export function withCrmExportLock<T>(database: Database, fn: () => Promise<T>): Promise<T | null> {
  return withSchemaClient(database.connectionString, database.schema, async (client) => {
    const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [EXPORT_LOCK_KEY]);
    if (!locked.rows[0]?.locked) return null;
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [EXPORT_LOCK_KEY]);
    }
  });
}
