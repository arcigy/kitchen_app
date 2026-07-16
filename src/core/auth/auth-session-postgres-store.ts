import { randomUUID } from "node:crypto";
import { withSchemaClient } from "../database/postgres-client";
import { hashAuthSessionId, type AuthSessionStore } from "./auth-session-store";

export function createPostgresAuthSessionStore(args: {
  connectionString: string;
  schema: string;
}): AuthSessionStore {
  return {
    async issue(session) {
      const sessionId = randomUUID();
      await withSchemaClient(args.connectionString, args.schema, async (client) => {
        await client.query(
          `INSERT INTO arcigy_auth_sessions (
             session_id, session_token_hash, user_id, organization_id, issued_at, expires_at, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`,
          [
            sessionId,
            hashAuthSessionId(sessionId),
            session.userId,
            session.clientId,
            session.issuedAt,
            session.expiresAt
          ]
        );
      });
      return { ...session, sessionId };
    },

    async isActive(session, now = new Date()) {
      if (!session.sessionId) return true;
      const sessionId = session.sessionId;
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<{ active: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM arcigy_auth_sessions
             WHERE session_id = $1
               AND session_token_hash = $2
               AND user_id = $3
               AND organization_id = $4
               AND revoked_at IS NULL
               AND expires_at > $5
           ) AS active`,
          [sessionId, hashAuthSessionId(sessionId), session.userId, session.clientId, now.toISOString()]
        );
        return result.rows[0]?.active === true;
      });
    },

    async revoke(session, now = new Date()) {
      if (!session.sessionId) return;
      const sessionId = session.sessionId;
      await withSchemaClient(args.connectionString, args.schema, async (client) => {
        await client.query(
          `UPDATE arcigy_auth_sessions
           SET revoked_at = COALESCE(revoked_at, $2)
           WHERE session_id = $1
             AND session_token_hash = $3
             AND user_id = $4
             AND organization_id = $5`,
          [sessionId, now.toISOString(), hashAuthSessionId(sessionId), session.userId, session.clientId]
        );
      });
    }
  };
}
