import { closePostgresProjectPools, createPostgresProjectRepository } from "../src/core/project/project-postgres-repository";
import { resolveDatabaseConfig } from "../src/core/database/database-config";

const databaseConfig = resolveDatabaseConfig();
if (!databaseConfig) {
  throw new Error("DATABASE_URL, KITCHEN_PROJECT_DATABASE_URL, or complete POSTGRES_* env vars are required. The old local 127.0.0.1 fallback is disabled.");
}

try {
  await createPostgresProjectRepository({
    connectionString: databaseConfig.connectionString,
    projectRoot: process.cwd(),
    schema: databaseConfig.schema
  }).listProjects({
    clientId: "db_init",
    userId: "db_init",
    roles: ["owner"],
    isSystemAdmin: true
  });

  console.log("[project-db] schema is ready");
} finally {
  await closePostgresProjectPools();
}
