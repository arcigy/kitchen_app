import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { resolveClientStoragePath, resolveProjectStoragePath, resolvePhaseBucketPath } from "../storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageId } from "../storage/storage-types";
import { assertClientProjectPhaseAccess, assertProjectBelongsToClient } from "../storage/project-ownership";
import type { CreateProjectInput, ProjectMetadata, ProjectVersionMetadata } from "./project-types";
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
  listProjectVersions(ctx: ClientContext, projectId: string): Promise<ProjectVersionMetadata[]>;
  loadProjectVersion(ctx: ClientContext, projectId: string, versionNumber: number): Promise<ProjectSaveFile>;
  saveProjectVersion(ctx: ClientContext, metadata: ProjectVersionMetadata, save: ProjectSaveFile): Promise<void>;
  bundleProjectAssets(ctx: ClientContext, save: ProjectSaveFile): Promise<{ save: ProjectSaveFile; bundledAssets: ProjectBundledAssetPayload[] }>;
  restoreProjectAssets(ctx: ClientContext, save: ProjectSaveFile, bundledAssets: ProjectBundledAssetPayload[]): Promise<ProjectSaveFile>;
};

const PROJECT_META_FILE = "project.meta.json";
const SAVE_FILE = "save.json";
const VERSION_MANIFEST_FILE = "version-manifest.json";

function projectMetaPath(projectRoot: string, ctx: ClientContext, projectId: string): string {
  const scope = createClientProjectPhaseScope(ctx, { projectId, phaseId: "phase_1" });
  return path.join(resolveProjectStoragePath(projectRoot, scope), PROJECT_META_FILE);
}

function savePath(projectRoot: string, ctx: ClientContext, projectId: string, phaseId: string): string {
  const scope = createClientProjectPhaseScope(ctx, { projectId, phaseId });
  return path.join(resolvePhaseBucketPath(projectRoot, scope, "saves"), SAVE_FILE);
}

function projectVersionsPath(projectRoot: string, ctx: ClientContext, projectId: string): string {
  const scope = createClientProjectPhaseScope(ctx, { projectId, phaseId: "phase_1" });
  return path.join(resolveProjectStoragePath(projectRoot, scope), "versions");
}

function versionSavePath(projectRoot: string, ctx: ClientContext, projectId: string, versionNumber: number): string {
  return path.join(projectVersionsPath(projectRoot, ctx, projectId), `v${String(versionNumber).padStart(4, "0")}.json`);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

async function readVersionManifest(dir: string): Promise<ProjectVersionMetadata[]> {
  try {
    const versions = await readJsonFile<ProjectVersionMetadata[]>(path.join(dir, VERSION_MANIFEST_FILE));
    return Array.isArray(versions) ? versions : [];
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
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

    async listProjectVersions(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      await assertProjectBelongsToClient(root, ctx.clientId, safeProjectId);
      const versions = await readVersionManifest(projectVersionsPath(root, ctx, safeProjectId));
      return versions.sort((a, b) => b.versionNumber - a.versionNumber);
    },

    async loadProjectVersion(ctx, projectId, versionNumber) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      await assertProjectBelongsToClient(root, ctx.clientId, safeProjectId);
      const save = await readJsonFile<ProjectSaveFile>(versionSavePath(root, ctx, safeProjectId, versionNumber));
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      return save;
    },

    async saveProjectVersion(ctx, metadata, save) {
      if (metadata.projectId !== save.projectId) throw new Error("Project version metadata does not match save.");
      const safeProjectId = sanitizeStorageId(metadata.projectId, "projectId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await assertProjectBelongsToClient(root, ctx.clientId, safeProjectId, "write");
      const dir = projectVersionsPath(root, ctx, safeProjectId);
      await mkdir(dir, { recursive: true });
      const versions = await readVersionManifest(dir);
      const nextVersions = [
        ...versions.filter((item) => item.versionNumber !== metadata.versionNumber),
        metadata
      ].sort((a, b) => b.versionNumber - a.versionNumber);
      await writeFile(versionSavePath(root, ctx, safeProjectId, metadata.versionNumber), JSON.stringify(save, null, 2), "utf-8");
      await writeFile(path.join(dir, VERSION_MANIFEST_FILE), JSON.stringify(nextVersions, null, 2), "utf-8");
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
