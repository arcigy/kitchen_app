import type { Pool } from "pg";

type PoolErrorTarget = Pick<Pool, "on">;

export function attachPostgresPoolErrorHandler(pool: PoolErrorTarget, label: string, schema: string): void {
  pool.on("error", (error: Error) => {
    console.warn(`[${label}] idle client error in schema "${schema}": ${error.message}`);
  });
}
