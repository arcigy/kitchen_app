import { Pool, type PoolClient } from "pg";
import type { ClientContext } from "../client/client-context";
import { sanitizeStorageId } from "../storage/storage-types";
import type { CreateProjectInput, ProjectMetadata, ProjectVersionMetadata } from "./project-types";
import { createProjectMetadata } from "./project-metadata";
import { assertValidCreateProjectInput, assertValidProjectMetadata } from "./project-validation";
import type { ProjectBundledAssetPayload, ProjectSaveFile } from "../project-save/project-save-types";
import { validateProjectSaveFile } from "../project-save/project-save-validation";
import { bundleProjectAssets, restoreBundledProjectAssets } from "../project-save/project-asset-bundling";
import type { ProjectRepository } from "./project-repository";

const pools = new Map<string, Pool>();

function getPool(connectionString: string): Pool {
  const existing = pools.get(connectionString);
  if (existing) return existing;
  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
  pools.set(connectionString, pool);
  return pool;
}

export async function closePostgresProjectPools(): Promise<void> {
  const openPools = [...pools.values()];
  pools.clear();
  await Promise.all(openPools.map((pool) => pool.end()));
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS arcigy_projects (
      client_id text NOT NULL,
      project_id text NOT NULL,
      metadata jsonb NOT NULL,
      name text NOT NULL,
      status text NOT NULL,
      active_phase_id text NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      created_by_user_id text NOT NULL,
      updated_by_user_id text NOT NULL,
      db_created_at timestamptz NOT NULL DEFAULT now(),
      db_updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, project_id)
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS arcigy_project_saves (
      client_id text NOT NULL,
      project_id text NOT NULL,
      phase_id text NOT NULL,
      save jsonb NOT NULL,
      saved_at timestamptz NOT NULL,
      db_created_at timestamptz NOT NULL DEFAULT now(),
      db_updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, project_id, phase_id),
      FOREIGN KEY (client_id, project_id)
        REFERENCES arcigy_projects (client_id, project_id)
        ON DELETE CASCADE
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS arcigy_project_versions (
      client_id text NOT NULL,
      project_id text NOT NULL,
      version_number integer NOT NULL,
      editing_session_id text NOT NULL,
      metadata jsonb NOT NULL,
      save jsonb NOT NULL,
      saved_at timestamptz NOT NULL,
      db_created_at timestamptz NOT NULL DEFAULT now(),
      db_updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, project_id, version_number),
      FOREIGN KEY (client_id, project_id)
        REFERENCES arcigy_projects (client_id, project_id)
        ON DELETE CASCADE
    );
  `);
  await client.query("CREATE INDEX IF NOT EXISTS arcigy_projects_client_updated_idx ON arcigy_projects (client_id, updated_at DESC);");
  await client.query("CREATE INDEX IF NOT EXISTS arcigy_project_saves_project_idx ON arcigy_project_saves (client_id, project_id);");
  await client.query("CREATE INDEX IF NOT EXISTS arcigy_project_versions_project_idx ON arcigy_project_versions (client_id, project_id, version_number DESC);");
}

async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    return await fn(client);
  } finally {
    client.release();
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
}): ProjectRepository {
  const pool = getPool(args.connectionString);

  return {
    async createProject(ctx, input) {
      assertValidCreateProjectInput(input);
      const metadata = createProjectMetadata(ctx, input);
      await withClient(pool, async (client) => {
        await saveMetadata(client, ctx, metadata);
      });
      return metadata;
    },

    async listProjects(ctx) {
      return withClient(pool, async (client) => {
        const result = await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 ORDER BY updated_at DESC, db_updated_at DESC",
          [ctx.clientId]
        );
        return result.rows.map(rowMetadata);
      });
    },

    async getProject(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      return withClient(pool, async (client) => {
        const result = await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        );
        const metadata = rowMetadata(result.rows[0]);
        assertProjectClient(ctx, metadata);
        return metadata;
      });
    },

    async saveProjectMetadata(ctx, metadata) {
      await withClient(pool, async (client) => {
        await saveMetadata(client, ctx, metadata);
      });
    },

    async loadProjectSave(ctx, projectId, phaseId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      return withClient(pool, async (client) => {
        const project = rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        assertPhaseBelongsToProject(project, safePhaseId);
        const result = await client.query<{ save: ProjectSaveFile }>(
          "SELECT save FROM arcigy_project_saves WHERE client_id = $1 AND project_id = $2 AND phase_id = $3",
          [ctx.clientId, safeProjectId, safePhaseId]
        );
        if (!result.rows[0]) throw notFound("Project save not found.");
        const save = result.rows[0].save;
        validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
        return save;
      });
    },

    async saveProjectSnapshot(ctx, projectId, phaseId, save) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await withClient(pool, async (client) => {
        const project = rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        assertPhaseBelongsToProject(project, safePhaseId);
        await client.query(
          `
            INSERT INTO arcigy_project_saves (client_id, project_id, phase_id, save, saved_at, db_updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, now())
            ON CONFLICT (client_id, project_id, phase_id) DO UPDATE SET
              save = EXCLUDED.save,
              saved_at = EXCLUDED.saved_at,
              db_updated_at = now()
          `,
          [ctx.clientId, safeProjectId, safePhaseId, JSON.stringify(save), save.integrity.savedAt]
        );
      });
    },

    async listProjectVersions(ctx, projectId) {
      const safeProjectId = sanitizeStorageId(projectId, "projectId");
      return withClient(pool, async (client) => {
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
      return withClient(pool, async (client) => {
        rowMetadata((await client.query<{ metadata: ProjectMetadata }>(
          "SELECT metadata FROM arcigy_projects WHERE client_id = $1 AND project_id = $2",
          [ctx.clientId, safeProjectId]
        )).rows[0]);
        const result = await client.query<{ save: ProjectSaveFile }>(
          "SELECT save FROM arcigy_project_versions WHERE client_id = $1 AND project_id = $2 AND version_number = $3",
          [ctx.clientId, safeProjectId, versionNumber]
        );
        if (!result.rows[0]) throw notFound("Project version not found.");
        const save = result.rows[0].save;
        validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
        return save;
      });
    },

    async saveProjectVersion(ctx, metadata, save) {
      const safeProjectId = sanitizeStorageId(metadata.projectId, "projectId");
      validateProjectSaveFile(save, { clientId: ctx.clientId, projectId: safeProjectId });
      await withClient(pool, async (client) => {
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
