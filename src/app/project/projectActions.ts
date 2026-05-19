import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { createProject, downloadProject, importProjectFile, listProjects, loadProject, saveProject, type CreateProjectRequest } from "./projectApi";

export type ProjectRuntimeState = {
  currentProject: ProjectMetadata | null;
  lastSavedAt: string | null;
};

export type ProjectActions = {
  getState: () => ProjectRuntimeState;
  create: (input: CreateProjectRequest) => Promise<ProjectMetadata>;
  save: () => Promise<ProjectSaveFile>;
  download: () => Promise<void>;
  loadCurrent: () => Promise<ProjectSaveFile>;
  list: () => Promise<ProjectMetadata[]>;
  loadById: (projectId: string) => Promise<ProjectSaveFile>;
  importFile: (file: File) => Promise<ProjectSaveFile>;
};

export function createProjectActions(args: {
  buildAppState: () => ProjectSaveFile["appState"];
  restoreSave: (save: ProjectSaveFile) => void;
  onProjectChanged: (project: ProjectMetadata | null, status?: string) => void;
}): ProjectActions {
  const state: ProjectRuntimeState = {
    currentProject: null,
    lastSavedAt: null
  };

  const setProject = (project: ProjectMetadata | null, status?: string) => {
    state.currentProject = project;
    args.onProjectChanged(project, status);
  };

  return {
    getState: () => state,
    async create(input) {
      const project = await createProject(input);
      setProject(project, "Project created.");
      return project;
    },
    async save() {
      if (!state.currentProject) throw new Error("Create or load a project before saving.");
      const save = await saveProject(state.currentProject.projectId, args.buildAppState());
      state.lastSavedAt = save.integrity.savedAt;
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
      setProject(save.project, "Loaded.");
      return save;
    },
    list: () => listProjects(),
    async loadById(projectId) {
      const save = await loadProject(projectId);
      args.restoreSave(save);
      setProject(save.project, "Loaded.");
      return save;
    },
    async importFile(file) {
      const save = await importProjectFile(file);
      args.restoreSave(save);
      setProject(save.project, "Imported.");
      return save;
    }
  };
}
