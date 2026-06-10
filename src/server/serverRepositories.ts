import { createInMemoryUserRepository } from "../core/auth/user-repository";
import { createPostgresUserRepository } from "../core/auth/user-postgres-repository";
import { createUserService, type UserService } from "../core/auth/user-service";
import { createFileClientCatalogRepository } from "../core/catalog/catalog-file-repository";
import { createPostgresClientCatalogRepository } from "../core/catalog/catalog-postgres-repository";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import { resolveDatabaseConfig } from "../core/database/database-config";
import { createFileModulePackageRepository, type ModulePackageRepository } from "../core/module-package/module-package-repository";
import { createPostgresModulePackageRepository } from "../core/module-package/module-package-postgres-repository";

function shouldUseDatabase(): boolean {
  const storage = process.env.KITCHEN_PROJECT_STORAGE?.toLowerCase();
  return storage !== "file" && !!resolveDatabaseConfig();
}

export function createServerUserService(): UserService {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return createUserService(databaseConfig
    ? createPostgresUserRepository(databaseConfig)
    : createInMemoryUserRepository());
}

export function createServerCatalogRepository(projectRoot: string): ClientCatalogRepository {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return databaseConfig
    ? createPostgresClientCatalogRepository(databaseConfig)
    : createFileClientCatalogRepository(projectRoot);
}

export function createServerModulePackageRepository(projectRoot: string): ModulePackageRepository {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return databaseConfig
    ? createPostgresModulePackageRepository(databaseConfig)
    : createFileModulePackageRepository(projectRoot);
}
