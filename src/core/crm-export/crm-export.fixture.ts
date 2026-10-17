import type { CrmSourceRows } from "./crm-export-types";

/** Source rows behind the golden test and the cross-repo contract fixture (crm-export.v1.example.json). */
const event = (projectId: string, actorUserId: string, eventType: string, createdAt: string, data: Record<string, unknown> = {}) =>
  ({ clientId: "client_delfi", projectId, actorUserId, eventType, createdAt, data });
const usage = (projectId: string | null, feature: string, costUsd: number, createdAt: string, costBasis = "price_table") =>
  ({ clientId: "client_delfi", projectId, userId: "u1", feature, costUsd, costBasis, createdAt });
const outcome = (proposedBy: string, result: string) =>
  ({ clientId: "client_delfi", projectId: "p1", documentSha256: "doc-a", proposedBy, outcome: result, decidedByUserId: "u1", decidedAt: "2026-10-12T09:00:00Z" });

export const CRM_GOLDEN_ROWS: CrmSourceRows = {
  organizations: [
    { clientId: "client_delfi", name: "DELFI" },
    { clientId: "client_demo", name: "Demo" }
  ],
  users: [
    { clientId: "client_delfi", userId: "u1", name: "Aleš", position: "Konštruktér", isActive: true, role: "owner" },
    { clientId: "client_delfi", userId: "u2", name: "Bea", position: "Obchod", isActive: true, role: "designer" },
    { clientId: "client_delfi", userId: "u3", name: "Cyril", position: "Archív", isActive: false, role: "viewer" },
    { clientId: "client_demo", userId: "d1", name: "Demo", position: "Test", isActive: true, role: "owner" }
  ],
  projects: [
    // 22:30 UTC on Oct 10 is 00:30 on Oct 11 in Bratislava (CEST).
    { clientId: "client_delfi", projectId: "p1", createdAt: "2026-10-10T22:30:00Z", createdByUserId: "u1" },
    { clientId: "client_delfi", projectId: "p2", createdAt: "2026-10-12T08:00:00Z", createdByUserId: "u2" },
    { clientId: "client_demo", projectId: "d-p", createdAt: "2026-10-12T08:00:00Z", createdByUserId: "d1" }
  ],
  events: [
    event("p0", "u1", "project.deleted", "2026-10-12T10:00:00Z", { projectCreatedAt: "2026-09-20T10:00:00Z", projectCreatedByUserId: "u2" }),
    event("p1", "u1", "offer.pdf_generated", "2026-10-11T07:00:00Z"),
    event("p1", "u1", "offer.pdf_generated", "2026-10-11T07:05:00Z"),
    event("p1", "u1", "offer.sheet_generated", "2026-10-11T07:06:00Z"),
    event("p1", "u1", "offer.marked_sent", "2026-10-12T11:00:00Z"),
    event("p2", "u2", "offer.marked_sent", "2026-10-12T12:00:00Z"),
    event("p2", "u2", "offer.sent_reverted", "2026-10-12T12:01:00Z")
  ],
  aiUsage: [
    usage("p1", "assistant.communicator", 0.02, "2026-10-11T08:00:00Z"),
    usage("p1", "pdf_intake.vision", 0.09, "2026-10-12T08:00:00Z"),
    usage("p2", "assistant.planner", 0.01, "2026-10-12T08:00:00Z"),
    usage(null, "assistant.communicator", 0.005, "2026-10-12T08:30:00Z"),
    usage("p2", "assistant.analyzer", 0, "2026-10-12T08:40:00Z", "unpriced")
  ],
  pdfOutcomes: [outcome("ai", "accepted"), outcome("ai", "corrected"), outcome("rule", "rejected"), outcome("user", "added_by_user")]
};

