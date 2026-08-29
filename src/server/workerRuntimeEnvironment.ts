import {
  resolveDatabaseConfig,
  resolveObjectStoragePrefix,
  type ArcigyAppEnvironment
} from "../core/database/database-config";

export type WorkerRuntimeEnvironment = {
  appEnv: Extract<ArcigyAppEnvironment, "dev" | "prod">;
  databaseSchema: string;
  objectStoragePrefix: string;
  projectStorage: "postgres";
};

const requireExplicitNamespace = (
  env: NodeJS.ProcessEnv,
  key: "APP_ENV" | "DATABASE_SCHEMA" | "ARCIGY_OBJECT_STORAGE_PREFIX"
): string => {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required for a production worker runtime.`);
  }
  return value;
};

export function assertWorkerRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env
): WorkerRuntimeEnvironment | null {
  if (env.NODE_ENV !== "production") return null;

  const projectStorage = env.KITCHEN_PROJECT_STORAGE?.trim().toLowerCase();
  if (projectStorage !== "postgres") {
    throw new Error("KITCHEN_PROJECT_STORAGE=postgres is required for a production worker runtime.");
  }

  const appEnv = requireExplicitNamespace(env, "APP_ENV");
  if (appEnv !== "dev" && appEnv !== "prod") {
    throw new Error("APP_ENV must be exactly dev or prod for a production worker runtime.");
  }

  requireExplicitNamespace(env, "DATABASE_SCHEMA");
  requireExplicitNamespace(env, "ARCIGY_OBJECT_STORAGE_PREFIX");
  const databaseConfig = resolveDatabaseConfig(env);
  if (!databaseConfig) {
    throw new Error("A PostgreSQL connection is required for a production worker runtime.");
  }
  const resolvedObjectStoragePrefix = resolveObjectStoragePrefix(env);

  return {
    appEnv,
    databaseSchema: databaseConfig.schema,
    objectStoragePrefix: resolvedObjectStoragePrefix,
    projectStorage: "postgres"
  };
}
