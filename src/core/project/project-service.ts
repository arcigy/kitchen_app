import type { ClientContext } from "../client/client-context";
import type { ClientCatalog } from "../catalog/catalog-types";
import type { CreateProjectInput, ProjectMetadata } from "./project-types";
import type { ProjectRepository } from "./project-repository";
import { assembleProjectSaveFile, type ProjectSaveAssemblerInput } from "../project-save/project-save-assembler";
import { decryptProjectExportPayload, encryptProjectExportPayload, type ProjectFileCryptoOptions } from "../project-save/project-save-crypto";
import { migrateProjectSaveFile } from "../project-save/project-save-migrations";
import type { ProjectSaveFile } from "../project-save/project-save-types";
import { validateProjectSaveFile } from "../project-save/project-save-validation";

export type ProjectService = {
  createProject(ctx: ClientContext, input: CreateProjectInput): Promise<ProjectMetadata>;
  listProjects(ctx: ClientContext): Promise<ProjectMetadata[]>;
  getProject(ctx: ClientContext, projectId: string): Promise<ProjectMetadata>;
  saveCurrentProject(ctx: ClientContext, input: Omit<ProjectSaveAssemblerInput, "clientId" | "catalog"> & { catalog: ClientCatalog }): Promise<ProjectSaveFile>;
  loadProject(ctx: ClientContext, projectId: string): Promise<ProjectSaveFile>;
  exportEncryptedProjectFile(ctx: ClientContext, projectId: string, options?: ProjectFileCryptoOptions): Promise<string>;
  importEncryptedProjectFile(ctx: ClientContext, envelopeJson: string, options?: ProjectFileCryptoOptions): Promise<ProjectSaveFile>;
};

export function createProjectService(repository: ProjectRepository): ProjectService {
  return {
    createProject: (ctx, input) => repository.createProject(ctx, input),
    listProjects: (ctx) => repository.listProjects(ctx),
    getProject: (ctx, projectId) => repository.getProject(ctx, projectId),

    async saveCurrentProject(ctx, input) {
      const metadata = await repository.getProject(ctx, input.projectId);
      const save = assembleProjectSaveFile({
        ...input,
        clientId: ctx.clientId,
        project: metadata,
        activePhaseId: input.activePhaseId || metadata.activePhaseId,
        catalog: input.catalog
      });
      await repository.saveProjectSnapshot(ctx, save.projectId, save.activePhaseId, save);
      await repository.saveProjectMetadata(ctx, { ...metadata, updatedAt: save.integrity.updatedAt, updatedByUserId: ctx.userId });
      return save;
    },

    async loadProject(ctx, projectId) {
      const metadata = await repository.getProject(ctx, projectId);
      return repository.loadProjectSave(ctx, metadata.projectId, metadata.activePhaseId);
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
      const save = migrateProjectSaveFile(payload.save);
      validateProjectSaveFile(save, { clientId: ctx.clientId });
      if (save.clientId !== ctx.clientId) throw new Error("Imported project belongs to a different client.");
      try {
        await repository.getProject(ctx, save.projectId);
        throw new Error("Imported projectId already exists.");
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "Imported projectId already exists.") throw error;
      }
      const restoredSave = await repository.restoreProjectAssets(ctx, save, payload.bundledAssets);
      await repository.saveProjectMetadata(ctx, { ...restoredSave.project, updatedAt: new Date().toISOString(), updatedByUserId: ctx.userId });
      await repository.saveProjectSnapshot(ctx, restoredSave.projectId, restoredSave.activePhaseId, restoredSave);
      return restoredSave;
    }
  };
}
