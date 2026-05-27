import { createFileProjectRepository, type ProjectRepository } from "../core/project/project-repository";
import { createPostgresProjectRepository } from "../core/project/project-postgres-repository";

export type ProjectRepositoryConfig = {
  projectRoot: string;
};

export function getProjectDatabaseUrl(): string | null {
  return process.env.KITCHEN_PROJECT_DATABASE_URL || process.env.PROJECT_DATABASE_URL || null;
}

export function createServerProjectRepository(config: ProjectRepositoryConfig): ProjectRepository {
  const storage = process.env.KITCHEN_PROJECT_STORAGE?.toLowerCase();
  const connectionString = getProjectDatabaseUrl();
  if (storage === "postgres" || (storage !== "file" && connectionString)) {
    if (!connectionString) {
      throw new Error("KITCHEN_PROJECT_DATABASE_URL is required when KITCHEN_PROJECT_STORAGE=postgres.");
    }
    return createPostgresProjectRepository({
      connectionString,
      projectRoot: config.projectRoot
    });
  }
  return createFileProjectRepository(config.projectRoot);
}
