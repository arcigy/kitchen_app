import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { createProjectActions } from "./projectActions";
import { createProject, loadProject, saveProject } from "./projectApi";

vi.mock("./projectApi", () => ({
  createProject: vi.fn(),
  downloadProject: vi.fn(),
  importProjectFile: vi.fn(),
  listProjects: vi.fn(),
  loadProject: vi.fn(),
  saveProject: vi.fn()
}));

const project = {
  version: 1,
  projectId: "project_1",
  clientId: "client_1",
  name: "Reopen Test",
  location: { address: "Main 1" },
  contact: { name: "Jane" },
  status: "draft",
  phases: ["phase_1"],
  phaseDetails: [{
    phaseId: "phase_1",
    phaseName: "Phase 1",
    phaseNumber: 1,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }],
  activePhaseId: "phase_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdByUserId: "user_1",
  updatedByUserId: "user_1"
} satisfies ProjectMetadata;

const appState = {
  layout: {},
  kitchen: {},
  modules: [],
  materialAssignments: createEmptyProjectMaterialAssignmentsState(),
  scene: {}
} satisfies ProjectSaveFile["appState"];

function saveWithRevision(saveRevision: number): ProjectSaveFile {
  return {
    project,
    integrity: {
      savedAt: "2026-01-01T00:00:00.000Z",
      saveRevision
    }
  } as ProjectSaveFile;
}

describe("project actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("continues from the loaded save revision while starting a fresh editing session", async () => {
    const initialProjectSave = saveWithRevision(7);
    vi.mocked(saveProject).mockResolvedValue(saveWithRevision(8));
    const buildAppState = vi.fn(() => appState);
    const actions = createProjectActions({
      buildAppState,
      restoreSave: vi.fn(),
      onProjectChanged: vi.fn(),
      initialProjectSave
    });

    expect(actions.getState().currentProject).toBe(project);
    expect(actions.getState().saveRevision).toBe(7);
    expect(actions.getState().editingSessionId).toMatch(/^edit_/);

    await actions.save({ background: true });

    expect(buildAppState).toHaveBeenCalledWith({ background: true });
    expect(saveProject).toHaveBeenCalledWith(
      project.projectId,
      appState,
      actions.getState().editingSessionId,
      undefined,
      7
    );
    expect(actions.getState().saveRevision).toBe(8);
  });

  it("coalesces concurrent saves into one revision-checked server write", async () => {
    let release: ((save: ProjectSaveFile) => void) | undefined;
    vi.mocked(saveProject).mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    const buildAppState = vi.fn(() => appState);
    const actions = createProjectActions({
      buildAppState,
      restoreSave: vi.fn(),
      onProjectChanged: vi.fn(),
      initialProjectSave: saveWithRevision(7)
    });

    const first = actions.save();
    const second = actions.save();
    expect(saveProject).toHaveBeenCalledOnce();
    expect(buildAppState).toHaveBeenCalledOnce();

    release!(saveWithRevision(8));
    await expect(Promise.all([first, second])).resolves.toEqual([saveWithRevision(8), saveWithRevision(8)]);
    expect(actions.getState().saveRevision).toBe(8);
  });

  it("queues one full foreground save behind an in-flight background snapshot", async () => {
    let release: ((save: ProjectSaveFile) => void) | undefined;
    vi.mocked(saveProject)
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(saveWithRevision(9));
    const buildAppState = vi.fn(() => appState);
    const actions = createProjectActions({
      buildAppState,
      restoreSave: vi.fn(),
      onProjectChanged: vi.fn(),
      initialProjectSave: saveWithRevision(7)
    });

    const background = actions.save({ background: true });
    const foreground = actions.save();
    expect(saveProject).toHaveBeenCalledOnce();
    release!(saveWithRevision(8));

    await expect(background).resolves.toEqual(saveWithRevision(8));
    await expect(foreground).resolves.toEqual(saveWithRevision(9));
    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(buildAppState.mock.calls).toEqual([[{ background: true }], [undefined]]);
    expect(actions.getState().saveRevision).toBe(9);
  });

  it("rotates an opaque editing session when a project is created", async () => {
    vi.mocked(createProject).mockResolvedValue(project);
    const actions = createProjectActions({
      buildAppState: () => appState,
      restoreSave: vi.fn(),
      onProjectChanged: vi.fn()
    });
    const initialSessionId = actions.getState().editingSessionId;

    await actions.create({ name: "New project", address: "Main 1", contactName: "Jane" });

    expect(actions.getState().editingSessionId).toMatch(/^edit_[a-z0-9]+_[0-9a-f-]{36}$/);
    expect(actions.getState().editingSessionId).not.toBe(initialSessionId);
  });

  it("inspects another tenant project without replacing the open project", async () => {
    const inspected = saveWithRevision(4);
    vi.mocked(loadProject).mockResolvedValue(inspected);
    const restoreSave = vi.fn();
    const actions = createProjectActions({
      buildAppState: () => appState,
      restoreSave,
      onProjectChanged: vi.fn(),
      initialProjectSave: saveWithRevision(7)
    });
    const initialSession = actions.getState().editingSessionId;

    await expect(actions.inspectById("project_previous")).resolves.toBe(inspected);

    expect(loadProject).toHaveBeenCalledWith("project_previous");
    expect(restoreSave).not.toHaveBeenCalled();
    expect(actions.getState().currentProject).toBe(project);
    expect(actions.getState().saveRevision).toBe(7);
    expect(actions.getState().editingSessionId).toBe(initialSession);
  });

  it("flushes recovery before replacing the current workspace", async () => {
    let release: (() => void) | undefined;
    const beforeProjectReplace = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    vi.mocked(loadProject).mockResolvedValue(saveWithRevision(9));
    const actions = createProjectActions({
      buildAppState: () => appState,
      restoreSave: vi.fn(),
      beforeProjectReplace,
      onProjectChanged: vi.fn(),
      initialProjectSave: saveWithRevision(7)
    });

    const loading = actions.loadById("project_2");
    expect(beforeProjectReplace).toHaveBeenCalledOnce();
    expect(loadProject).not.toHaveBeenCalled();
    release!();
    await loading;
    expect(loadProject).toHaveBeenCalledWith("project_2");
  });

  it("waits for an in-flight save before loading another project", async () => {
    let releaseSave: ((save: ProjectSaveFile) => void) | undefined;
    vi.mocked(saveProject).mockImplementation(() => new Promise((resolve) => { releaseSave = resolve; }));
    vi.mocked(loadProject).mockResolvedValue({ ...saveWithRevision(1), project: { ...project, projectId: "project_2" } });
    const actions = createProjectActions({
      buildAppState: () => appState,
      restoreSave: vi.fn(),
      onProjectChanged: vi.fn(),
      initialProjectSave: saveWithRevision(7)
    });

    const saving = actions.save({ background: true });
    const loading = actions.loadById("project_2");
    expect(loadProject).not.toHaveBeenCalled();

    releaseSave!(saveWithRevision(8));
    await saving;
    await loading;
    expect(loadProject).toHaveBeenCalledWith("project_2");
    expect(actions.getState().currentProject?.projectId).toBe("project_2");
  });

  it("waits for a queued foreground follow-up before replacing the project", async () => {
    let releaseBackground: ((save: ProjectSaveFile) => void) | undefined;
    let releaseForeground: ((save: ProjectSaveFile) => void) | undefined;
    vi.mocked(saveProject)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseBackground = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { releaseForeground = resolve; }));
    vi.mocked(loadProject).mockResolvedValue({ ...saveWithRevision(1), project: { ...project, projectId: "project_2" } });
    const actions = createProjectActions({
      buildAppState: () => appState,
      restoreSave: vi.fn(),
      onProjectChanged: vi.fn(),
      initialProjectSave: saveWithRevision(7)
    });

    const background = actions.save({ background: true });
    const foreground = actions.save();
    const loading = actions.loadById("project_2");
    releaseBackground!(saveWithRevision(8));
    await background;
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(loadProject).not.toHaveBeenCalled();

    releaseForeground!(saveWithRevision(9));
    await foreground;
    await loading;
    expect(loadProject).toHaveBeenCalledWith("project_2");
    expect(actions.getState().currentProject?.projectId).toBe("project_2");
  });
});
