import { resolveDatabaseConfig } from "../core/database/database-config";
import { withSchemaClient } from "../core/database/postgres-client";

export type DatabaseReadiness = {
  ok: true;
  storage: "file" | "postgres";
  latencyMs: number;
};

export async function checkDatabaseReadiness(
  env: NodeJS.ProcessEnv = process.env
): Promise<DatabaseReadiness> {
  const startedAt = Date.now();
  const config = resolveDatabaseConfig(env);
  if (!config) return { ok: true, storage: "file", latencyMs: Date.now() - startedAt };
  await withSchemaClient(config.connectionString, config.schema, async (client) => {
    await client.query("SELECT 1");
  });
  return { ok: true, storage: "postgres", latencyMs: Date.now() - startedAt };
}
