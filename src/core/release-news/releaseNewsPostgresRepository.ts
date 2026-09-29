import { withSchemaClient } from "../database/postgres-client";
import type { ClientContext } from "../client/client-context";
import type { ReleaseNewsAcknowledgement, ReleaseNewsRepository } from "./releaseNewsRepository";

type ReleaseNewsDatabase = { connectionString: string; schema: string };

export function createPostgresReleaseNewsRepository(database: ReleaseNewsDatabase): ReleaseNewsRepository {
  return {
    async listAcknowledged(context) {
      const result = await withSchemaClient(database.connectionString, database.schema, (client) => client.query<{ notice_id: string }>(
        `SELECT notice_id FROM arcigy_release_news_acknowledgements
         WHERE client_id = $1 AND user_id = $2 ORDER BY acknowledged_at DESC`,
        [context.clientId, context.userId]
      ));
      return result.rows.map((row) => row.notice_id);
    },
    async acknowledge(context, noticeId, acknowledgedAt): Promise<ReleaseNewsAcknowledgement> {
      const result = await withSchemaClient(database.connectionString, database.schema, (client) => client.query<{ notice_id: string; acknowledged_at: Date | string }>(
        `INSERT INTO arcigy_release_news_acknowledgements (client_id, user_id, notice_id, acknowledged_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, user_id, notice_id) DO UPDATE
         SET acknowledged_at = arcigy_release_news_acknowledgements.acknowledged_at
         RETURNING notice_id, acknowledged_at`,
        [context.clientId, context.userId, noticeId, acknowledgedAt.toISOString()]
      ));
      const row = result.rows[0];
      if (!row) throw new Error("Release news acknowledgement was not stored.");
      return { noticeId: row.notice_id, acknowledgedAt: new Date(row.acknowledged_at).toISOString() };
    }
  };
}
