import { describe, expect, it } from "vitest";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import type { ProjectRecoveryEnvelopeV1 } from "./projectRecoveryTypes";
import { decideProjectRecovery } from "./projectRecoveryPolicy";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { ensureEdgeGroups, updateEdgeGroup } from "../../core/edge-banding/edgeGroups";
import { edgeGroupChangesBetween } from "../../core/edge-banding/edgeGroupTransaction";

function save(revision: number, savedAt = "2026-08-10T10:00:00.000Z"): ProjectSaveFile {
  return {
    integrity: { saveRevision: revision, savedAt },
    appState: {
      layout: { source: "server" },
      kitchen: {},
      modules: [],
      scene: {},
      materialAssignments: { source: "server-materials" },
      quoteSettings: { source: "server-quote" },
      pricingSettings: { source: "server-pricing" }
    }
  } as unknown as ProjectSaveFile;
}

function envelope(baseServerRevision: number, updatedAt = "2026-08-10T10:01:00.000Z"): ProjectRecoveryEnvelopeV1 {
  return {
    schemaVersion: 1,
    appVersion: null,
    scope: { clientId: "client_1", userId: "user_1", workspaceId: "project:project_1", projectId: "project_1" },
    baseServerRevision,
    sequence: 3,
    createdAt: "2026-08-10T09:59:00.000Z",
    updatedAt,
    workspace: { kind: "project", project: null },
    appState: {
      layout: { source: "local" },
      kitchen: {},
      modules: [],
      scene: {},
      materialAssignments: { source: "local-materials" },
      quoteSettings: { source: "local-quote" },
      pricingSettings: { source: "local-pricing" }
    } as unknown as ProjectSaveFile["appState"],
    interaction: null,
    historyTail: []
  };
}

describe("project recovery conflict policy", () => {
  it("recovers pending edge groups while preserving newer server choices for other materials", () => {
    const catalog = { clientId: "recovery-test", ...createSystemCatalogSeed() };
    const baseline = ensureEdgeGroups(undefined, catalog);
    const local = updateEdgeGroup(baseline, "edge-accent", "Akcent", null, catalog);
    const server = save(4);
    server.projectId = "recovery-edge-project";
    server.appState.materialAssignments = structuredClone(baseline);
    server.appState.materialAssignments.assignments.find(a => a.category === "corpus")!.customValues.note = "New server choice";
    const draft = envelope(4);
    draft.appState.materialAssignments = local;
    draft.edgeGroupChanges = edgeGroupChangesBetween(baseline, local);
    const decision = decideProjectRecovery({ server, envelope: draft, offline: false });
    expect(decision?.kind).toBe("local");
    if (decision?.kind !== "local") throw new Error("Expected local recovery");
    expect(decision.save.appState.materialAssignments.assignments.find(a => a.assignmentId === "edge-accent")?.customValues.edgeGroupName).toBe("Akcent");
    expect(decision.save.appState.materialAssignments.assignments.find(a => a.category === "corpus")?.customValues.note).toBe("New server choice");
    expect(server.appState.materialAssignments.assignments.some(a => a.assignmentId === "edge-accent")).toBe(false);
  });

  it("archives the conflicting draft when the same edge group was renamed on the server", () => {
    const catalog = { clientId: "recovery-test", ...createSystemCatalogSeed() };
    const baseline = ensureEdgeGroups(undefined, catalog);
    const id = "material-assignment:edge_other";
    const local = updateEdgeGroup(baseline, id, "Local", null, catalog);
    const server = save(4);
    server.projectId = "recovery-edge-conflict";
    server.appState.materialAssignments = updateEdgeGroup(baseline, id, "Server", null, catalog);
    const draft = envelope(4);
    draft.appState.materialAssignments = local;
    draft.edgeGroupChanges = edgeGroupChangesBetween(baseline, local);
    expect(decideProjectRecovery({ server, envelope: draft, offline: false })).toEqual({ kind: "server", save: server, archiveLocal: true });
  });

  it("restores a newer local draft only from the same server base revision", () => {
    const decision = decideProjectRecovery({ server: save(4), envelope: envelope(4), offline: false });

    expect(decision?.kind).toBe("local");
    if (decision?.kind !== "local") throw new Error("Expected local recovery.");
    expect(decision.save.appState.layout).toEqual({ source: "local" });
    expect(decision.save.appState.materialAssignments).toEqual({ source: "server-materials" });
    expect(decision.save.appState.quoteSettings).toEqual({ source: "server-quote" });
    expect(decision.save.appState.pricingSettings).toEqual({ source: "server-pricing" });
  });

  it("keeps the authoritative server and archives a draft from another revision", () => {
    expect(decideProjectRecovery({ server: save(5), envelope: envelope(4), offline: false }))
      .toMatchObject({ kind: "server", archiveLocal: true });
  });

  it("allows an offline local draft but never prefers malformed timestamps over the server", () => {
    expect(decideProjectRecovery({ server: null, envelope: envelope(4), offline: true }))
      .toMatchObject({ kind: "offline-local" });
    expect(decideProjectRecovery({ server: save(4), envelope: envelope(4, "not-a-date"), offline: false }))
      .toMatchObject({ kind: "server", archiveLocal: true });
  });
});
