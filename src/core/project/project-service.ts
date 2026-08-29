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
import { deterministicProjectId, type ProjectOperationReceipt } from "./project-operation-idempotency";
import type { ProjectWriteIdempotency } from "./project-write-consistency";

export type ProjectService = {
  createProject(ctx: ClientContext, input: CreateProjectInput, idempotency?: ProjectWriteIdempotency): Promise<ProjectMetadata>;
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
  restoreProjectVersion(
    ctx: ClientContext,
    projectId: string,
    versionNumber: number,
    idempotency?: ProjectWriteIdempotency
  ): Promise<ProjectSaveFile>;
  exportEncryptedProjectFile(ctx: ClientContext, projectId: string, options?: ProjectFileCryptoOptions): Promise<string>;
  importEncryptedProjectFile(
    ctx: ClientContext,
    envelopeJson: string,
    options?: ProjectFileCryptoOptions,
    idempotency?: ProjectWriteIdempotency
  ): Promise<ProjectSaveFile>;
};

function cloneImportedSaveForCurrentClient(save: ProjectSaveFile, ctx: ClientContext, projectId?: string): ProjectSaveFile {
  const now = new Date().toISOString();
  const importedProjectId = projectId ?? createProjectId(`${save.project.name} import`);
  const project = {
    ...save.project,
    clientId: ctx.clientId,
    projectId: importedProjectId,
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
    projectId: importedProjectId,
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
    createProject(ctx, input, idempotency) {
      if (!idempotency) return repository.createProject(ctx, input);
      const receipt: ProjectOperationReceipt = { operation: "create", ...idempotency };
      return repository.createProject(ctx, input, {
        projectId: deterministicProjectId("project", receipt),
        receipt
      });
    },
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
      const persistedSave = await repository.saveProjectSnapshot(
        ctx,
        savedSave.projectId,
        savedSave.activePhaseId,
        savedSave,
        options
      );
      await repository.saveProjectMetadata(ctx, persistedSave.project);
      await saveVersionForCurrentSnapshot(repository, ctx, persistedSave, editingSessionId);
      return persistedSave;
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

    async restoreProjectVersion(ctx, projectId, versionNumber, idempotency) {
      const restoreSessionId = idempotency
        ? `restore:${idempotency.keyHash.slice(0, 64)}`
        : null;
      if (restoreSessionId) {
        const replay = (await repository.listProjectVersions(ctx, projectId))
          .find((version) => version.editingSessionId === restoreSessionId);
        if (replay) return repository.loadProjectVersion(ctx, projectId, replay.versionNumber);
      }
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
      const persistedSave = await repository.saveProjectSnapshot(ctx, restoredSave.projectId, restoredSave.activePhaseId, restoredSave, {
        materialAssignmentsMode: "restore-version",
        idempotency
      });
      await repository.saveProjectMetadata(ctx, persistedSave.project);
      await saveVersionForCurrentSnapshot(
        repository,
        ctx,
        persistedSave,
        restoreSessionId ?? `restore:${ctx.userId}:${now}`
      );
      return persistedSave;
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

    async importEncryptedProjectFile(ctx, envelopeJson, options, idempotency) {
      const payload = decryptProjectExportPayload(JSON.parse(envelopeJson) as unknown, options);
      let save = migrateProjectSaveFile(payload.save);
      validateProjectSaveFile(save, { clientId: ctx.clientId });
      if (save.clientId !== ctx.clientId) throw new Error("Imported project belongs to a different client.");
      const receipt: ProjectOperationReceipt | undefined = idempotency
        ? { operation: "import", ...idempotency }
        : undefined;
      if (receipt) {
        save = cloneImportedSaveForCurrentClient(save, ctx, deterministicProjectId("import", receipt));
      } else {
        let projectExists = false;
        try {
          await repository.getProject(ctx, save.projectId);
          projectExists = true;
        } catch {
          projectExists = false;
        }
        if (projectExists) {
          save = cloneImportedSaveForCurrentClient(save, ctx);
        }
      }
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: save.projectId });
      const importedProject = { ...save.project, updatedAt: new Date().toISOString(), updatedByUserId: ctx.userId };
      const persistedProject = receipt
        ? await repository.claimProjectMetadata(ctx, importedProject, receipt)
        : importedProject;
      const restoredSave = await repository.restoreProjectAssets(ctx, { ...save, project: persistedProject }, payload.bundledAssets);
      if (!receipt) await repository.saveProjectMetadata(ctx, persistedProject);
      return repository.saveProjectSnapshot(
        ctx,
        restoredSave.projectId,
        restoredSave.activePhaseId,
        restoredSave,
        receipt ? { idempotency } : undefined
      );
    }
  };
}
