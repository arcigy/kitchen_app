import { Pool, type PoolClient } from "pg";
import { quotePgIdentifier } from "./database-config";
import { REQUIRED_DATABASE_MIGRATION_VERSION } from "./migration-version";
import { attachPostgresPoolErrorHandler } from "./postgres-pool-error-handler";

const pools = new Map<string, Pool>();
const verifiedSchemas = new Set<string>();

function poolKey(connectionString: string, schema: string): string {
  return `${connectionString}#schema=${schema}`;
}

export function getSchemaPool(connectionString: string, schema: string): Pool {
  const key = poolKey(connectionString, schema);
  const existing = pools.get(key);
  if (existing) return existing;
  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
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
    "SELECT version FROM schema_migrations WHERE version = $1",
    [REQUIRED_DATABASE_MIGRATION_VERSION]
  ).catch((error: unknown) => {
    throw new Error(`Database schema "${schema}" is not migrated. Run npm run db:migrate -- --schema ${schema}. ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!result.rows[0]) {
    throw new Error(`Database schema "${schema}" is missing migration ${REQUIRED_DATABASE_MIGRATION_VERSION}. Run npm run db:migrate -- --schema ${schema}.`);
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
  try {
    await client.query(`SET search_path TO ${quotePgIdentifier(schema)}, public`);
    await assertSchemaMigrated(client, key, schema);
    return await fn(client);
  } finally {
    client.release();
  }
}
