import type { ProjectActions } from "../../app/project/projectActions";
import { openCreateProjectDialog } from "./createProjectDialog";
import { openProjectFilePicker, openProjectListDialog } from "./projectLoadDialog";

export type ProjectMenuActions = {
  newProject: () => void;
  saveProject: () => Promise<void>;
  downloadProject: () => Promise<void>;
  loadProjectFile: () => void;
  openProject: () => void;
};

export function createProjectMenuActions(actions: ProjectActions): ProjectMenuActions {
  return {
    newProject: () => openCreateProjectDialog({ onCreate: async (input) => { await actions.create(input); } }),
    saveProject: () => actions.save().then(() => undefined),
    downloadProject: () => actions.download(),
    openProject: () => {
      void openProjectListDialog({
        listProjects: actions.list,
        onLoad: async (projectId) => { await actions.loadById(projectId); }
      });
    },
    loadProjectFile: () => openProjectFilePicker(async (file) => {
      await actions.importFile(file);
    })
  };
}
