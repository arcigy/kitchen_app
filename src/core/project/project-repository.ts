import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { resolveClientStoragePath, resolveProjectStoragePath, resolvePhaseBucketPath } from "../storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageId } from "../storage/storage-types";
import { assertClientProjectPhaseAccess, assertProjectBelongsToClient } from "../storage/project-ownership";
import type { CreateProjectInput, ProjectMetadata, ProjectVersionMetadata } from "./project-types";
import { createProjectMetadata } from "./project-metadata";
import { assertValidCreateProjectInput, assertValidProjectMetadata } from "./project-validation";
import type { ProjectBundledAssetPayload, ProjectSaveFile } from "../project-save/project-save-types";
import { loadProjectSaveFile } from "../project-save/project-save-loader";
import { validateProjectSaveFile } from "../project-save/project-save-validation";
import { bundleProjectAssets, restoreBundledProjectAssets } from "../project-save/project-asset-bundling";
import type { ProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { validateProjectMaterialAssignmentsState } from "../project-materials/project-material-validation";
import { ProjectMaterialRevisionConflictError } from "../project-materials/project-material-errors";
import { patchProjectSaveMaterialAssignments } from "../project-materials/project-material-save-patch";
import {
  assertFullSaveMaterialAssignmentsAllowed,
  type ProjectSnapshotSaveOptions
} from "../project-materials/project-material-save-authority";

export { ProjectMaterialRevisionConflictError } from "../project-materials/project-material-errors";

export type ProjectRepository = {
  createProject(ctx: ClientContext, input: CreateProjectInput): Promise<ProjectMetadata>;
  listProjects(ctx: ClientContext): Promise<ProjectMetadata[]>;
  getProject(ctx: ClientContext, projectId: string): Promise<ProjectMetadata>;
  deleteProject(ctx: ClientContext, projectId: string): Promise<void>;
  saveProjectMetadata(ctx: ClientContext, metadata: ProjectMetadata): Promise<void>;
  loadProjectSave(ctx: ClientContext, projectId: string, phaseId: string): Promise<ProjectSaveFile>;
  saveProjectSnapshot(
    ctx: ClientContext,
    projectId: string,
    phaseId: string,
    save: ProjectSaveFile,
    options?: ProjectSnapshotSaveOptions
  ): Promise<void>;
  updateProjectMaterialAssignments(
    ctx: ClientContext,
    projectId: string,
    phaseId: string,
    expectedRevision: number,
    nextState: ProjectMaterialAssignmentsState
  ): Promise<ProjectSaveFile>;
  listProjectVersions(ctx: ClientContext, projectId: string): Promise<ProjectVersionMetadata[]>;
  loadProjectVersion(ctx: ClientContext, projectId: string, versionNumber: number): Promise<ProjectSaveFile>;
  saveProjectVersion(ctx: ClientContext, metadata: ProjectVersionMetadata, save: ProjectSaveFile): Promise<void>;
  bundleProjectAssets(ctx: ClientContext, save: ProjectSaveFile): Promise<{ save: ProjectSaveFile; bundledAssets: ProjectBundledAssetPayload[] }>;
  restoreProjectAssets(ctx: ClientContext, save: ProjectSaveFile, bundledAssets: ProjectBundledAssetPayload[]): Promise<ProjectSaveFile>;
};

const PROJECT_META_FILE = "project.meta.json";
const SAVE_FILE = "save.json";
const VERSION_MANIFEST_FILE = "version-manifest.json";
const savePathWriteQueues = new Map<string, Promise<void>>();

async function withSavePathWriteLock<T>(target: string, operation: () => Promise<T>): Promise<T> {
  const previous = savePathWriteQueues.get(target) ?? Promise.resolve();
  const ready = previous.catch(() => undefined);
  let release: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = ready.then(() => barrier);
  savePathWriteQueues.set(target, queued);
  await ready;
  try {
    return await operation();
  } finally {
    release();
    if (savePathWriteQueues.get(target) === queued) savePathWriteQueues.delete(target);
  }
}

function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

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

    async deleteProject(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      await assertProjectBelongsToClient(root, ctx.clientId, safeProjectId, "write");
      const clientRoot = path.resolve(resolveClientStoragePath(root, ctx));
      const projectPath = path.resolve(resolveProjectStoragePath(root, createClientProjectPhaseScope(ctx, {
        projectId: safeProjectId,
        phaseId: "phase_1"
      })));
      const relative = path.relative(clientRoot, projectPath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Refusing to delete a project outside the current client storage.");
      }
      await rm(projectPath, { recursive: true, force: false });
    },

    saveProjectMetadata,

    async loadProjectSave(ctx, projectId, phaseId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      await assertClientProjectPhaseAccess(root, ctx.clientId, safeProjectId, safePhaseId);
      const save = await readJsonFile<unknown>(savePath(root, ctx, safeProjectId, safePhaseId));
      return loadProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
    },

    async saveProjectSnapshot(ctx, projectId, phaseId, save, options) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await assertClientProjectPhaseAccess(root, ctx.clientId, safeProjectId, safePhaseId, { mode: "write" });
      const target = savePath(root, ctx, safeProjectId, safePhaseId);
      await withSavePathWriteLock(target, async () => {
        let stored: ProjectSaveFile | null = null;
        try {
          stored = loadProjectSaveFile(await readJsonFile<unknown>(target), { clientId: ctx.clientId, projectId: safeProjectId });
        } catch (error) {
          if (!isMissingFile(error)) throw error;
        }
        if (stored) {
          assertFullSaveMaterialAssignmentsAllowed(
            stored.appState.materialAssignments,
            save.appState.materialAssignments,
            options?.materialAssignmentsMode
          );
        }
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, JSON.stringify(save, null, 2), "utf-8");
      });
    },

    async updateProjectMaterialAssignments(ctx, projectId, phaseId, expectedRevision, nextState) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Expected material revision is invalid.");
      validateProjectMaterialAssignmentsState(nextState, "next project material assignments");
      if (nextState.revision !== expectedRevision + 1) {
        throw new Error("Next material assignment revision must increment expectedRevision by one.");
      }
      await assertClientProjectPhaseAccess(root, ctx.clientId, safeProjectId, safePhaseId, { mode: "write" });
      const target = savePath(root, ctx, safeProjectId, safePhaseId);
      return withSavePathWriteLock(target, async () => {
        const stored = loadProjectSaveFile(await readJsonFile<unknown>(target), { clientId: ctx.clientId, projectId: safeProjectId });
        const actualRevision = stored.appState.materialAssignments.revision;
        if (actualRevision !== expectedRevision) {
          throw new ProjectMaterialRevisionConflictError(expectedRevision, actualRevision);
        }
        const patched = patchProjectSaveMaterialAssignments({
          save: stored,
          phaseId: safePhaseId,
          nextState,
          updatedByUserId: ctx.userId
        });
        validateProjectSaveFile(patched, { clientId: ctx.clientId, projectId: safeProjectId });
        await writeFile(target, JSON.stringify(patched, null, 2), "utf-8");
        await saveProjectMetadata(ctx, patched.project);
        return patched;
      });
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
      const save = await readJsonFile<unknown>(versionSavePath(root, ctx, safeProjectId, versionNumber));
      return loadProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
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
