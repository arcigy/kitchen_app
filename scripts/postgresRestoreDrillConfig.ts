const DATABASE_URL_KEYS = [
  "DATABASE_URL",
  "KITCHEN_PROJECT_DATABASE_URL",
  "PROJECT_DATABASE_URL"
] as const;

const DISPOSABLE_NAME_RE = /^arcigy_restore_drill_(?:source|target)_[a-z0-9]{6,32}$/;
const CONTAINER_NAME_RE = /^arcigy-restore-drill-[a-z0-9-]{6,48}$/;
const POSTGRES_IMAGE_RE = /^postgres:16(?:\.[0-9]+)?-alpine(?:@sha256:[a-f0-9]{64})?$/;

export const RESTORE_DRILL_DOCKER_LABEL = "com.arcigy.restore-drill";
export const RESTORE_DRILL_SCHEMA = "arcigy_restore_drill";
export const DEFAULT_RESTORE_DRILL_IMAGE = "postgres:16-alpine";

export type RestoreDrillEvidence = {
  tableCounts: Record<string, number>;
  tableDigests: Record<string, string>;
  migrationVersions: string[];
  constraintCount: number;
  invalidConstraintCount: number;
  indexCount: number;
  invalidIndexCount: number;
  representative: {
    pricingTotal: string;
    bomItemCount: number;
    assetReferenceCount: number;
    tenantBoundaryLeakCount: number;
  };
};

export type RestoreDrillConfig = {
  image: string;
};

export function resolveRestoreDrillConfig(env: NodeJS.ProcessEnv = process.env): RestoreDrillConfig {
  if (env.ARCIGY_RESTORE_DRILL_ISOLATED !== "true") {
    throw new Error("ARCIGY_RESTORE_DRILL_ISOLATED=true is required for the disposable PostgreSQL restore drill.");
  }
  for (const key of DATABASE_URL_KEYS) {
    if (env[key]?.trim()) {
      throw new Error(`${key} must be unset. The restore drill never accepts an existing database connection.`);
    }
  }
  const image = env.ARCIGY_RESTORE_DRILL_IMAGE?.trim() || DEFAULT_RESTORE_DRILL_IMAGE;
  if (!POSTGRES_IMAGE_RE.test(image)) {
    throw new Error("ARCIGY_RESTORE_DRILL_IMAGE must be an official PostgreSQL 16 Alpine image or pinned digest.");
  }
  return { image };
}

export function resolvePortablePostgresBin(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.ARCIGY_RESTORE_DRILL_POSTGRES_BIN?.trim();
  if (!value) throw new Error("ARCIGY_RESTORE_DRILL_POSTGRES_BIN is required for the portable restore drill.");
  if (!path.isAbsolute(value)) throw new Error("ARCIGY_RESTORE_DRILL_POSTGRES_BIN must be an absolute local path.");
  return path.normalize(value);
}

export function assertLocalDockerEndpoint(endpoint: string): void {
  const normalized = endpoint.trim().toLowerCase();
  if (normalized.startsWith("npipe://") || normalized.startsWith("unix://")) return;
  throw new Error("The restore drill requires a local Docker engine and refuses tcp/ssh/remote Docker endpoints.");
}

export function createDisposableDatabaseNames(nonce: string): { source: string; target: string } {
  const safeNonce = nonce.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
  if (safeNonce.length < 6) throw new Error("Restore drill nonce is too short.");
  const source = `arcigy_restore_drill_source_${safeNonce}`;
  const target = `arcigy_restore_drill_target_${safeNonce}`;
  assertDisposableDatabaseName(source);
  assertDisposableDatabaseName(target);
  return { source, target };
}

export function assertDisposableDatabaseName(name: string): void {
  if (!DISPOSABLE_NAME_RE.test(name)) {
    throw new Error("Refusing a PostgreSQL database name outside the Arcigy restore-drill namespace.");
  }
}

export function createDisposableContainerName(nonce: string): string {
  const safeNonce = nonce.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
  const name = `arcigy-restore-drill-${safeNonce}`;
  if (!CONTAINER_NAME_RE.test(name)) throw new Error("Restore drill container nonce is invalid.");
  return name;
}

export function assertDisposableContainerName(name: string): void {
  if (!CONTAINER_NAME_RE.test(name)) {
    throw new Error("Refusing a Docker container outside the Arcigy restore-drill namespace.");
  }
}

export function parsePublishedPostgresPort(output: string): number {
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})$/);
    if (!match) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  }
  throw new Error("Docker did not publish PostgreSQL on a loopback-only port.");
}

export function assertEquivalentRestoreEvidence(
  source: RestoreDrillEvidence,
  target: RestoreDrillEvidence
): void {
  assertRecordEqual("table counts", source.tableCounts, target.tableCounts);
  assertRecordEqual("table digests", source.tableDigests, target.tableDigests);
  if (JSON.stringify(source.migrationVersions) !== JSON.stringify(target.migrationVersions)) {
    throw new Error("Restored migration versions differ from the source backup.");
  }
  for (const field of [
    "constraintCount",
    "invalidConstraintCount",
    "indexCount",
    "invalidIndexCount"
  ] as const) {
    if (source[field] !== target[field]) throw new Error(`Restored ${field} differs from the source backup.`);
  }
  if (JSON.stringify(source.representative) !== JSON.stringify(target.representative)) {
    throw new Error("Restored representative project, pricing, BOM, asset, or tenant evidence differs from source.");
  }
  if (target.invalidConstraintCount !== 0 || target.invalidIndexCount !== 0) {
    throw new Error("The restored schema contains an invalid constraint or index.");
  }
  if (target.representative.tenantBoundaryLeakCount !== 0) {
    throw new Error("The restored representative tenant-boundary check failed.");
  }
}

function assertRecordEqual(label: string, source: Record<string, number | string>, target: Record<string, number | string>): void {
  const sourceKeys = Object.keys(source).sort();
  const targetKeys = Object.keys(target).sort();
  if (JSON.stringify(sourceKeys) !== JSON.stringify(targetKeys)) {
    throw new Error(`Restored ${label} contain a different table set.`);
  }
  for (const key of sourceKeys) {
    if (source[key] !== target[key]) throw new Error(`Restored ${label} differ for ${key}.`);
  }
}
import path from "node:path";
