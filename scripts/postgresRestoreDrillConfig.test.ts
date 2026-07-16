import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  assertDisposableContainerName,
  assertEquivalentRestoreEvidence,
  assertLocalDockerEndpoint,
  createDisposableContainerName,
  createDisposableDatabaseNames,
  parsePublishedPostgresPort,
  resolvePortablePostgresBin,
  resolveRestoreDrillConfig,
  type RestoreDrillEvidence
} from "./postgresRestoreDrillConfig";

const evidence: RestoreDrillEvidence = {
  tableCounts: { arcigy_projects: 2, schema_migrations: 4 },
  tableDigests: { arcigy_projects: "abc", schema_migrations: "def" },
  migrationVersions: ["0001_core", "0002_supplier_bridge", "0003_supplier_exact_catalog", "0004_client_suppliers"],
  constraintCount: 20,
  invalidConstraintCount: 0,
  indexCount: 25,
  invalidIndexCount: 0,
  representative: {
    pricingTotal: "1234.56",
    bomItemCount: 2,
    assetReferenceCount: 1,
    tenantBoundaryLeakCount: 0
  }
};

describe("PostgreSQL restore drill safety config", () => {
  it("requires explicit isolation and rejects every existing database URL", () => {
    expect(() => resolveRestoreDrillConfig({})).toThrow("ARCIGY_RESTORE_DRILL_ISOLATED");
    for (const key of ["DATABASE_URL", "KITCHEN_PROJECT_DATABASE_URL", "PROJECT_DATABASE_URL"]) {
      expect(() => resolveRestoreDrillConfig({
        ARCIGY_RESTORE_DRILL_ISOLATED: "true",
        [key]: "postgresql://online.example/tenant"
      })).toThrow(`${key} must be unset`);
    }
  });

  it("accepts only PostgreSQL 16 Alpine images and local Docker endpoints", () => {
    expect(resolveRestoreDrillConfig({ ARCIGY_RESTORE_DRILL_ISOLATED: "true" }).image).toBe("postgres:16-alpine");
    expect(() => resolveRestoreDrillConfig({
      ARCIGY_RESTORE_DRILL_ISOLATED: "true",
      ARCIGY_RESTORE_DRILL_IMAGE: "postgres:latest"
    })).toThrow("PostgreSQL 16 Alpine");
    expect(() => assertLocalDockerEndpoint("tcp://remote.example:2376")).toThrow("local Docker engine");
    expect(() => assertLocalDockerEndpoint("ssh://operator@server")).toThrow("local Docker engine");
    expect(() => assertLocalDockerEndpoint("npipe:////./pipe/docker_engine")).not.toThrow();
    expect(() => assertLocalDockerEndpoint("unix:///var/run/docker.sock")).not.toThrow();
  });

  it("requires an absolute portable PostgreSQL binary directory", () => {
    expect(() => resolvePortablePostgresBin({})).toThrow("ARCIGY_RESTORE_DRILL_POSTGRES_BIN");
    expect(() => resolvePortablePostgresBin({ ARCIGY_RESTORE_DRILL_POSTGRES_BIN: "pgsql/bin" })).toThrow("absolute");
    const absoluteBinPath = path.resolve("tools", "pgsql", "bin");
    expect(resolvePortablePostgresBin({ ARCIGY_RESTORE_DRILL_POSTGRES_BIN: absoluteBinPath }))
      .toBe(path.normalize(absoluteBinPath));
  });

  it("generates and validates only disposable resource names", () => {
    expect(createDisposableDatabaseNames("AbC-123_xyz")).toEqual({
      source: "arcigy_restore_drill_source_abc123xyz",
      target: "arcigy_restore_drill_target_abc123xyz"
    });
    expect(createDisposableContainerName("abc-123")).toBe("arcigy-restore-drill-abc-123");
    expect(() => assertDisposableContainerName("postgres-production")).toThrow("outside");
  });

  it("accepts only loopback Docker port mappings", () => {
    expect(parsePublishedPostgresPort("127.0.0.1:49172\n")).toBe(49172);
    expect(parsePublishedPostgresPort("[::1]:49173\n")).toBe(49173);
    expect(() => parsePublishedPostgresPort("0.0.0.0:5432\n")).toThrow("loopback-only");
  });

  it("requires exact restored counts, digests, schema validity, and representative data", () => {
    expect(() => assertEquivalentRestoreEvidence(evidence, structuredClone(evidence))).not.toThrow();
    expect(() => assertEquivalentRestoreEvidence(evidence, {
      ...structuredClone(evidence),
      tableCounts: { ...evidence.tableCounts, arcigy_projects: 1 }
    })).toThrow("arcigy_projects");
    expect(() => assertEquivalentRestoreEvidence(evidence, {
      ...structuredClone(evidence),
      invalidIndexCount: 1
    })).toThrow();
    expect(() => assertEquivalentRestoreEvidence(evidence, {
      ...structuredClone(evidence),
      representative: { ...evidence.representative, tenantBoundaryLeakCount: 1 }
    })).toThrow();
  });
});
