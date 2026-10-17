/**
 * Business events per client project, used for client success metrics (docs/CRM_CLIENT_METRICS.md).
 * Events are append-only and outlive hard-deleted projects.
 */

/** Events the browser reports after it generated an offer document. */
export const CLIENT_REPORTED_OFFER_EVENT_TYPES = ["offer.pdf_generated", "offer.sheet_generated"] as const;
export type ClientReportedOfferEventType = (typeof CLIENT_REPORTED_OFFER_EVENT_TYPES)[number];

export type ClientEventType =
  | ClientReportedOfferEventType
  | "offer.marked_sent"
  | "offer.sent_reverted"
  | "project.deleted";

export type ClientEvent = {
  clientId: string;
  projectId: string;
  eventId: string;
  phaseId: string | null;
  actorUserId: string;
  eventType: ClientEventType;
  data: Record<string, unknown>;
  createdAt: string;
  /** Deduplicates retried browser reports; unique per client. */
  idempotencyKey: string | null;
};

export function isClientReportedOfferEventType(value: unknown): value is ClientReportedOfferEventType {
  return typeof value === "string" && (CLIENT_REPORTED_OFFER_EVENT_TYPES as readonly string[]).includes(value);
}
