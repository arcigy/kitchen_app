import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { createProject, downloadProject, importProjectFile, listProjects, loadProject, saveProject, type CreateProjectRequest } from "./projectApi";

export type ProjectRuntimeState = {
  currentProject: ProjectMetadata | null;
  lastSavedAt: string | null;
  editingSessionId: string;
  saveRevision: number;
};

export type ProjectActions = {
  getState: () => ProjectRuntimeState;
  create: (input: CreateProjectRequest) => Promise<ProjectMetadata>;
  save: () => Promise<ProjectSaveFile>;
  download: () => Promise<void>;
  loadCurrent: () => Promise<ProjectSaveFile>;
  list: () => Promise<ProjectMetadata[]>;
  inspectById: (projectId: string) => Promise<ProjectSaveFile>;
  loadById: (projectId: string) => Promise<ProjectSaveFile>;
  importFile: (file: File) => Promise<ProjectSaveFile>;
};

export function createProjectActions(args: {
  buildAppState: () => ProjectSaveFile["appState"];
  buildBomSnapshot?: () => unknown;
  restoreSave: (save: ProjectSaveFile) => void;
  onProjectChanged: (project: ProjectMetadata | null, status?: string) => void;
  initialProject?: ProjectMetadata | null;
  initialProjectSave?: ProjectSaveFile | null;
}): ProjectActions {
  const createEditingSessionId = () => `edit_${Date.now().toString(36)}_${globalThis.crypto.randomUUID()}`;
  const state: ProjectRuntimeState = {
    currentProject: args.initialProjectSave?.project ?? args.initialProject ?? null,
    lastSavedAt: null,
    editingSessionId: createEditingSessionId(),
    saveRevision: args.initialProjectSave?.integrity.saveRevision ?? 0
  };

  const setProject = (project: ProjectMetadata | null, status?: string, resetSession = false) => {
    state.currentProject = project;
    if (resetSession) state.editingSessionId = createEditingSessionId();
    args.onProjectChanged(project, status);
  };

  return {
    getState: () => state,
    async create(input) {
      const project = await createProject(input);
      state.saveRevision = 0;
      setProject(project, "Project created.", true);
      return project;
    },
    async save() {
      if (!state.currentProject) throw new Error("Create or load a project before saving.");
      const save = await saveProject(
        state.currentProject.projectId,
        args.buildAppState(),
        state.editingSessionId,
        args.buildBomSnapshot?.(),
        state.saveRevision
      );
      state.lastSavedAt = save.integrity.savedAt;
      state.saveRevision = save.integrity.saveRevision ?? state.saveRevision;
      setProject(save.project, "Saved.");
      return save;
    },
    async download() {
      if (!state.currentProject) throw new Error("Create or load a project before downloading.");
      await downloadProject(state.currentProject);
    },
    async loadCurrent() {
      if (!state.currentProject) throw new Error("Select a project before loading.");
      const save = await loadProject(state.currentProject.projectId);
      args.restoreSave(save);
      state.saveRevision = save.integrity.saveRevision ?? 0;
      setProject(save.project, "Loaded.", true);
      return save;
    },
    list: () => listProjects(),
    inspectById: (projectId) => loadProject(projectId),
    async loadById(projectId) {
      const save = await loadProject(projectId);
      args.restoreSave(save);
      state.saveRevision = save.integrity.saveRevision ?? 0;
      setProject(save.project, "Loaded.", true);
      return save;
    },
    async importFile(file) {
      const save = await importProjectFile(file);
      args.restoreSave(save);
      state.saveRevision = save.integrity.saveRevision ?? 0;
      setProject(save.project, "Imported.", true);
      return save;
    }
  };
}
