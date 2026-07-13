import { createInMemoryUserRepository } from "../core/auth/user-repository";
import { createPostgresUserRepository } from "../core/auth/user-postgres-repository";
import { createUserService, type UserService } from "../core/auth/user-service";
import { createFileClientCatalogRepository } from "../core/catalog/catalog-file-repository";
import { createPostgresClientCatalogRepository } from "../core/catalog/catalog-postgres-repository";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import { loadPostgresClientProfile } from "../core/client/client-postgres-repository";
import { getSeededClientProfile } from "../core/client/client-repository";
import type { ClientProfile } from "../core/client/client-types";
import { getDatabaseUrl, resolveDatabaseConfig } from "../core/database/database-config";
import { createFileModulePackageRepository, type ModulePackageRepository } from "../core/module-package/module-package-repository";
import { createPostgresModulePackageRepository } from "../core/module-package/module-package-postgres-repository";
import { createFileSupplierBridgeRepository } from "../core/supplier-bridge/supplier-bridge-file-repository";
import { createPostgresSupplierBridgeRepository } from "../core/supplier-bridge/supplier-bridge-postgres-repository";
import type { SupplierBridgeRepository } from "../core/supplier-bridge/supplier-bridge-repository";
import { createSeedSupplierConfigurationRepository, type SupplierConfigurationRepository } from "../core/supplier-configuration/supplier-configuration-repository";
import { createPostgresSupplierConfigurationRepository } from "../core/supplier-configuration/supplier-configuration-postgres-repository";

export function shouldUseDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  const storage = env.KITCHEN_PROJECT_STORAGE?.toLowerCase();
  if (storage === "file") return false;
  if (storage === "postgres" && !getDatabaseUrl(env)) {
    throw new Error("DATABASE_URL, KITCHEN_PROJECT_DATABASE_URL, or complete POSTGRES_* env vars are required when KITCHEN_PROJECT_STORAGE=postgres.");
  }
  return !!resolveDatabaseConfig(env);
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

export function createServerSupplierBridgeRepository(projectRoot: string): SupplierBridgeRepository {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return databaseConfig
    ? createPostgresSupplierBridgeRepository(databaseConfig)
    : createFileSupplierBridgeRepository(projectRoot);
}

export function createServerSupplierConfigurationRepository(): SupplierConfigurationRepository {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return databaseConfig
    ? createPostgresSupplierConfigurationRepository(databaseConfig)
    : createSeedSupplierConfigurationRepository();
}

export async function loadServerClientProfile(clientId: string): Promise<ClientProfile | null> {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  if (databaseConfig) {
    return loadPostgresClientProfile({
      connectionString: databaseConfig.connectionString,
      schema: databaseConfig.schema,
      clientId
    });
  }
  return getSeededClientProfile(clientId);
}
