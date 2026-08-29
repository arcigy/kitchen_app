import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";
import { quotePgIdentifier } from "../src/core/database/database-config";
import {
  RESTORE_DRILL_DOCKER_LABEL,
  RESTORE_DRILL_SCHEMA,
  assertDisposableContainerName,
  assertEquivalentRestoreEvidence,
  assertLocalDockerEndpoint,
  createDisposableContainerName,
  createDisposableDatabaseNames,
  parsePublishedPostgresPort,
  resolveRestoreDrillConfig,
  type RestoreDrillEvidence
} from "./postgresRestoreDrillConfig";

export const RESTORE_DRILL_POSTGRES_USER = "arcigy_restore_drill";
const BACKUP_PATH = "/tmp/arcigy-restore-drill.dump";
const COMMAND_TIMEOUT_MS = 5 * 60_000;

type CommandOptions = {
  input?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

type CountRow = { count: string | number };
type DigestRow = { digest: string };

function safeDiagnostic(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/password=[^\s]+/gi, "password=[redacted]")
    .trim()
    .split(/\r?\n/, 1)[0]
    .slice(0, 240);
}

function run(command: string, args: string[], label: string, options: CommandOptions = {}): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.input,
    env: options.env,
    timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`${label} could not run: ${safeDiagnostic(result.error.message)}`);
  }
  if (result.status !== 0) {
    const diagnostic = safeDiagnostic(result.stderr || result.stdout || "unknown command failure");
    throw new Error(`${label} failed${diagnostic ? `: ${diagnostic}` : "."}`);
  }
  return result.stdout;
}

function runDocker(args: string[], label: string, options: CommandOptions = {}): string {
  return run("docker", args, label, options);
}

function dockerEndpoint(): string {
  const output = runDocker(
    ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
    "Docker context inspection"
  ).trim();
  try {
    const endpoint = JSON.parse(output) as unknown;
    if (typeof endpoint !== "string") throw new Error("not a string");
    return endpoint;
  } catch {
    throw new Error("Docker context did not expose a valid local endpoint.");
  }
}

function migrationEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.KITCHEN_PROJECT_DATABASE_URL;
  delete env.PROJECT_DATABASE_URL;
  return env;
}

export function runRestoreDrillMigrations(connectionString: string): void {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  run(process.execPath, [
    tsxCli,
    "scripts/dbMigrate.ts",
    "--database-url",
    connectionString,
    "--schema",
    RESTORE_DRILL_SCHEMA,
    "--app-env",
    "test"
  ], "Transactional database migrations", { env: migrationEnvironment() });
}

async function waitForPostgres(containerName: string, databaseName: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", [
      "exec",
      containerName,
      "pg_isready",
      "--username",
      RESTORE_DRILL_POSTGRES_USER,
      "--dbname",
      databaseName
    ], { encoding: "utf8", windowsHide: true, timeout: 5_000 });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 60 seconds.");
}

function connectionString(password: string, port: number, databaseName: string): string {
  return `postgresql://${RESTORE_DRILL_POSTGRES_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}`;
}

async function withClient<T>(url: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${quotePgIdentifier(RESTORE_DRILL_SCHEMA)}, public`);
      return await operation(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function seedSyntheticArcigyData(url: string): Promise<void> {
  const at = "2026-01-15T12:00:00.000Z";
  const alphaSave = {
    version: 1,
    projectId: "project_alpha",
    scene: { objects: [{ id: "cabinet_alpha", moduleType: "synthetic_base" }] },
    pricing: { currency: "EUR", total: 1234.56 },
    bom: [
      { code: "BOARD-ALPHA", quantity: 3, unit: "m2" },
      { code: "HINGE-ALPHA", quantity: 8, unit: "piece" }
    ],
    assetReferences: ["asset_alpha"]
  };
  const betaSave = {
    version: 1,
    projectId: "project_beta",
    scene: { objects: [{ id: "cabinet_beta", moduleType: "synthetic_wall" }] },
    pricing: { currency: "EUR", total: 987.65 },
    bom: [{ code: "BOARD-BETA", quantity: 2, unit: "m2" }],
    assetReferences: ["asset_beta"]
  };

  await withClient(url, async (client) => {
    await client.query("BEGIN");
    try {
      for (const tenant of ["alpha", "beta"] as const) {
        const clientId = `tenant_${tenant}`;
        const userId = `user_${tenant}`;
        const projectId = `project_${tenant}`;
        const phaseId = `phase_${tenant}`;
        const save = tenant === "alpha" ? alphaSave : betaSave;
        await client.query(
          `INSERT INTO arcigy_organizations
            (organization_id, name, legal_name, settings, created_at, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $5::timestamptz)`,
          [clientId, `Synthetic ${tenant}`, `Synthetic ${tenant} s.r.o.`, JSON.stringify({ restoreDrill: true }), at]
        );
        await client.query(
          `INSERT INTO arcigy_organization_users
            (user_id, organization_id, name, email, position, profile, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'designer', $5::jsonb, $6::timestamptz, $6::timestamptz)`,
          [userId, clientId, `Synthetic ${tenant} user`, `${tenant}@invalid.example`, JSON.stringify({ restoreDrill: true }), at]
        );
        await client.query(
          `INSERT INTO arcigy_organization_memberships
            (organization_id, user_id, role, permissions, created_at, updated_at)
           VALUES ($1, $2, 'admin', '["projects:read","projects:write"]'::jsonb, $3::timestamptz, $3::timestamptz)`,
          [clientId, userId, at]
        );
        await client.query(
          `INSERT INTO arcigy_projects
            (client_id, project_id, metadata, name, status, active_phase_id, created_at, updated_at, created_by_user_id, updated_by_user_id)
           VALUES ($1, $2, $3::jsonb, $4, 'active', $5, $6::timestamptz, $6::timestamptz, $7, $7)`,
          [clientId, projectId, JSON.stringify({ id: projectId, clientId, phaseId, restoreDrill: true }), `Synthetic ${tenant} project`, phaseId, at, userId]
        );
        await client.query(
          `INSERT INTO arcigy_project_phases
            (client_id, project_id, phase_id, phase_number, status, metadata, data, created_at, updated_at)
           VALUES ($1, $2, $3, 1, 'active', $4::jsonb, $5::jsonb, $6::timestamptz, $6::timestamptz)`,
          [clientId, projectId, phaseId, JSON.stringify({ restoreDrill: true }), JSON.stringify({ roomCount: 1 }), at]
        );
        await client.query(
          `INSERT INTO arcigy_project_saves
            (client_id, project_id, phase_id, revision, save, saved_at, saved_by_user_id)
           VALUES ($1, $2, $3, 1, $4::jsonb, $5::timestamptz, $6)`,
          [clientId, projectId, phaseId, JSON.stringify(save), at, userId]
        );
        await client.query(
          `INSERT INTO arcigy_project_versions
            (client_id, project_id, version_number, editing_session_id, metadata, save, saved_at, saved_by_user_id)
           VALUES ($1, $2, 1, $3, $4::jsonb, $5::jsonb, $6::timestamptz, $7)`,
          [clientId, projectId, `session_${tenant}`, JSON.stringify({ restoreDrill: true }), JSON.stringify(save), at, userId]
        );
        await client.query(
          `INSERT INTO arcigy_client_catalogs
            (client_id, catalog, catalog_version, source, created_at, updated_at)
           VALUES ($1, $2::jsonb, 1, 'restore-drill', $3::timestamptz, $3::timestamptz)`,
          [clientId, JSON.stringify({ clientId, materials: [{ code: `BOARD-${tenant.toUpperCase()}`, price: tenant === "alpha" ? 21.5 : 18.75 }] }), at]
        );
        await client.query(
          `INSERT INTO arcigy_module_packages
            (client_id, module_package_id, module_type, package_version, package_hash, package, source, created_at, updated_at)
           VALUES ($1, $2, $3, '1.0.0', $4, $5::jsonb, 'restore-drill', $6::timestamptz, $6::timestamptz)`,
          [clientId, `module_${tenant}`, `synthetic_${tenant}`, `hash_${tenant}`, JSON.stringify({ clientId, moduleType: `synthetic_${tenant}`, restoreDrill: true }), at]
        );
        await client.query(
          `INSERT INTO arcigy_assets
            (asset_id, client_id, project_id, phase_id, bucket, object_key, original_file_name, mime_type, size_bytes, sha256, created_by_user_id, created_at, metadata)
           VALUES ($1, $2, $3, $4, 'project', $5, $6, 'image/png', 128, $7, $8, $9::timestamptz, $10::jsonb)`,
          [`asset_${tenant}`, clientId, projectId, phaseId, `restore-drill/${clientId}/${projectId}/preview.png`, `${tenant}.png`, `sha256_${tenant}`, userId, at, JSON.stringify({ restoreDrill: true })]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function collectRestoreDrillEvidence(url: string): Promise<RestoreDrillEvidence> {
  return withClient(url, async (client) => {
    const tablesResult = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [RESTORE_DRILL_SCHEMA]
    );
    const tableCounts: Record<string, number> = {};
    const tableDigests: Record<string, string> = {};
    const schemaSql = quotePgIdentifier(RESTORE_DRILL_SCHEMA);
    for (const { table_name: tableName } of tablesResult.rows) {
      const tableSql = quotePgIdentifier(tableName);
      const countResult = await client.query<CountRow>(`SELECT count(*) AS count FROM ${schemaSql}.${tableSql}`);
      const digestResult = await client.query<DigestRow>(
        `SELECT md5(COALESCE(string_agg(row_text, E'\\n' ORDER BY row_text), '')) AS digest
         FROM (SELECT row_to_json(value)::text AS row_text FROM ${schemaSql}.${tableSql} AS value) AS rows`
      );
      tableCounts[tableName] = Number(countResult.rows[0]?.count ?? 0);
      tableDigests[tableName] = digestResult.rows[0]?.digest ?? "";
    }

    const migrations = await client.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version");
    const constraints = await client.query<{ count: string; invalid_count: string }>(
      `SELECT count(*) AS count,
              count(*) FILTER (WHERE NOT constraint_record.convalidated) AS invalid_count
       FROM pg_constraint AS constraint_record
       JOIN pg_namespace AS namespace_record ON namespace_record.oid = constraint_record.connamespace
       WHERE namespace_record.nspname = $1`,
      [RESTORE_DRILL_SCHEMA]
    );
    const indexes = await client.query<{ count: string; invalid_count: string }>(
      `SELECT count(*) AS count,
              count(*) FILTER (WHERE NOT index_record.indisvalid) AS invalid_count
       FROM pg_index AS index_record
       JOIN pg_class AS table_record ON table_record.oid = index_record.indrelid
       JOIN pg_namespace AS namespace_record ON namespace_record.oid = table_record.relnamespace
       WHERE namespace_record.nspname = $1`,
      [RESTORE_DRILL_SCHEMA]
    );
    const representative = await client.query<{
      pricing_total: string;
      bom_item_count: number;
      asset_reference_count: string;
      tenant_boundary_leak_count: string;
    }>(
      `SELECT
         (SELECT save #>> '{pricing,total}' FROM arcigy_project_saves WHERE client_id = 'tenant_alpha' AND project_id = 'project_alpha') AS pricing_total,
         (SELECT jsonb_array_length(save -> 'bom') FROM arcigy_project_saves WHERE client_id = 'tenant_alpha' AND project_id = 'project_alpha') AS bom_item_count,
         (SELECT count(*) FROM arcigy_assets WHERE client_id = 'tenant_alpha' AND project_id = 'project_alpha') AS asset_reference_count,
         (SELECT count(*) FROM arcigy_projects WHERE client_id = 'tenant_beta' AND project_id = 'project_alpha') AS tenant_boundary_leak_count`
    );
    const representativeRow = representative.rows[0];
    if (!representativeRow?.pricing_total) throw new Error("Representative project pricing was not restored.");

    return {
      tableCounts,
      tableDigests,
      migrationVersions: migrations.rows.map((row) => row.version),
      constraintCount: Number(constraints.rows[0]?.count ?? 0),
      invalidConstraintCount: Number(constraints.rows[0]?.invalid_count ?? 0),
      indexCount: Number(indexes.rows[0]?.count ?? 0),
      invalidIndexCount: Number(indexes.rows[0]?.invalid_count ?? 0),
      representative: {
        pricingTotal: representativeRow.pricing_total,
        bomItemCount: Number(representativeRow.bom_item_count),
        assetReferenceCount: Number(representativeRow.asset_reference_count),
        tenantBoundaryLeakCount: Number(representativeRow.tenant_boundary_leak_count)
      }
    };
  });
}

function cleanupContainer(containerName: string): void {
  assertDisposableContainerName(containerName);
  const inspect = spawnSync("docker", [
    "inspect",
    "--format",
    `{{ index .Config.Labels "${RESTORE_DRILL_DOCKER_LABEL}" }}`,
    containerName
  ], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  if (inspect.status !== 0) return;
  if (inspect.stdout.trim() !== "true") {
    throw new Error("Refusing to remove a restore-drill container without the exact safety label.");
  }
  runDocker(["rm", "--force", containerName], "Disposable restore-drill container cleanup", { timeoutMs: 30_000 });
}

export async function runDockerPostgresRestoreDrill(): Promise<void> {
  const config = resolveRestoreDrillConfig();
  assertLocalDockerEndpoint(dockerEndpoint());
  runDocker(["version", "--format", "{{.Server.Version}}"], "Local Docker engine check", { timeoutMs: 15_000 });

  const nonce = randomBytes(5).toString("hex");
  const names = createDisposableDatabaseNames(nonce);
  const containerName = createDisposableContainerName(`${process.pid}-${nonce}`);
  const password = randomBytes(24).toString("hex");
  let containerStarted = false;
  const cleanup = () => {
    if (!containerStarted) return;
    cleanupContainer(containerName);
    containerStarted = false;
  };
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    runDocker([
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--label",
      `${RESTORE_DRILL_DOCKER_LABEL}=true`,
      "--publish",
      "127.0.0.1::5432",
      "--env",
      `POSTGRES_USER=${RESTORE_DRILL_POSTGRES_USER}`,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      "--env",
      `POSTGRES_DB=${names.source}`,
      config.image
    ], "Disposable PostgreSQL startup");
    containerStarted = true;
    await waitForPostgres(containerName, names.source);

    const port = parsePublishedPostgresPort(runDocker(
      ["port", containerName, "5432/tcp"],
      "Disposable PostgreSQL port inspection"
    ));
    const sourceUrl = connectionString(password, port, names.source);
    const targetUrl = connectionString(password, port, names.target);

    runRestoreDrillMigrations(sourceUrl);
    runRestoreDrillMigrations(sourceUrl);
    await seedSyntheticArcigyData(sourceUrl);
    const sourceEvidence = await collectRestoreDrillEvidence(sourceUrl);

    runDocker([
      "exec",
      containerName,
      "pg_dump",
      "--username",
      RESTORE_DRILL_POSTGRES_USER,
      "--dbname",
      names.source,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${BACKUP_PATH}`
    ], "Synthetic PostgreSQL backup");
    const backupChecksum = runDocker(
      ["exec", containerName, "sha256sum", BACKUP_PATH],
      "Backup checksum"
    ).trim().split(/\s+/, 1)[0];
    if (!/^[a-f0-9]{64}$/.test(backupChecksum)) throw new Error("Backup checksum is invalid.");
    const archiveList = runDocker(
      ["exec", containerName, "pg_restore", "--list", BACKUP_PATH],
      "Backup archive inspection"
    );
    if (!archiveList.includes(`TABLE ${RESTORE_DRILL_SCHEMA} arcigy_projects`) ||
        !archiveList.includes(`TABLE DATA ${RESTORE_DRILL_SCHEMA} arcigy_project_saves`)) {
      throw new Error("Backup archive does not contain the required Arcigy project tables and data.");
    }

    const restoreStartedAt = Date.now();
    runDocker([
      "exec",
      containerName,
      "createdb",
      "--username",
      RESTORE_DRILL_POSTGRES_USER,
      names.target
    ], "Disposable restore target creation");
    runDocker([
      "exec",
      containerName,
      "pg_restore",
      "--username",
      RESTORE_DRILL_POSTGRES_USER,
      "--dbname",
      names.target,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      BACKUP_PATH
    ], "Isolated PostgreSQL restore");
    runRestoreDrillMigrations(targetUrl);
    runRestoreDrillMigrations(targetUrl);
    const targetEvidence = await collectRestoreDrillEvidence(targetUrl);
    assertEquivalentRestoreEvidence(sourceEvidence, targetEvidence);

    const restoreDurationMs = Date.now() - restoreStartedAt;
    const totalRows = Object.values(targetEvidence.tableCounts).reduce((sum, count) => sum + count, 0);
    console.log(JSON.stringify({
      event: "arcigy_postgres_restore_drill",
      outcome: "passed",
      image: config.image,
      schema: RESTORE_DRILL_SCHEMA,
      backupSha256: backupChecksum,
      migrationCount: targetEvidence.migrationVersions.length,
      tableCount: Object.keys(targetEvidence.tableCounts).length,
      rowCount: totalRows,
      constraintCount: targetEvidence.constraintCount,
      indexCount: targetEvidence.indexCount,
      representativeProject: {
        pricingTotal: targetEvidence.representative.pricingTotal,
        bomItemCount: targetEvidence.representative.bomItemCount,
        assetReferenceCount: targetEvidence.representative.assetReferenceCount,
        tenantBoundaryLeakCount: targetEvidence.representative.tenantBoundaryLeakCount
      },
      achievedRpoSeconds: 0,
      achievedRtoSeconds: Number((restoreDurationMs / 1000).toFixed(3))
    }));
  } finally {
    cleanup();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await runDockerPostgresRestoreDrill();
