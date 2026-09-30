import type { ClientContext } from "../client/client-context";
import type { ReleaseNewsAcknowledgement, ReleaseNewsRepository } from "./releaseNewsRepository";

export function createInMemoryReleaseNewsRepository(): ReleaseNewsRepository {
  const rows = new Map<string, ReleaseNewsAcknowledgement>();
  const key = (context: ClientContext, noticeId: string) => `${context.clientId}\u0000${context.userId}\u0000${noticeId}`;
  return {
    async listAcknowledged(context) {
      const prefix = `${context.clientId}\u0000${context.userId}\u0000`;
      return [...rows.keys()].filter((item) => item.startsWith(prefix)).map((item) => item.slice(prefix.length));
    },
    async acknowledge(context, noticeId, acknowledgedAt) {
      const identity = key(context, noticeId);
      const existing = rows.get(identity);
      if (existing) return existing;
      const acknowledgement = { noticeId, acknowledgedAt: acknowledgedAt.toISOString() };
      rows.set(identity, acknowledgement);
      return acknowledgement;
    }
  };
}
