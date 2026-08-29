import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedClientSession } from "../client/client-types";

type StoredAuthSession = {
  sessionId: string;
  sessionTokenHash: string;
  userId: string;
  clientId: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type AuthSessionStore = {
  issue(session: AuthenticatedClientSession): Promise<AuthenticatedClientSession>;
  isActive(session: AuthenticatedClientSession, now?: Date): Promise<boolean>;
  revoke(session: AuthenticatedClientSession, now?: Date): Promise<void>;
};

export function hashAuthSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf-8").digest("hex");
}

export function createInMemoryAuthSessionStore(): AuthSessionStore {
  const sessions = new Map<string, StoredAuthSession>();

  return {
    async issue(session) {
      const sessionId = randomUUID();
      sessions.set(sessionId, {
        sessionId,
        sessionTokenHash: hashAuthSessionId(sessionId),
        userId: session.userId,
        clientId: session.clientId,
        expiresAt: session.expiresAt,
        revokedAt: null
      });
      return { ...session, sessionId };
    },

    async isActive(session, now = new Date()) {
      // Cookies issued before server-side sessions were introduced remain valid
      // until their existing signed seven-day expiry. New logins always get an id.
      if (!session.sessionId) return true;
      const stored = sessions.get(session.sessionId);
      return !!stored &&
        stored.sessionTokenHash === hashAuthSessionId(session.sessionId) &&
        stored.userId === session.userId &&
        stored.clientId === session.clientId &&
        stored.revokedAt === null &&
        Date.parse(stored.expiresAt) > now.getTime();
    },

    async revoke(session, now = new Date()) {
      if (!session.sessionId) return;
      const stored = sessions.get(session.sessionId);
      if (!stored) return;
      stored.revokedAt = now.toISOString();
    }
  };
}
