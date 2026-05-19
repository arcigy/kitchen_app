import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { resolveClientStoragePath, resolveProjectStoragePath, resolvePhaseBucketPath } from "../storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageId } from "../storage/storage-types";
import { assertClientProjectPhaseAccess, assertProjectBelongsToClient } from "../storage/project-ownership";
import type { CreateProjectInput, ProjectMetadata } from "./project-types";
import { createProjectMetadata } from "./project-metadata";
import { assertValidCreateProjectInput, assertValidProjectMetadata } from "./project-validation";
import type { ProjectBundledAssetPayload, ProjectSaveFile } from "../project-save/project-save-types";
import { validateProjectSaveFile } from "../project-save/project-save-validation";
import { bundleProjectAssets, restoreBundledProjectAssets } from "../project-save/project-asset-bundling";

export type ProjectRepository = {
  createProject(ctx: ClientContext, input: CreateProjectInput): Promise<ProjectMetadata>;
  listProjects(ctx: ClientContext): Promise<ProjectMetadata[]>;
  getProject(ctx: ClientContext, projectId: string): Promise<ProjectMetadata>;
  saveProjectMetadata(ctx: ClientContext, metadata: ProjectMetadata): Promise<void>;
  loadProjectSave(ctx: ClientContext, projectId: string, phaseId: string): Promise<ProjectSaveFile>;
  saveProjectSnapshot(ctx: ClientContext, projectId: string, phaseId: string, save: ProjectSaveFile): Promise<void>;
  bundleProjectAssets(ctx: ClientContext, save: ProjectSaveFile): Promise<{ save: ProjectSaveFile; bundledAssets: ProjectBundledAssetPayload[] }>;
  restoreProjectAssets(ctx: ClientContext, save: ProjectSaveFile, bundledAssets: ProjectBundledAssetPayload[]): Promise<ProjectSaveFile>;
};

const PROJECT_META_FILE = "project.meta.json";
const SAVE_FILE = "save.json";

function projectMetaPath(projectRoot: string, ctx: ClientContext, projectId: string): string {
  const scope = createClientProjectPhaseScope(ctx, { projectId, phaseId: "phase_1" });
  return path.join(resolveProjectStoragePath(projectRoot, scope), PROJECT_META_FILE);
}

function savePath(projectRoot: string, ctx: ClientContext, projectId: string, phaseId: string): string {
  const scope = createClientProjectPhaseScope(ctx, { projectId, phaseId });
  return path.join(resolvePhaseBucketPath(projectRoot, scope, "saves"), SAVE_FILE);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

export function createFileProjectRepository(projectRoot: string): ProjectRepository {
  const root = path.resolve(projectRoot);

  const saveProjectMetadata = async (ctx: ClientContext, metadata: ProjectMetadata) => {
    if (metadata.clientId !== ctx.clientId) throw new Error("Project does not belong to the current client.");
    assertValidProjectMetadata(metadata);
    const safeProjectId = sanitizeStorageId(metadata.projectId, "projectId");
    const metaPath = projectMetaPath(root, ctx, safeProjectId);
    await mkdir(path.dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
  };

  return {
    async createProject(ctx, input) {
      assertValidCreateProjectInput(input);
      const metadata = createProjectMetadata(ctx, input);
      await saveProjectMetadata(ctx, metadata);
      const scope = createClientProjectPhaseScope(ctx, { projectId: metadata.projectId, phaseId: metadata.activePhaseId });
      await Promise.all((["saves", "backups", "exports", "renders", "uploads"] as const).map((bucket) => mkdir(resolvePhaseBucketPath(root, scope, bucket), { recursive: true })));
      return metadata;
    },

    async listProjects(ctx) {
      const projectsDir = path.join(resolveClientStoragePath(root, ctx), "projects");
      let entries: Array<{ isDirectory(): boolean; name: string | Buffer }>;
      try {
        entries = await readdir(projectsDir, { withFileTypes: true });
      } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const projects: ProjectMetadata[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const metadata = await this.getProject(ctx, String(entry.name));
          projects.push(metadata);
        } catch {
          continue;
        }
      }
      return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getProject(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      await assertProjectBelongsToClient(root, ctx.clientId, safeProjectId);
      const metadata = await readJsonFile<ProjectMetadata>(projectMetaPath(root, ctx, safeProjectId));
      if (metadata.clientId !== ctx.clientId) throw new Error("Project does not belong to the current client.");
      assertValidProjectMetadata(metadata);
      return metadata;
    },

    saveProjectMetadata,

    async loadProjectSave(ctx, projectId, phaseId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      await assertClientProjectPhaseAccess(root, ctx.clientId, safeProjectId, safePhaseId);
      const save = await readJsonFile<ProjectSaveFile>(savePath(root, ctx, safeProjectId, safePhaseId));
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      return save;
    },

    async saveProjectSnapshot(ctx, projectId, phaseId, save) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await assertClientProjectPhaseAccess(root, ctx.clientId, safeProjectId, safePhaseId, { mode: "write" });
      const target = savePath(root, ctx, safeProjectId, safePhaseId);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(save, null, 2), "utf-8");
    },

    async bundleProjectAssets(ctx, save) {
      return bundleProjectAssets({ projectRoot: root, ctx, save });
    },

    async restoreProjectAssets(ctx, save, bundledAssets) {
      const restored = await restoreBundledProjectAssets({ projectRoot: root, ctx, save, bundledAssets });
      return {
        ...save,
        assets: {
          bundled: restored,
          external: save.assets?.external ?? [],
          missing: save.assets?.missing ?? [],
          generated: save.assets?.generated ?? []
        }
      };
    }
  };
}
