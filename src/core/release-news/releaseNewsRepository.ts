import type { ClientContext } from "../client/client-context";

export type ReleaseNewsAcknowledgement = {
  noticeId: string;
  acknowledgedAt: string;
};

export interface ReleaseNewsRepository {
  listAcknowledged(context: ClientContext): Promise<string[]>;
  acknowledge(context: ClientContext, noticeId: string, acknowledgedAt: Date): Promise<ReleaseNewsAcknowledgement>;
}
