import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertWorkerRuntimeEnvironment } from "./workerRuntimeEnvironment";

const productionEnv = (appEnv: "dev" | "prod" = "dev"): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  APP_ENV: appEnv,
  DATABASE_SCHEMA: appEnv,
  ARCIGY_OBJECT_STORAGE_PREFIX: appEnv,
  KITCHEN_PROJECT_STORAGE: "postgres",
  DATABASE_URL: "postgresql://worker-runtime.example/arcigy"
});

describe("worker production runtime environment", () => {
  it("leaves local, test, and isolated file-storage development unchanged", () => {
    expect(assertWorkerRuntimeEnvironment({ NODE_ENV: "development", KITCHEN_PROJECT_STORAGE: "file" })).toBeNull();
    expect(assertWorkerRuntimeEnvironment({ NODE_ENV: "test", KITCHEN_PROJECT_STORAGE: "file" })).toBeNull();
    expect(assertWorkerRuntimeEnvironment({ APP_ENV: "dev", KITCHEN_PROJECT_STORAGE: "file" })).toBeNull();
  });

  it("accepts only explicit isolated PostgreSQL namespaces in production builds", () => {
    expect(assertWorkerRuntimeEnvironment(productionEnv("dev"))).toEqual({
      appEnv: "dev",
      databaseSchema: "dev",
      objectStoragePrefix: "dev",
      projectStorage: "postgres"
    });
    expect(assertWorkerRuntimeEnvironment(productionEnv("prod"))).toEqual({
      appEnv: "prod",
      databaseSchema: "prod",
      objectStoragePrefix: "prod",
      projectStorage: "postgres"
    });
  });

  it("rejects file or implicit storage before a production worker can start", () => {
    expect(() => assertWorkerRuntimeEnvironment({
      ...productionEnv(),
      KITCHEN_PROJECT_STORAGE: "file"
    })).toThrow("KITCHEN_PROJECT_STORAGE=postgres");
    expect(() => assertWorkerRuntimeEnvironment({
      ...productionEnv(),
      KITCHEN_PROJECT_STORAGE: undefined
    })).toThrow("KITCHEN_PROJECT_STORAGE=postgres");
  });

  it.each([
    ["APP_ENV", { APP_ENV: undefined }],
    ["DATABASE_SCHEMA", { DATABASE_SCHEMA: undefined }],
    ["ARCIGY_OBJECT_STORAGE_PREFIX", { ARCIGY_OBJECT_STORAGE_PREFIX: undefined }]
  ] as const)("requires an explicit %s", (key, override) => {
    expect(() => assertWorkerRuntimeEnvironment({ ...productionEnv(), ...override })).toThrow(key);
  });

  it("rejects missing PostgreSQL connectivity and cross-wired namespaces", () => {
    expect(() => assertWorkerRuntimeEnvironment({
      ...productionEnv(),
      DATABASE_URL: undefined
    })).toThrow("PostgreSQL connection");
    expect(() => assertWorkerRuntimeEnvironment({
      ...productionEnv("dev"),
      DATABASE_SCHEMA: "prod"
    })).toThrow("APP_ENV=dev must use DATABASE_SCHEMA=dev");
    expect(() => assertWorkerRuntimeEnvironment({
      ...productionEnv("prod"),
      ARCIGY_OBJECT_STORAGE_PREFIX: "dev"
    })).toThrow("APP_ENV=prod must use ARCIGY_OBJECT_STORAGE_PREFIX=prod");
  });

  it("runs the shared guard before repository creation in both worker entrypoints", async () => {
    const [runtimeWorker, injectableWorker] = await Promise.all([
      readFile(path.join(process.cwd(), "server", "workerServer.ts"), "utf-8"),
      readFile(path.join(process.cwd(), "src", "server", "workerServer.ts"), "utf-8")
    ]);

    for (const source of [runtimeWorker, injectableWorker]) {
      const guard = source.indexOf("assertWorkerRuntimeEnvironment();");
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(source.indexOf("createServerUserService()"));
    }
  });
});
