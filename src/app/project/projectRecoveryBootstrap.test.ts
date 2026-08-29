import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { listProjects, ProjectApiError, loadProject } from "./projectApi";
import { resolveProjectWorkspace } from "./projectRecoveryBootstrap";
import type { ProjectRecoveryStore } from "./projectRecoveryStore";
import type { ProjectRecoveryEnvelopeV1 } from "./projectRecoveryTypes";

vi.mock("./projectApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("./projectApi")>();
  return { ...original, listProjects: vi.fn(), loadProject: vi.fn() };
});

const context = { clientId: "client_1", userId: "user_1", role: "owner" } as const;
const project = { projectId: "project_1", clientId: "client_1", name: "Recovery" } as ProjectSaveFile["project"];

function envelope(baseServerRevision = 4): ProjectRecoveryEnvelopeV1 {
  return {
    schemaVersion: 1,
    appVersion: null,
    scope: { clientId: context.clientId, userId: context.userId, workspaceId: "project:project_1", projectId: project.projectId },
    baseServerRevision,
    sequence: 2,
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-10T10:01:00.000Z",
    appState: { layout: {}, kitchen: {}, modules: [], materialAssignments: {}, scene: {} } as unknown as ProjectSaveFile["appState"],
    workspace: { kind: "project", project },
    interaction: null,
    historyTail: []
  };
}

function serverSave(revision = 4): ProjectSaveFile {
  return {
    project,
    integrity: { saveRevision: revision, savedAt: "2026-08-10T10:00:00.000Z" },
    appState: {
      layout: {}, kitchen: {}, modules: [], materialAssignments: {}, scene: {}, quoteSettings: {}, pricingSettings: {}
    }
  } as unknown as ProjectSaveFile;
}

function storeWith(draft: ProjectRecoveryEnvelopeV1 | null) {
  return {
    readActive: vi.fn(async () => draft),
    archiveActive: vi.fn(async () => null)
  } as unknown as ProjectRecoveryStore;
}

describe("project recovery bootstrap authorization and freshness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never exposes a local draft after an authorization failure", async () => {
    vi.mocked(loadProject).mockRejectedValue(new ProjectApiError("Unauthorized", 401, "PROJECT_REQUEST_FAILED"));

    await expect(resolveProjectWorkspace({ context, projectId: project.projectId, store: storeWith(envelope()) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it("opens the scoped draft only when the server is genuinely offline", async () => {
    vi.mocked(loadProject).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(resolveProjectWorkspace({ context, projectId: project.projectId, store: storeWith(envelope()) }))
      .resolves.toMatchObject({ initialRecovery: { sequence: 2 }, initialProjectSave: null });
  });

  it("archives a mismatched local base and keeps the newer server save", async () => {
    const store = storeWith(envelope(4));
    vi.mocked(loadProject).mockResolvedValue(serverSave(5));

    await expect(resolveProjectWorkspace({ context, projectId: project.projectId, store }))
      .resolves.toMatchObject({ initialProjectSave: { integrity: { saveRevision: 5 } }, initialRecovery: null });
    expect(store.archiveActive).toHaveBeenCalledWith(envelope().scope, "server-newer");
  });

  it("restores a new unsaved project only after the authenticated project list confirms it still exists", async () => {
    vi.mocked(listProjects).mockResolvedValue([project]);

    await expect(resolveProjectWorkspace({ context, projectId: project.projectId, store: storeWith(envelope(0)) }))
      .resolves.toMatchObject({ initialRecovery: { baseServerRevision: 0 } });
    expect(loadProject).not.toHaveBeenCalled();

    vi.mocked(listProjects).mockResolvedValue([]);
    await expect(resolveProjectWorkspace({ context, projectId: project.projectId, store: storeWith(envelope(0)) }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("restores a new unsaved project when the authenticated list is temporarily offline", async () => {
    vi.mocked(listProjects).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(resolveProjectWorkspace({ context, projectId: project.projectId, store: storeWith(envelope(0)) }))
      .resolves.toMatchObject({ initialRecovery: { baseServerRevision: 0 }, initialProjectSave: null });
    expect(loadProject).not.toHaveBeenCalled();
  });
});
