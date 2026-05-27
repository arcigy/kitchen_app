import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectActions, ProjectRuntimeState } from "./projectActions";
import { createProjectAutosaveController } from "./projectAutosave";

const project = {
  projectId: "project_1",
  clientId: "client_1",
  name: "Autosave Test",
  location: {},
  contact: {},
  phases: ["phase_1"],
  phaseDetails: [{ phaseId: "phase_1", phaseName: "Phase 1", phaseNumber: 1, status: "draft", createdAt: "", updatedAt: "" }],
  activePhaseId: "phase_1",
  createdAt: "",
  updatedAt: ""
} as ProjectMetadata;

function installWindowTimers() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval
    }
  });
}

function createActions(state: ProjectRuntimeState, save: () => Promise<void>): ProjectActions {
  return {
    getState: () => state,
    create: vi.fn(),
    save: vi.fn(async () => {
      await save();
      state.lastSavedAt = new Date().toISOString();
      return { integrity: { savedAt: state.lastSavedAt } } as Awaited<ReturnType<ProjectActions["save"]>>;
    }),
    download: vi.fn(),
    loadCurrent: vi.fn(),
    list: vi.fn(),
    loadById: vi.fn(),
    importFile: vi.fn()
  };
}

describe("project autosave", () => {
  beforeEach(() => {
    installWindowTimers();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("announces autosave when a project opens and saves changed state", async () => {
    const state: ProjectRuntimeState = { currentProject: null, lastSavedAt: null, editingSessionId: "test_session_1" };
    let token = "initial";
    const toast = vi.fn();
    const actions = createActions(state, async () => {});
    const autosave = createProjectAutosaveController({
      actions,
      getChangeToken: () => token,
      intervalMs: 10 * 60 * 1000,
      openPollMs: 5,
      toast
    });

    autosave.start();
    state.currentProject = project;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toast).toHaveBeenCalledWith("Autosave je zapnuty. Uklada sa kazdych 10 min.", "info");

    token = "changed";
    await autosave.triggerNowForTest();
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Autosave: projekt je ulozeny.", "success");
    autosave.stop();
  });

  it("does not save unchanged project state", async () => {
    const state: ProjectRuntimeState = { currentProject: project, lastSavedAt: null, editingSessionId: "test_session_2" };
    const actions = createActions(state, async () => {});
    const autosave = createProjectAutosaveController({
      actions,
      getChangeToken: () => "same",
      toast: vi.fn()
    });

    autosave.start();
    await autosave.triggerNowForTest();
    expect(actions.save).not.toHaveBeenCalled();
    autosave.stop();
  });
});
