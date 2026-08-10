import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { createProject, downloadProject, importProjectFile, listProjects, loadProject, saveProject, type CreateProjectRequest } from "./projectApi";

export type ProjectRuntimeState = {
  currentProject: ProjectMetadata | null;
  lastSavedAt: string | null;
  editingSessionId: string;
  saveRevision: number;
};

export type ProjectSaveOptions = {
  background?: boolean;
};

export type ProjectActions = {
  getState: () => ProjectRuntimeState;
  create: (input: CreateProjectRequest) => Promise<ProjectMetadata>;
  save: (options?: ProjectSaveOptions) => Promise<ProjectSaveFile>;
  download: () => Promise<void>;
  loadCurrent: () => Promise<ProjectSaveFile>;
  list: () => Promise<ProjectMetadata[]>;
  inspectById: (projectId: string) => Promise<ProjectSaveFile>;
  loadById: (projectId: string) => Promise<ProjectSaveFile>;
  importFile: (file: File) => Promise<ProjectSaveFile>;
};

export function createProjectActions(args: {
  buildAppState: (options?: ProjectSaveOptions) => ProjectSaveFile["appState"];
  buildBomSnapshot?: () => unknown;
  restoreSave: (save: ProjectSaveFile) => void | Promise<void>;
  beforeProjectReplace?: () => void | Promise<void>;
  onProjectChanged: (project: ProjectMetadata | null, status?: string) => void;
  initialProject?: ProjectMetadata | null;
  initialProjectSave?: ProjectSaveFile | null;
  initialSaveRevision?: number;
}): ProjectActions {
  const createEditingSessionId = () => `edit_${Date.now().toString(36)}_${globalThis.crypto.randomUUID()}`;
  const state: ProjectRuntimeState = {
    currentProject: args.initialProjectSave?.project ?? args.initialProject ?? null,
    lastSavedAt: null,
    editingSessionId: createEditingSessionId(),
    saveRevision: args.initialProjectSave?.integrity.saveRevision ?? args.initialSaveRevision ?? 0
  };
  let saveInFlight: Promise<ProjectSaveFile> | null = null;
  let saveInFlightIsBackground = false;

  const setProject = (project: ProjectMetadata | null, status?: string, resetSession = false) => {
    state.currentProject = project;
    if (resetSession) state.editingSessionId = createEditingSessionId();
    args.onProjectChanged(project, status);
  };

  const saveCurrent = async (options?: ProjectSaveOptions): Promise<ProjectSaveFile> => {
    if (!state.currentProject) throw new Error("Create or load a project before saving.");
    if (saveInFlight) {
      const current = saveInFlight;
      return !options?.background && saveInFlightIsBackground
        ? current.then(() => saveCurrent())
        : current;
    }
    const projectId = state.currentProject.projectId;
    const appState = args.buildAppState(options);
    const bomSnapshot = args.buildBomSnapshot?.();
    const expectedRevision = state.saveRevision;
    const editingSessionId = state.editingSessionId;
    saveInFlightIsBackground = options?.background === true;
    saveInFlight = saveProject(projectId, appState, editingSessionId, bomSnapshot, expectedRevision)
      .then((save) => {
        state.lastSavedAt = save.integrity.savedAt;
        state.saveRevision = save.integrity.saveRevision ?? state.saveRevision;
        setProject(save.project, "Saved.");
        return save;
      })
      .finally(() => {
        saveInFlight = null;
        saveInFlightIsBackground = false;
      });
    return saveInFlight;
  };

  const prepareProjectReplace = async () => {
    while (saveInFlight) await saveInFlight.catch(() => undefined);
    await args.beforeProjectReplace?.();
  };

  return {
    getState: () => state,
    async create(input) {
      await prepareProjectReplace();
      const project = await createProject(input);
      state.saveRevision = 0;
      setProject(project, "Project created.", true);
      return project;
    },
    save: saveCurrent,
    async download() {
      if (!state.currentProject) throw new Error("Create or load a project before downloading.");
      await downloadProject(state.currentProject);
    },
    async loadCurrent() {
      if (!state.currentProject) throw new Error("Select a project before loading.");
      await prepareProjectReplace();
      const save = await loadProject(state.currentProject.projectId);
      await args.restoreSave(save);
      state.saveRevision = save.integrity.saveRevision ?? 0;
      setProject(save.project, "Loaded.", true);
      return save;
    },
    list: () => listProjects(),
    inspectById: (projectId) => loadProject(projectId),
    async loadById(projectId) {
      await prepareProjectReplace();
      const save = await loadProject(projectId);
      await args.restoreSave(save);
      state.saveRevision = save.integrity.saveRevision ?? 0;
      setProject(save.project, "Loaded.", true);
      return save;
    },
    async importFile(file) {
      await prepareProjectReplace();
      const save = await importProjectFile(file);
      await args.restoreSave(save);
      state.saveRevision = save.integrity.saveRevision ?? 0;
      setProject(save.project, "Imported.", true);
      return save;
    }
  };
}
