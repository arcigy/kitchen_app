import { withSchemaClient } from "../database/postgres-client";
import type { ClientEventRepository } from "./client-event-repository";

type ClientEventDatabase = { connectionString: string; schema: string };

export function createPostgresClientEventRepository(database: ClientEventDatabase): ClientEventRepository {
  return {
    async record(event) {
      const result = await withSchemaClient(database.connectionString, database.schema, (client) => client.query(
        `INSERT INTO arcigy_project_activity_events
           (client_id, project_id, event_id, phase_id, actor_user_id, event_type, data, created_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [
          event.clientId,
          event.projectId,
          event.eventId,
          event.phaseId,
          event.actorUserId,
          event.eventType,
          JSON.stringify(event.data),
          event.createdAt,
          event.idempotencyKey
        ]
      ));
      return { recorded: (result.rowCount ?? 0) > 0 };
    }
  };
}
