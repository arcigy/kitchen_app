import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type UnknownRecord = Record<string, unknown>;

export type CapRoverDeployExpectation = {
  appName: string;
  appEnv: "dev" | "prod";
  databaseSchema: string;
  objectStoragePrefix: string;
  storageContainerPath: string;
  publicUrl: string;
};

export type CapRoverDeployPreflightResult = {
  appName: string;
  appEnv: "dev" | "prod";
  databaseSchema: string;
  objectStoragePrefix: string;
  storageContainerPath: string;
  publicHost: string;
  instanceCount: 1;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeContainerPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized || "/";
}

function fail(message: string): never {
  throw new Error(`CapRover deploy preflight failed: ${message}`);
}

function appDefinitionsFromPayload(payload: unknown): UnknownRecord[] {
  if (!isRecord(payload)) fail("appDefinitions response is not a JSON object.");
  const data = isRecord(payload.data) ? payload.data : payload;
  if (!Array.isArray(data.appDefinitions)) fail("appDefinitions response has no appDefinitions array.");
  return data.appDefinitions.filter(isRecord);
}

function assertPublicUrlMatchesTarget(payload: unknown, app: UnknownRecord, expected: CapRoverDeployExpectation): string {
  if (!isRecord(payload)) fail("appDefinitions response is not a JSON object.");
  const data = isRecord(payload.data) ? payload.data : payload;
  if (typeof data.rootDomain !== "string" || !data.rootDomain.trim()) fail("appDefinitions response has no rootDomain.");

  let publicUrl: URL;
  try {
    publicUrl = new URL(expected.publicUrl);
  } catch {
    fail("CAPROVER_APP_URL is not a valid URL.");
  }
  if (publicUrl.protocol !== "https:") fail("CAPROVER_APP_URL must use HTTPS.");
  if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
    fail("CAPROVER_APP_URL must identify the application origin without a path, query, or fragment.");
  }

  const allowedHosts = new Set([`${expected.appName}.${data.rootDomain.trim()}`.toLowerCase()]);
  if (Array.isArray(app.customDomain)) {
    for (const item of app.customDomain) {
      if (isRecord(item) && typeof item.publicDomain === "string" && item.publicDomain.trim()) {
        allowedHosts.add(item.publicDomain.trim().toLowerCase());
      }
    }
  }
  const publicHost = publicUrl.hostname.toLowerCase();
  if (!allowedHosts.has(publicHost)) fail("CAPROVER_APP_URL does not belong to the selected CapRover application.");
  return publicHost;
}

function environmentFromDefinition(app: UnknownRecord): Map<string, string> {
  if (!Array.isArray(app.envVars)) fail("target application has no envVars array.");
  const env = new Map<string, string>();
  for (const item of app.envVars) {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.value !== "string") {
      fail("target application contains an invalid environment entry.");
    }
    const key = item.key.trim();
    if (!key) fail("target application contains an empty environment key.");
    if (env.has(key)) fail(`target application contains duplicate ${key} entries.`);
    env.set(key, item.value.trim());
  }
  return env;
}

function requireExactEnvironment(env: Map<string, string>, key: string, expected: string): void {
  if (!env.has(key)) fail(`target application is missing ${key}.`);
  if (env.get(key) !== expected) fail(`${key} must be configured for the ${expected} namespace before deployment.`);
}

function hasDatabaseConnection(env: Map<string, string>): boolean {
  if (["DATABASE_URL", "KITCHEN_PROJECT_DATABASE_URL", "PROJECT_DATABASE_URL"].some((key) => !!env.get(key))) return true;
  return ["POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"].every((key) => !!env.get(key))
    || ["KITCHEN_POSTGRES_HOST", "KITCHEN_POSTGRES_USER", "KITCHEN_POSTGRES_PASSWORD", "KITCHEN_POSTGRES_DB"].every((key) => !!env.get(key));
}

function assertDurableStorage(app: UnknownRecord, expectedPath: string): void {
  if (app.hasPersistentData !== true) fail("target application is not marked as persistent.");
  if (app.instanceCount !== 1) fail("file-backed persistent storage requires exactly one application replica.");
  if (!Array.isArray(app.volumes)) fail("target application has no volumes array.");

  const expected = normalizeContainerPath(expectedPath);
  const mount = app.volumes.find((item) => isRecord(item)
    && typeof item.containerPath === "string"
    && normalizeContainerPath(item.containerPath) === expected);
  if (!isRecord(mount)) fail(`target application has no persistent mount at ${expected}.`);
  if (!(typeof mount.volumeName === "string" && mount.volumeName.trim())
    && !(typeof mount.hostPath === "string" && mount.hostPath.trim())) {
    fail(`persistent mount at ${expected} has no volumeName or hostPath.`);
  }
  if (typeof mount.mode === "string" && /^ro$/i.test(mount.mode.trim())) {
    fail(`persistent mount at ${expected} is read-only.`);
  }

  if (typeof app.serviceUpdateOverride === "string"
    && /(^|\n)\s*(volumes|mounts)\s*:/i.test(app.serviceUpdateOverride)) {
    fail("serviceUpdateOverride changes volumes, so the persistent mount cannot be proven safely.");
  }
}

export function validateCapRoverDeployPreflight(
  payload: unknown,
  expected: CapRoverDeployExpectation
): CapRoverDeployPreflightResult {
  const appDefinitions = appDefinitionsFromPayload(payload);
  const app = appDefinitions.find((item) => item.appName === expected.appName);
  if (!app) fail(`application ${expected.appName} does not exist; automatic creation is disabled.`);

  const publicHost = assertPublicUrlMatchesTarget(payload, app, expected);

  const env = environmentFromDefinition(app);
  requireExactEnvironment(env, "APP_ENV", expected.appEnv);
  requireExactEnvironment(env, "DATABASE_SCHEMA", expected.databaseSchema);
  requireExactEnvironment(env, "ARCIGY_OBJECT_STORAGE_PREFIX", expected.objectStoragePrefix);
  requireExactEnvironment(env, "KITCHEN_PROJECT_STORAGE", "postgres");
  if (!hasDatabaseConnection(env)) fail("target application has no complete PostgreSQL connection configuration.");
  assertDurableStorage(app, expected.storageContainerPath);

  return {
    appName: expected.appName,
    appEnv: expected.appEnv,
    databaseSchema: expected.databaseSchema,
    objectStoragePrefix: expected.objectStoragePrefix,
    storageContainerPath: normalizeContainerPath(expected.storageContainerPath),
    publicHost,
    instanceCount: 1
  };
}

export function resolveCapRoverDeployExpectation(env: NodeJS.ProcessEnv = process.env): CapRoverDeployExpectation {
  const appEnv = env.ARCIGY_DEPLOY_APP_ENV === "prod" ? "prod" : "dev";
  return {
    appName: env.CAPROVER_APP?.trim() || "arcigy-kitchen-develop",
    appEnv,
    databaseSchema: env.ARCIGY_DEPLOY_DATABASE_SCHEMA?.trim() || appEnv,
    objectStoragePrefix: env.ARCIGY_DEPLOY_OBJECT_PREFIX?.trim() || appEnv,
    storageContainerPath: env.ARCIGY_DEPLOY_STORAGE_PATH?.trim() || "/app/storage",
    publicUrl: env.CAPROVER_APP_URL?.trim() || ""
  };
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) throw new Error("Usage: tsx scripts/validateCapRoverDeployPreflight.ts <appDefinitions.json>");
  const payload = JSON.parse(await readFile(path.resolve(payloadPath), "utf-8")) as unknown;
  const result = validateCapRoverDeployPreflight(payload, resolveCapRoverDeployExpectation());
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
