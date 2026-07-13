import type { ClientContext } from "../client/client-context";
import type { ClientCatalog } from "../catalog/catalog-types";
import type { CreateProjectInput, ProjectMetadata, ProjectPreview, ProjectVersionMetadata } from "./project-types";
import type { ProjectRepository } from "./project-repository";
import type { ProjectSnapshotSaveOptions } from "../project-materials/project-material-save-authority";
import { assembleProjectSaveFile, type ProjectSaveAssemblerInput } from "../project-save/project-save-assembler";
import { decryptProjectExportPayload, encryptProjectExportPayload, type ProjectFileCryptoOptions } from "../project-save/project-save-crypto";
import { migrateProjectSaveFile } from "../project-save/project-save-migrations";
import type { ProjectSaveFile } from "../project-save/project-save-types";
import { validateProjectSaveFile } from "../project-save/project-save-validation";
import { createProjectId } from "./project-metadata";

export type ProjectService = {
  createProject(ctx: ClientContext, input: CreateProjectInput): Promise<ProjectMetadata>;
  listProjects(ctx: ClientContext): Promise<ProjectMetadata[]>;
  getProject(ctx: ClientContext, projectId: string): Promise<ProjectMetadata>;
  deleteProject(ctx: ClientContext, projectId: string): Promise<void>;
  saveCurrentProject(
    ctx: ClientContext,
    input: Omit<ProjectSaveAssemblerInput, "clientId" | "catalog" | "projectPreview"> & { catalog: ClientCatalog; projectPreview?: unknown; editingSessionId?: unknown },
    options?: ProjectSnapshotSaveOptions
  ): Promise<ProjectSaveFile>;
  loadProject(ctx: ClientContext, projectId: string): Promise<ProjectSaveFile>;
  listProjectVersions(ctx: ClientContext, projectId: string): Promise<ProjectVersionMetadata[]>;
  loadProjectVersion(ctx: ClientContext, projectId: string, versionNumber: number): Promise<ProjectSaveFile>;
  restoreProjectVersion(ctx: ClientContext, projectId: string, versionNumber: number): Promise<ProjectSaveFile>;
  exportEncryptedProjectFile(ctx: ClientContext, projectId: string, options?: ProjectFileCryptoOptions): Promise<string>;
  importEncryptedProjectFile(ctx: ClientContext, envelopeJson: string, options?: ProjectFileCryptoOptions): Promise<ProjectSaveFile>;
};

function cloneImportedSaveForCurrentClient(save: ProjectSaveFile, ctx: ClientContext): ProjectSaveFile {
  const now = new Date().toISOString();
  const projectId = createProjectId(`${save.project.name} import`);
  const project = {
    ...save.project,
    clientId: ctx.clientId,
    projectId,
    name: `${save.project.name} import`,
    createdAt: now,
    updatedAt: now,
    createdByUserId: ctx.userId,
    updatedByUserId: ctx.userId,
    importedFrom: {
      projectId: save.project.projectId,
      importedAt: now
    }
  };
  return {
    ...save,
    clientId: ctx.clientId,
    projectId,
    project,
    phases: save.phases.map((phase) => ({ ...phase, updatedAt: now })),
    integrity: {
      ...save.integrity,
      createdAt: now,
      updatedAt: now,
      savedAt: now
    }
  };
}

function isProjectPreview(value: unknown): value is ProjectPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.imageDataUrl !== "string" || !record.imageDataUrl.startsWith("data:image/")) return false;
  if (record.imageDataUrl.length > 700_000) return false;
  if (typeof record.capturedAt !== "string" || Number.isNaN(new Date(record.capturedAt).getTime())) return false;
  return record.viewMode === "2d" || record.viewMode === "3d";
}

function normalizeEditingSessionId(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 8 && trimmed.length <= 120) return trimmed;
  }
  return fallback;
}

async function saveVersionForCurrentSnapshot(
  repository: ProjectRepository,
  ctx: ClientContext,
  save: ProjectSaveFile,
  editingSessionId: string
): Promise<void> {
  const versions = await repository.listProjectVersions(ctx, save.projectId);
  const latest = versions[0] ?? null;
  const now = save.integrity.savedAt;
  const sameSession = latest?.editingSessionId === editingSessionId;
  const metadata: ProjectVersionMetadata = {
    projectId: save.projectId,
    versionNumber: sameSession ? latest.versionNumber : (latest?.versionNumber ?? 0) + 1,
    editingSessionId,
    createdAt: sameSession ? latest.createdAt : now,
    updatedAt: now,
    savedAt: now,
    savedByUserId: ctx.userId,
    preview: save.project.preview
  };
  await repository.saveProjectVersion(ctx, metadata, save);
}

export function createProjectService(repository: ProjectRepository): ProjectService {
  return {
    createProject: (ctx, input) => repository.createProject(ctx, input),
    listProjects: (ctx) => repository.listProjects(ctx),
    getProject: (ctx, projectId) => repository.getProject(ctx, projectId),
    async deleteProject(ctx, projectId) {
      await repository.getProject(ctx, projectId);
      await repository.deleteProject(ctx, projectId);
    },

    async saveCurrentProject(ctx, input, options) {
      const metadata = await repository.getProject(ctx, input.projectId);
      const editingSessionId = normalizeEditingSessionId(input.editingSessionId, `legacy:${ctx.userId}:${metadata.projectId}`);
      const projectPreview = isProjectPreview(input.projectPreview) ? input.projectPreview : metadata.preview;
      const save = assembleProjectSaveFile({
        ...input,
        clientId: ctx.clientId,
        project: { ...metadata, preview: projectPreview, updatedByUserId: ctx.userId },
        activePhaseId: input.activePhaseId || metadata.activePhaseId,
        catalog: input.catalog,
        projectPreview
      });
      const savedProject = { ...metadata, preview: projectPreview, updatedAt: save.integrity.updatedAt, updatedByUserId: ctx.userId };
      const savedSave: ProjectSaveFile = {
        ...save,
        project: savedProject,
        appState: { ...save.appState, projectPreview }
      };
      validateProjectSaveFile(savedSave, { clientId: ctx.clientId, projectId: save.projectId });
      await repository.saveProjectSnapshot(ctx, savedSave.projectId, savedSave.activePhaseId, savedSave, options);
      await repository.saveProjectMetadata(ctx, savedProject);
      await saveVersionForCurrentSnapshot(repository, ctx, savedSave, editingSessionId);
      return savedSave;
    },

    async loadProject(ctx, projectId) {
      const metadata = await repository.getProject(ctx, projectId);
      return repository.loadProjectSave(ctx, metadata.projectId, metadata.activePhaseId);
    },

    async listProjectVersions(ctx, projectId) {
      await repository.getProject(ctx, projectId);
      return repository.listProjectVersions(ctx, projectId);
    },

    async loadProjectVersion(ctx, projectId, versionNumber) {
      await repository.getProject(ctx, projectId);
      return repository.loadProjectVersion(ctx, projectId, versionNumber);
    },

    async restoreProjectVersion(ctx, projectId, versionNumber) {
      const metadata = await repository.getProject(ctx, projectId);
      const versionSave = await repository.loadProjectVersion(ctx, projectId, versionNumber);
      const now = new Date().toISOString();
      const restoredProject = {
        ...metadata,
        preview: versionSave.project.preview,
        updatedAt: now,
        updatedByUserId: ctx.userId
      };
      const restoredSave: ProjectSaveFile = {
        ...versionSave,
        project: restoredProject,
        activePhaseId: metadata.activePhaseId,
        integrity: {
          ...versionSave.integrity,
          updatedAt: now,
          savedAt: now
        }
      };
      validateProjectSaveFile(restoredSave, { clientId: ctx.clientId, projectId });
      await repository.saveProjectSnapshot(ctx, restoredSave.projectId, restoredSave.activePhaseId, restoredSave, {
        materialAssignmentsMode: "restore-version"
      });
      await repository.saveProjectMetadata(ctx, restoredProject);
      await saveVersionForCurrentSnapshot(repository, ctx, restoredSave, `restore:${ctx.userId}:${now}`);
      return restoredSave;
    },

    async exportEncryptedProjectFile(ctx, projectId, options) {
      const save = await this.loadProject(ctx, projectId);
      const bundled = await repository.bundleProjectAssets(ctx, save);
      return JSON.stringify(encryptProjectExportPayload({
        payloadType: "furnquote-project-export",
        payloadVersion: 1,
        exportedAt: new Date().toISOString(),
        save: bundled.save,
        bundledAssets: bundled.bundledAssets
      }, options));
    },

    async importEncryptedProjectFile(ctx, envelopeJson, options) {
      const payload = decryptProjectExportPayload(JSON.parse(envelopeJson) as unknown, options);
      let save = migrateProjectSaveFile(payload.save);
      validateProjectSaveFile(save, { clientId: ctx.clientId });
      if (save.clientId !== ctx.clientId) throw new Error("Imported project belongs to a different client.");
      let projectExists = false;
      try {
        await repository.getProject(ctx, save.projectId);
        projectExists = true;
      } catch {
        projectExists = false;
      }
      if (projectExists) save = cloneImportedSaveForCurrentClient(save, ctx);
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: save.projectId });
      const restoredSave = await repository.restoreProjectAssets(ctx, save, payload.bundledAssets);
      await repository.saveProjectMetadata(ctx, { ...restoredSave.project, updatedAt: new Date().toISOString(), updatedByUserId: ctx.userId });
      await repository.saveProjectSnapshot(ctx, restoredSave.projectId, restoredSave.activePhaseId, restoredSave);
      return restoredSave;
    }
  };
}
