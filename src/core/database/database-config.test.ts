import { describe, expect, it } from "vitest";
import {
  resolveDatabaseConfig,
  resolveObjectStoragePrefix,
  quotePgIdentifier
} from "./database-config";
import { buildObjectStorageKey } from "../storage/object-storage";

describe("database environment config", () => {
  it("requires explicit app env and schema for production Postgres", () => {
    expect(() => resolveDatabaseConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://example"
    })).toThrow("APP_ENV is required");
    expect(() => resolveDatabaseConfig({
      NODE_ENV: "production",
      APP_ENV: "prod",
      DATABASE_URL: "postgres://example"
    })).toThrow("DATABASE_SCHEMA is required");
  });

  it("rejects prod/dev schema cross-wiring", () => {
    expect(() => resolveDatabaseConfig({
      NODE_ENV: "production",
      APP_ENV: "prod",
      DATABASE_SCHEMA: "dev",
      DATABASE_URL: "postgres://example"
    })).toThrow("APP_ENV=prod must use DATABASE_SCHEMA=prod");
    expect(() => resolveDatabaseConfig({
      NODE_ENV: "production",
      APP_ENV: "dev",
      DATABASE_SCHEMA: "prod",
      DATABASE_URL: "postgres://example"
    })).toThrow("APP_ENV=dev must use DATABASE_SCHEMA=dev");
  });

  it("accepts separate CapRover prod and dev schemas on one database url", () => {
    expect(resolveDatabaseConfig({
      NODE_ENV: "production",
      APP_ENV: "prod",
      DATABASE_SCHEMA: "prod",
      DATABASE_URL: "postgres://same-db"
    })).toEqual({ appEnv: "prod", schema: "prod", connectionString: "postgres://same-db" });
    expect(resolveDatabaseConfig({
      NODE_ENV: "production",
      APP_ENV: "dev",
      DATABASE_SCHEMA: "dev",
      DATABASE_URL: "postgres://same-db"
    })).toEqual({ appEnv: "dev", schema: "dev", connectionString: "postgres://same-db" });
  });

  it("quotes only safe schema identifiers", () => {
    expect(quotePgIdentifier("prod_test")).toBe("\"prod_test\"");
    expect(() => quotePgIdentifier("prod;drop schema dev")).toThrow("DATABASE_SCHEMA");
  });
});

describe("object storage prefix", () => {
  it("keeps prod and dev assets under separate prefixes", () => {
    expect(resolveObjectStoragePrefix({ NODE_ENV: "production", APP_ENV: "prod", ARCIGY_OBJECT_STORAGE_PREFIX: "prod" })).toBe("prod");
    expect(resolveObjectStoragePrefix({ NODE_ENV: "production", APP_ENV: "dev", ARCIGY_OBJECT_STORAGE_PREFIX: "dev" })).toBe("dev");
    expect(() => resolveObjectStoragePrefix({ NODE_ENV: "production", APP_ENV: "prod", ARCIGY_OBJECT_STORAGE_PREFIX: "dev" })).toThrow("APP_ENV=prod");
  });

  it("builds environment-prefixed object keys", () => {
    expect(buildObjectStorageKey({
      clientId: "client_arcigy_demo",
      projectId: "project_a",
      phaseId: "phase_1",
      bucket: "uploads",
      assetId: "asset_1",
      fileName: "preview.png"
    }, { NODE_ENV: "production", APP_ENV: "dev", ARCIGY_OBJECT_STORAGE_PREFIX: "dev" })).toBe(
      "dev/organizations/client_arcigy_demo/projects/project_a/phases/phase_1/uploads/asset_1-preview.png"
    );
  });
});
