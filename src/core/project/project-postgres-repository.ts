import type { PoolClient } from "pg";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { closeSchemaPools, withSchemaClient } from "../database/postgres-client";
import { resolveClientStoragePath, resolveProjectStoragePath } from "../storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageId } from "../storage/storage-types";
import type { CreateProjectInput, ProjectMetadata, ProjectVersionMetadata } from "./project-types";
import { createProjectMetadata } from "./project-metadata";
import { assertValidCreateProjectInput, assertValidProjectMetadata } from "./project-validation";
import type { ProjectBundledAssetPayload, ProjectSaveFile } from "../project-save/project-save-types";
import { loadProjectSaveFile } from "../project-save/project-save-loader";
import { validateProjectSaveFile } from "../project-save/project-save-validation";
import { bundleProjectAssets, restoreBundledProjectAssets } from "../project-save/project-asset-bundling";
import type { ProjectRepository } from "./project-repository";
import type { ProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { validateProjectMaterialAssignmentsState } from "../project-materials/project-material-validation";
import { ProjectMaterialRevisionConflictError } from "../project-materials/project-material-errors";
import { patchProjectSaveMaterialAssignments } from "../project-materials/project-material-save-patch";
import { assertFullSaveMaterialAssignmentsAllowed } from "../project-materials/project-material-save-authority";

export async function closePostgresProjectPools(): Promise<void> {
  await closeSchemaPools();
}

async function withTransaction<T>(client: PoolClient, operation: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function assertNextMaterialRevision(expectedRevision: number, nextState: ProjectMaterialAssignmentsState): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Expected material revision is invalid.");
  validateProjectMaterialAssignmentsState(nextState, "next project material assignments");
  if (nextState.revision !== expectedRevision + 1) {
    throw new Error("Next material assignment revision must increment expectedRevision by one.");
  }
}

function notFound(message: string): Error {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function assertProjectClient(ctx: ClientContext, metadata: ProjectMetadata): void {
  if (metadata.clientId !== ctx.clientId) throw new Error("Project does not belong to the current client.");
}

function assertPhaseBelongsToProject(metadata: ProjectMetadata, phaseId: string): void {
  if (!metadata.phases.includes(phaseId)) throw new Error("Phase does not belong to the requested project.");
}

async function saveMetadata(client: PoolClient, ctx: ClientContext, metadata: ProjectMetadata): Promise<void> {
  assertProjectClient(ctx, metadata);
  assertValidProjectMetadata(metadata);
  await client.query(
    `
      INSERT INTO arcigy_projects (
        client_id,
        project_id,
        metadata,
        name,
        status,
        active_phase_id,
        created_at,
        updated_at,
        created_by_user_id,
        updated_by_user_id,
        db_updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, now())
      ON CONFLICT (client_id, project_id) DO UPDATE SET
        metadata = EXCLUDED.metadata,
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        active_phase_id = EXCLUDED.active_phase_id,
        updated_at = EXCLUDED.updated_at,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        db_updated_at = now()
    `,
    [
      metadata.clientId,
      metadata.projectId,
      JSON.stringify(metadata),
      metadata.name,
      metadata.status,
      metadata.activePhaseId,
      metadata.createdAt,
      metadata.updatedAt,
      metadata.createdByUserId,
      metadata.updatedByUserId
    ]
  );
}

function rowMetadata(row: { metadata: unknown } | undefined): ProjectMetadata {
  if (!row) throw notFound("Project not found.");
  const metadata = row.metadata as ProjectMetadata;
  assertValidProjectMetadata(metadata);
  return metadata;
}

function rowVersionMetadata(row: { metadata: unknown } | undefined): ProjectVersionMetadata {
  if (!row) throw notFound("Project version not found.");
  const metadata = row.metadata as ProjectVersionMetadata;
  if (!metadata || typeof metadata !== "object" || typeof metadata.versionNumber !== "number") {
    throw new Error("Project version metadata is invalid.");
  }
  return metadata;
}

export function createPostgresProjectRepository(args: {
  connectionString: string;
  projectRoot: string;
  schema?: string;
}): ProjectRepository {
  const schema = args.schema ?? "public";
  const withClient = <T>(fn: (client: PoolClient) => Promise<T>) =>
    withSchemaClient(args.connectionString, schema, fn);

  return {
    async createProject(ctx, input) {
      assertValidCreateProjectInput(input);
      const metadata = createProjectMetadata(ctx, input);
      await withClient(async (client) => {
        await saveMetadata(client, ctx, metadata);
      });
      return metadata;
    },

    async listProjects(ctx) {
      return withClient(async (client) => {
        const result = await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 ORDER BY updated_at DESC, db_updated_at DESC",
          [ctx.clientId]
        );
        return result.rows.map(rowMetadata);
      });
    },

    async getProject(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      return withClient(async (client) => {
        const result = await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        );
        const metadata = rowMetadata(result.rows[0]);
        assertProjectClient(ctx, metadata);
        return metadata;
      });
    },

    async deleteProject(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      await withClient(async (client) => {
        const result = await client.query(
          "DELETE FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        );
        if (result.rowCount !== 1) throw notFound("Project not found.");
      });

      const root = path.resolve(args.projectRoot);
      const clientRoot = path.resolve(resolveClientStoragePath(root, ctx));
      const projectPath = path.resolve(resolveProjectStoragePath(root, createClientProjectPhaseScope(ctx, {
        projectId: safeProjectId,
        phaseId: "phase_1"
      })));
      const relative = path.relative(clientRoot, projectPath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Refusing to delete a project outside the current client storage.");
      }
      await rm(projectPath, { recursive: true, force: true });
    },

    async saveProjectMetadata(ctx, metadata) {
      await withClient(async (client) => {
        await saveMetadata(client, ctx, metadata);
      });
    },

    async loadProjectSave(ctx, projectId, phaseId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      return withClient(async (client) => {
        const project = rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        assertPhaseBelongsToProject(project, safePhaseId);
        const result = await client.query<{ save: unknown }>(
          "SELECT save FROM arcigy_project_saves WHERE client_id = $1 AND project_id = $2 AND phase_id = $3",
          [ctx.clientId, safeProjectId, safePhaseId]
        );
        if (!result.rows[0]) throw notFound("Project save not found.");
        return loadProjectSaveFile(result.rows[0].save, { clientId: ctx.clientId, projectId: safeProjectId });
      });
    },

    async saveProjectSnapshot(ctx, projectId, phaseId, save, options) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await withClient(async (client) => {
        await withTransaction(client, async () => {
          const project = rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
            "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2 FOR UPDATE",
            [ctx.clientId, safeProjectId]
          )).rows[0]);
          assertPhaseBelongsToProject(project, safePhaseId);
          const storedResult = await client.query<{ save: unknown }>(
            "SELECT save FROM arcigy_project_saves WHERE client_id = $1 AND project_id = $2 AND phase_id = $3 FOR UPDATE",
            [ctx.clientId, safeProjectId, safePhaseId]
          );
          if (storedResult.rows[0]) {
            const stored = loadProjectSaveFile(storedResult.rows[0].save, { clientId: ctx.clientId, projectId: safeProjectId });
            assertFullSaveMaterialAssignmentsAllowed(
              stored.appState.materialAssignments,
              save.appState.materialAssignments,
              options?.materialAssignmentsMode
            );
          }
          await client.query(
            `
              INSERT INTO arcigy_project_saves (client_id, project_id, phase_id, save, saved_at, saved_by_user_id, db_updated_at)
              VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6, now())
              ON CONFLICT (client_id, project_id, phase_id) DO UPDATE SET
                save = EXCLUDED.save,
                saved_at = EXCLUDED.saved_at,
                saved_by_user_id = EXCLUDED.saved_by_user_id,
                db_updated_at = now()
            `,
            [ctx.clientId, safeProjectId, safePhaseId, JSON.stringify(save), save.integrity.savedAt, ctx.userId]
          );
        });
      });
    },

    async updateProjectMaterialAssignments(ctx, projectId, phaseId, expectedRevision, nextState) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      assertNextMaterialRevision(expectedRevision, nextState);
      return withClient(async (client) => withTransaction(client, async () => {
        const project = rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2 FOR UPDATE",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        assertPhaseBelongsToProject(project, safePhaseId);
        const storedResult = await client.query<{ save: unknown }>(
          "SELECT save FROM arcigy_project_saves WHERE client_id = $1 AND project_id = $2 AND phase_id = $3 FOR UPDATE",
          [ctx.clientId, safeProjectId, safePhaseId]
        );
        if (!storedResult.rows[0]) throw notFound("Project save not found.");
        const stored = loadProjectSaveFile(storedResult.rows[0].save, { clientId: ctx.clientId, projectId: safeProjectId });
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
        await client.query(
          `
            UPDATE arcigy_project_saves
            SET save = $4::jsonb, saved_at = $5::timestamptz, saved_by_user_id = $6, db_updated_at = now()
            WHERE client_id = $1 AND project_id = $2 AND phase_id = $3
          `,
          [ctx.clientId, safeProjectId, safePhaseId, JSON.stringify(patched), patched.integrity.savedAt, ctx.userId]
        );
        await saveMetadata(client, ctx, patched.project);
        return patched;
      }));
    },

    async listProjectVersions(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      return withClient(async (client) => {
        rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        const result = await client.query<{ metadata: ProjectVersionMetadata }>(
          "SELECT metadata FROM arcigy_project_versions WHERE client_id = $1 AND project_id = $2 ORDER BY version_number DESC",
          [ctx.clientId, safeProjectId]
        );
        return result.rows.map(rowVersionMetadata);
      });
    },

    async loadProjectVersion(ctx, projectId, versionNumber) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      return withClient(async (client) => {
        rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        const result = await client.query<{ save: unknown }>(
          "SELECT save FROM arcigy_project_versions WHERE client_id = $1 AND project_id = $2 AND version_number = $3",
          [ctx.clientId, safeProjectId, versionNumber]
        );
        if (!result.rows[0]) throw notFound("Project version not found.");
        return loadProjectSaveFile(result.rows[0].save, { clientId: ctx.clientId, projectId: safeProjectId });
      });
    },

    async saveProjectVersion(ctx, metadata, save) {
      const safeProjectId = sanitizeStorageId(metadata.projectId, "projectId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await withClient(async (client) => {
        rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        await client.query(
          `
            INSERT INTO arcigy_project_versions (
              client_id,
              project_id,
              version_number,
              editing_session_id,
              metadata,
              save,
              saved_at,
              db_updated_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz, now())
            ON CONFLICT (client_id, project_id, version_number) DO UPDATE SET
              editing_session_id = EXCLUDED.editing_session_id,
              metadata = EXCLUDED.metadata,
              save = EXCLUDED.save,
              saved_at = EXCLUDED.saved_at,
              db_updated_at = now()
          `,
          [ctx.clientId, safeProjectId, metadata.versionNumber, metadata.editingSessionId, JSON.stringify(metadata), JSON.stringify(save), metadata.savedAt]
        );
      });
    },

    async bundleProjectAssets(ctx, save) {
      return bundleProjectAssets({ projectRoot: args.projectRoot, ctx, save });
    },

    async restoreProjectAssets(ctx, save, bundledAssets) {
      const restored = await restoreBundledProjectAssets({ projectRoot: args.projectRoot, ctx, save, bundledAssets });
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
