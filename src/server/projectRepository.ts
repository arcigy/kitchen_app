import { createFileProjectRepository, type ProjectRepository } from "../core/project/project-repository";
import { createPostgresProjectRepository } from "../core/project/project-postgres-repository";
import { getDatabaseUrl, resolveDatabaseConfig } from "../core/database/database-config";

export type ProjectRepositoryConfig = {
  projectRoot: string;
};

export function getProjectDatabaseUrl(): string | null {
  return getDatabaseUrl();
}

export function createServerProjectRepository(config: ProjectRepositoryConfig): ProjectRepository {
  const storage = process.env.KITCHEN_PROJECT_STORAGE?.toLowerCase();
  const databaseConfig = storage === "file" ? null : resolveDatabaseConfig();
  if (storage === "postgres" || (storage !== "file" && databaseConfig)) {
    if (!databaseConfig) {
      throw new Error("KITCHEN_PROJECT_DATABASE_URL is required when KITCHEN_PROJECT_STORAGE=postgres.");
    }
    return createPostgresProjectRepository({
      connectionString: databaseConfig.connectionString,
      projectRoot: config.projectRoot,
      schema: databaseConfig.schema
    });
  }
  return createFileProjectRepository(config.projectRoot);
}
