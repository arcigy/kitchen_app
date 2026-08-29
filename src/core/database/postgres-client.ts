import { Pool, type PoolClient } from "pg";
import { quotePgIdentifier } from "./database-config";
import { REQUIRED_DATABASE_MIGRATION_VERSIONS } from "./migration-version";
import { attachPostgresPoolErrorHandler } from "./postgres-pool-error-handler";
import { isTransientPostgresError } from "./postgres-error";
import { resolvePostgresPoolConfig } from "./postgres-pool-config";

const pools = new Map<string, Pool>();
const verifiedSchemas = new Set<string>();

function poolKey(connectionString: string, schema: string): string {
  return `${connectionString}#schema=${schema}`;
}

export function getSchemaPool(connectionString: string, schema: string): Pool {
  const key = poolKey(connectionString, schema);
  const existing = pools.get(key);
  if (existing) return existing;
  const pool = new Pool(resolvePostgresPoolConfig(connectionString));
  attachPostgresPoolErrorHandler(pool, "postgres", schema);
  pools.set(key, pool);
  return pool;
}

export async function closeSchemaPools(): Promise<void> {
  const openPools = [...pools.values()];
  pools.clear();
  verifiedSchemas.clear();
  await Promise.all(openPools.map((pool) => pool.end()));
}

async function assertSchemaMigrated(client: PoolClient, key: string, schema: string): Promise<void> {
  if (verifiedSchemas.has(key)) return;
  const result = await client.query<{ version: string }>(
    "SELECT version FROM schema_migrations WHERE version = ANY($1::text[])",
    [REQUIRED_DATABASE_MIGRATION_VERSIONS]
  ).catch((error: unknown) => {
    throw new Error(`Database schema "${schema}" is not migrated. Run npm run db:migrate -- --schema ${schema}. ${error instanceof Error ? error.message : String(error)}`);
  });
  const appliedVersions = new Set(result.rows.map((row) => row.version));
  const missingVersions = REQUIRED_DATABASE_MIGRATION_VERSIONS.filter((version) => !appliedVersions.has(version));
  if (missingVersions.length > 0) {
    throw new Error(`Database schema "${schema}" is missing migration ${missingVersions[0]}. Run npm run db:migrate -- --schema ${schema}.`);
  }
  verifiedSchemas.add(key);
}

export async function withSchemaClient<T>(
  connectionString: string,
  schema: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const key = poolKey(connectionString, schema);
  const pool = getSchemaPool(connectionString, schema);
  const client = await pool.connect();
  let released = false;
  try {
    await client.query(`SET search_path TO ${quotePgIdentifier(schema)}, public`);
    await assertSchemaMigrated(client, key, schema);
    return await fn(client);
  } catch (error) {
    if (isTransientPostgresError(error)) {
      client.release(true);
      released = true;
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}
