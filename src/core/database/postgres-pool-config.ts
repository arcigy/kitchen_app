import type { PoolConfig } from "pg";

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

export function resolvePostgresPoolConfig(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): PoolConfig {
  const production = env.NODE_ENV === "production";
  return {
    connectionString,
    max: positiveInteger(env.POSTGRES_POOL_MAX, production ? 16 : 8, "POSTGRES_POOL_MAX"),
    idleTimeoutMillis: positiveInteger(env.POSTGRES_POOL_IDLE_TIMEOUT_MS, 30_000, "POSTGRES_POOL_IDLE_TIMEOUT_MS"),
    connectionTimeoutMillis: positiveInteger(env.POSTGRES_CONNECT_TIMEOUT_MS, 5_000, "POSTGRES_CONNECT_TIMEOUT_MS"),
    query_timeout: positiveInteger(env.POSTGRES_QUERY_TIMEOUT_MS, 30_000, "POSTGRES_QUERY_TIMEOUT_MS"),
    statement_timeout: positiveInteger(env.POSTGRES_STATEMENT_TIMEOUT_MS, 30_000, "POSTGRES_STATEMENT_TIMEOUT_MS"),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000
  };
}
