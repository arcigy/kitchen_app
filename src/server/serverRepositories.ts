import { createDevelopmentAuthUsers, createInMemoryUserRepository } from "../core/auth/user-repository";
import { createInMemoryAuthSessionStore, type AuthSessionStore } from "../core/auth/auth-session-store";
import { createPostgresAuthSessionStore } from "../core/auth/auth-session-postgres-store";
import { createPostgresUserRepository } from "../core/auth/user-postgres-repository";
import { createUserService, type UserService } from "../core/auth/user-service";
import { createFileClientCatalogRepository } from "../core/catalog/catalog-file-repository";
import { createPostgresClientCatalogRepository } from "../core/catalog/catalog-postgres-repository";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import { loadPostgresClientProfile, updatePostgresClientLanguage } from "../core/client/client-postgres-repository";
import { getSeededClientProfile } from "../core/client/client-repository";
import type { ClientProfile } from "../core/client/client-types";
import { normalizeLanguage } from "../i18n";
import { getDatabaseUrl, resolveDatabaseConfig } from "../core/database/database-config";
import { createFileModulePackageRepository, type ModulePackageRepository } from "../core/module-package/module-package-repository";
import { createPostgresModulePackageRepository } from "../core/module-package/module-package-postgres-repository";
import { createFileSupplierBridgeRepository } from "../core/supplier-bridge/supplier-bridge-file-repository";
import { createPostgresSupplierBridgeRepository } from "../core/supplier-bridge/supplier-bridge-postgres-repository";
import type { SupplierBridgeRepository } from "../core/supplier-bridge/supplier-bridge-repository";
import { createSeedSupplierConfigurationRepository, type SupplierConfigurationRepository } from "../core/supplier-configuration/supplier-configuration-repository";
import { createPostgresSupplierConfigurationRepository } from "../core/supplier-configuration/supplier-configuration-postgres-repository";
import { createInMemoryUserActivityRepository } from "../core/user-activity/user-activity-repository";
import { createPostgresUserActivityRepository } from "../core/user-activity/user-activity-postgres-repository";
import type { UserActivityRepository } from "../core/user-activity/user-activity-types";

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
  if (!databaseConfig && process.env.ARCIGY_DEV_AUTH_PASSWORD) {
    return createUserService(createInMemoryUserRepository(createDevelopmentAuthUsers(process.env.ARCIGY_DEV_AUTH_PASSWORD)));
  }
  return createUserService(databaseConfig
    ? createPostgresUserRepository(databaseConfig)
    : createInMemoryUserRepository());
}

export function createServerAuthSessionStore(): AuthSessionStore {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return databaseConfig
    ? createPostgresAuthSessionStore(databaseConfig)
    : createInMemoryAuthSessionStore();
}

export function createServerUserActivityRepository(): UserActivityRepository {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  return databaseConfig
    ? createPostgresUserActivityRepository(databaseConfig)
    : createInMemoryUserActivityRepository();
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
  const profile = getSeededClientProfile(clientId);
  if (!profile) return null;
  const language = inMemoryClientLanguage.get(clientId);
  return language ? { ...profile, defaults: { ...profile.defaults, language } } : profile;
}

// Local/file development has no organization settings row. Keep the same
// tenant-wide contract for the lifetime of that server without mutating seeds.
const inMemoryClientLanguage = new Map<string, ClientProfile["defaults"]["language"]>();

export async function updateServerClientLanguage(clientId: string, language: ClientProfile["defaults"]["language"]): Promise<ClientProfile | null> {
  const databaseConfig = shouldUseDatabase() ? resolveDatabaseConfig() : null;
  if (!databaseConfig) {
    if (!getSeededClientProfile(clientId)) return null;
    inMemoryClientLanguage.set(clientId, normalizeLanguage(language));
    return loadServerClientProfile(clientId);
  }
  return updatePostgresClientLanguage({ connectionString: databaseConfig.connectionString, schema: databaseConfig.schema, clientId, language });
}
