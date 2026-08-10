import type { ClientContext } from "../../core/client/client-context";
import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { listProjects, loadProject, ProjectApiError } from "./projectApi";
import { decideProjectRecovery } from "./projectRecoveryPolicy";
import {
  createProjectRecoveryStore,
  readLastWorkspacePointer,
  type ProjectRecoveryStore
} from "./projectRecoveryStore";
import type { ProjectRecoveryEnvelopeV1, ProjectRecoveryScope } from "./projectRecoveryTypes";

export type ProjectWorkspaceResolution = {
  initialProject: ProjectMetadata | null;
  initialProjectSave: ProjectSaveFile | null;
  initialRecovery: ProjectRecoveryEnvelopeV1 | null;
  recoveryScope: ProjectRecoveryScope;
  notice: string | null;
};

function isOfflineProjectError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ProjectApiError && error.status >= 500);
}

export async function resolveProjectWorkspace(args: {
  context: ClientContext;
  projectId: string;
  workspaceId?: string;
  serverSave?: ProjectSaveFile;
  store?: ProjectRecoveryStore;
}): Promise<ProjectWorkspaceResolution> {
  const store = args.store ?? createProjectRecoveryStore();
  const scope: ProjectRecoveryScope = {
    clientId: args.context.clientId,
    userId: args.context.userId,
    workspaceId: args.workspaceId ?? `project:${args.projectId}`,
    projectId: args.projectId
  };
  const envelope = await store.readActive(scope);
  let serverSave = args.serverSave ?? null;
  let offline = false;
  let serverHasNoSave = false;
  if (!serverSave && envelope?.baseServerRevision === 0 && envelope.workspace.project) {
    try {
      const projects = await listProjects();
      const serverProject = projects.find((project) => project.projectId === args.projectId && project.clientId === args.context.clientId);
      if (!serverProject) throw new ProjectApiError("Project not found.", 404, "PROJECT_REQUEST_FAILED");
      if (serverProject.updatedAt === envelope.workspace.project.updatedAt) {
        offline = true;
        serverHasNoSave = true;
      }
    } catch (error) {
      if (!isOfflineProjectError(error)) throw error;
      offline = true;
      serverHasNoSave = true;
    }
  }
  if (!serverSave && !serverHasNoSave) {
    try {
      serverSave = await loadProject(args.projectId);
    } catch (error) {
      if (error instanceof ProjectApiError && error.status === 404 && envelope?.baseServerRevision === 0) {
        const projects = await listProjects();
        if (!projects.some((project) => project.projectId === args.projectId && project.clientId === args.context.clientId)) throw error;
        offline = true;
        serverHasNoSave = true;
      } else {
        if (!isOfflineProjectError(error)) throw error;
        offline = true;
      }
    }
  }
  const decision = decideProjectRecovery({ server: serverSave, envelope, offline });
  if (!decision) {
    if (serverSave) {
      return { initialProject: null, initialProjectSave: serverSave, initialRecovery: null, recoveryScope: scope, notice: null };
    }
    throw new Error("Projekt nie je dostupný zo servera ani z bezpečného lokálneho draftu.");
  }
  if (decision.kind === "server") {
    if (decision.archiveLocal) await store.archiveActive(scope, "server-newer");
    return {
      initialProject: null,
      initialProjectSave: decision.save,
      initialRecovery: null,
      recoveryScope: scope,
      notice: decision.archiveLocal
        ? "Server obsahoval novšiu verziu. Lokálny draft bol bezpečne archivovaný ako recovery kópia."
        : null
    };
  }
  if (decision.kind === "local") {
    return {
      initialProject: null,
      initialProjectSave: decision.save,
      initialRecovery: { ...decision.envelope, appState: decision.save.appState },
      recoveryScope: scope,
      notice: "Obnovený lokálny draft po prerušení alebo refreshi."
    };
  }
  return {
    initialProject: decision.envelope.workspace.project,
    initialProjectSave: null,
    initialRecovery: decision.envelope,
    recoveryScope: scope,
    notice: serverHasNoSave
      ? "Obnovený lokálny draft nového projektu pred jeho prvým serverovým uložením."
      : "Projekt je otvorený z lokálneho recovery draftu. Server je momentálne nedostupný."
  };
}

export async function resolveLastWorkspace(
  context: ClientContext,
  store: ProjectRecoveryStore = createProjectRecoveryStore()
): Promise<ProjectWorkspaceResolution | null> {
  const pointer = readLastWorkspacePointer(context.clientId, context.userId);
  if (!pointer) return null;
  if (pointer.projectId) {
    return resolveProjectWorkspace({ context, projectId: pointer.projectId, workspaceId: pointer.workspaceId, store });
  }
  const scope: ProjectRecoveryScope = {
    clientId: context.clientId,
    userId: context.userId,
    workspaceId: pointer.workspaceId,
    projectId: null
  };
  const envelope = await store.readActive(scope);
  if (!envelope) return null;
  return {
    initialProject: null,
    initialProjectSave: null,
    initialRecovery: envelope,
    recoveryScope: scope,
    notice: "Obnovené lokálne pracovné prostredie po refreshi."
  };
}
