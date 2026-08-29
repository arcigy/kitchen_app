export type ArcigyAppEnvironment = "prod" | "dev" | "local" | "test";

export type ArcigyDatabaseConfig = {
  connectionString: string;
  schema: string;
  appEnv: ArcigyAppEnvironment;
};

const SCHEMA_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.DATABASE_URL || env.KITCHEN_PROJECT_DATABASE_URL || env.PROJECT_DATABASE_URL || buildPostgresUrlFromParts(env);
}

function buildPostgresUrlFromParts(env: NodeJS.ProcessEnv): string | null {
  const host = env.KITCHEN_POSTGRES_HOST || env.POSTGRES_HOST;
  const user = env.KITCHEN_POSTGRES_USER || env.POSTGRES_USER;
  const password = env.KITCHEN_POSTGRES_PASSWORD || env.POSTGRES_PASSWORD;
  const database = env.KITCHEN_POSTGRES_DB || env.POSTGRES_DB;
  if (!host && !user && !password && !database) return null;
  if (!host || !user || !password || !database) {
    throw new Error("POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are required when using Postgres component env vars.");
  }
  const port = env.KITCHEN_POSTGRES_PORT || env.POSTGRES_PORT || "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

export function normalizeAppEnvironment(value: string | undefined, nodeEnv = process.env.NODE_ENV): ArcigyAppEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "dev" || normalized === "development") return "dev";
  if (normalized === "test") return "test";
  if (normalized === "local" || normalized === "") return "local";
  if (!normalized) {
    if (nodeEnv === "test") return "test";
    if (nodeEnv === "production") {
      throw new Error("APP_ENV is required when Postgres storage runs in production.");
    }
    return "local";
  }
  throw new Error(`Unsupported APP_ENV "${value}". Use prod, dev, local, or test.`);
}

export function assertValidDatabaseSchema(schema: string): string {
  const trimmed = schema.trim();
  if (!SCHEMA_RE.test(trimmed)) {
    throw new Error("DATABASE_SCHEMA must be a safe PostgreSQL schema identifier.");
  }
  return trimmed;
}

export function quotePgIdentifier(identifier: string): string {
  return `"${assertValidDatabaseSchema(identifier).replace(/"/g, "\"\"")}"`;
}

export function assertEnvironmentSchemaMatch(appEnv: ArcigyAppEnvironment, schema: string): void {
  if (appEnv === "prod" && schema !== "prod") {
    throw new Error("APP_ENV=prod must use DATABASE_SCHEMA=prod.");
  }
  if (appEnv === "dev" && schema !== "dev") {
    throw new Error("APP_ENV=dev must use DATABASE_SCHEMA=dev.");
  }
}

export function resolveDatabaseConfig(env: NodeJS.ProcessEnv = process.env): ArcigyDatabaseConfig | null {
  const connectionString = getDatabaseUrl(env);
  if (!connectionString) return null;
  const appEnv = normalizeAppEnvironment(env.APP_ENV, env.NODE_ENV);
  const schema = assertValidDatabaseSchema(env.DATABASE_SCHEMA || defaultSchemaForEnv(appEnv, env.NODE_ENV));
  if (env.NODE_ENV === "production" && !env.DATABASE_SCHEMA) {
    throw new Error("DATABASE_SCHEMA is required when Postgres storage runs in production.");
  }
  assertEnvironmentSchemaMatch(appEnv, schema);
  return { connectionString, schema, appEnv };
}

export function defaultSchemaForEnv(appEnv: ArcigyAppEnvironment, nodeEnv = process.env.NODE_ENV): string {
  if (appEnv === "prod") return "prod";
  if (appEnv === "dev") return "dev";
  if (appEnv === "test") return "test";
  if (nodeEnv === "production") throw new Error("DATABASE_SCHEMA is required in production.");
  return "public";
}

export function resolveObjectStoragePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const appEnv = normalizeAppEnvironment(env.APP_ENV, env.NODE_ENV);
  const prefix = (env.ARCIGY_OBJECT_STORAGE_PREFIX || appEnv).trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.includes("..") || prefix.includes("\\")) {
    throw new Error("ARCIGY_OBJECT_STORAGE_PREFIX is invalid.");
  }
  if (appEnv === "prod" && prefix !== "prod") throw new Error("APP_ENV=prod must use ARCIGY_OBJECT_STORAGE_PREFIX=prod.");
  if (appEnv === "dev" && prefix !== "dev") throw new Error("APP_ENV=dev must use ARCIGY_OBJECT_STORAGE_PREFIX=dev.");
  return prefix;
}
