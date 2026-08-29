import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import {
  assertEnvironmentSchemaMatch,
  assertValidDatabaseSchema,
  getDatabaseUrl,
  normalizeAppEnvironment,
  quotePgIdentifier
} from "../src/core/database/database-config";

type Args = {
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--schema") args.schema = argv[++index];
    else if (item.startsWith("--schema=")) args.schema = item.slice("--schema=".length);
    else if (item === "--database-url") args.databaseUrl = argv[++index];
    else if (item.startsWith("--database-url=")) args.databaseUrl = item.slice("--database-url=".length);
    else if (item === "--app-env") args.appEnv = argv[++index];
    else if (item.startsWith("--app-env=")) args.appEnv = item.slice("--app-env=".length);
    else throw new Error(`Unsupported argument: ${item}`);
  }
  return args;
}

function migrationVersion(fileName: string): string {
  return fileName.replace(/\.sql$/i, "");
}

const args = parseArgs(process.argv.slice(2));
const connectionString = args.databaseUrl || getDatabaseUrl();
if (!connectionString) throw new Error("DATABASE_URL or KITCHEN_PROJECT_DATABASE_URL is required.");

const inferredAppEnv = args.appEnv || process.env.APP_ENV || (args.schema === "prod" || args.schema === "dev" ? args.schema : undefined);
const appEnv = normalizeAppEnvironment(inferredAppEnv, process.env.NODE_ENV);
const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
assertEnvironmentSchemaMatch(appEnv, schema);

const pool = new Pool({ connectionString, max: 1 });
const migrationsDir = path.join(process.cwd(), "db", "migrations");
const schemaSql = quotePgIdentifier(schema);

try {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaSql}`);
    await client.query(`SET search_path TO ${schemaSql}, public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const version = migrationVersion(file);
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (applied.rowCount) {
        console.log(`[db:migrate] ${schema}.${version} already applied`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO ${schemaSql}, public`);
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [version, file]);
        await client.query("COMMIT");
        console.log(`[db:migrate] applied ${schema}.${version}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
