import { describe, expect, it } from "vitest";
import { resolvePostgresPoolConfig } from "./postgres-pool-config";

describe("resolvePostgresPoolConfig", () => {
  it("uses a bounded production pool and defensive timeouts", () => {
    const config = resolvePostgresPoolConfig("postgresql://example/db", { NODE_ENV: "production" });
    expect(config).toMatchObject({
      max: 16,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
      keepAlive: true
    });
  });

  it("supports explicit capacity without accepting invalid values", () => {
    expect(resolvePostgresPoolConfig("postgresql://example/db", { POSTGRES_POOL_MAX: "24" }).max).toBe(24);
    expect(() => resolvePostgresPoolConfig("postgresql://example/db", { POSTGRES_POOL_MAX: "0" })).toThrow(
      "POSTGRES_POOL_MAX must be a positive integer."
    );
  });
});
