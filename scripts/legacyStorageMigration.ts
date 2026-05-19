import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { resolvePhaseBucketPath } from "../src/core/storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageFileName, sanitizeStorageId, type PhaseStorageBucket } from "../src/core/storage/storage-types";

export type LegacyMigrationArgs = {
  projectRoot?: string;
  clientId: string;
  projectId: string;
  phaseId: string;
  sourcePath: string;
  dryRun?: boolean;
  targetBucket?: PhaseStorageBucket;
};

export type LegacyMigrationReport = {
  sourcePath: string;
  targetTenantPath: string;
  clientId: string;
  projectId: string;
  phaseId: string;
  filesCopied: number;
  skippedFiles: string[];
  errors: string[];
  dryRun: boolean;
  timestamp: string;
  deprecated: true;
  nextSteps: string[];
};

type PlannedFile = {
  source: string;
  target: string;
};

const ALLOWED_LEGACY_ROOTS = ["outputs", path.join("public", "debug-pdf"), "exports"];
const STORAGE_BUCKETS = new Set<PhaseStorageBucket>(["saves", "backups", "exports", "renders", "uploads"]);

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function assertInside(root: string, target: string, message: string): void {
  if (!isInside(root, target)) throw new Error(message);
}

function resolveProjectRoot(projectRoot?: string): string {
  return path.resolve(projectRoot ?? process.cwd());
}

function resolveLegacySource(projectRoot: string, sourcePath: string): string {
  const resolved = path.resolve(projectRoot, sourcePath);
  const allowed = ALLOWED_LEGACY_ROOTS.map((root) => path.resolve(projectRoot, root));
  if (!allowed.some((root) => isInside(root, resolved))) {
    throw new Error("Legacy source path is outside allowed legacy roots.");
  }
  return resolved;
}

function sanitizeRelativePath(relativePath: string): string | null {
  const segments = relativePath.split(/[\\/]+/u).filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) return null;
  return path.join(...segments.map((segment) => sanitizeStorageFileName(segment)));
}

async function collectFiles(sourcePath: string, targetRoot: string, sourceRoot = sourcePath): Promise<{ files: PlannedFile[]; skipped: string[] }> {
  const sourceStats = await stat(sourcePath);
  if (sourceStats.isFile()) {
    return {
      files: [{ source: sourcePath, target: path.join(targetRoot, sanitizeStorageFileName(path.basename(sourcePath))) }],
      skipped: []
    };
  }
  if (!sourceStats.isDirectory()) return { files: [], skipped: [sourcePath] };

  const files: PlannedFile[] = [];
  const skipped: string[] = [];
  const entries = await readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(sourcePath, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(entryPath, targetRoot, sourceRoot);
      files.push(...nested.files);
      skipped.push(...nested.skipped);
      continue;
    }
    if (!entry.isFile()) {
      skipped.push(entryPath);
      continue;
    }
    const rel = path.relative(sourceRoot, entryPath);
    const safeRel = sanitizeRelativePath(rel);
    if (!safeRel) {
      skipped.push(entryPath);
      continue;
    }
    files.push({ source: entryPath, target: path.join(targetRoot, safeRel) });
  }
  return { files, skipped };
}

function assertReadOnlyLegacyHelper(dryRun: boolean): void {
  if (!dryRun) {
    throw new Error("scripts/legacyStorageMigration.ts is deprecated and read-only. Use scripts/tenantStorageInventory.ts and scripts/tenantStorageMigration.ts with a trusted mapping file.");
  }
}

export async function migrateLegacyStorage(args: LegacyMigrationArgs): Promise<LegacyMigrationReport> {
  const dryRun = args.dryRun ?? true;
  assertReadOnlyLegacyHelper(dryRun);

  const projectRoot = resolveProjectRoot(args.projectRoot);
  const sourcePath = resolveLegacySource(projectRoot, args.sourcePath);
  const context = {
    userId: "legacy_migration_admin",
    clientId: sanitizeStorageId(args.clientId, "clientId"),
    role: "admin" as const
  };
  const scope = createClientProjectPhaseScope(context, { projectId: args.projectId, phaseId: args.phaseId });
  const bucket = args.targetBucket ?? "uploads";
  if (!STORAGE_BUCKETS.has(bucket)) throw new Error("Unsupported migration target bucket.");

  const targetRoot = path.join(resolvePhaseBucketPath(projectRoot, scope, bucket), "legacy-migration");
  assertInside(path.resolve(projectRoot, "storage", "clients", scope.clientId), targetRoot, "Migration target escapes tenant namespace.");

  const timestamp = new Date().toISOString();
  const { skipped } = await collectFiles(sourcePath, targetRoot);
  const report: LegacyMigrationReport = {
    sourcePath,
    targetTenantPath: targetRoot,
    clientId: scope.clientId,
    projectId: scope.projectId,
    phaseId: scope.phaseId,
    filesCopied: 0,
    skippedFiles: skipped,
    errors: [],
    dryRun: true,
    timestamp,
    deprecated: true,
    nextSteps: [
      "Run scripts/tenantStorageInventory.ts to identify trusted migration candidates.",
      "Create an explicit trusted mapping file.",
      "Run scripts/tenantStorageMigration.ts for dry-run or copy-only write migration."
    ]
  };
  return report;
}

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function readRequiredArg(args: ArgMap, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required --${key}.`);
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await migrateLegacyStorage({
    clientId: readRequiredArg(args, "clientId"),
    projectId: readRequiredArg(args, "projectId"),
    phaseId: readRequiredArg(args, "phaseId"),
    sourcePath: readRequiredArg(args, "source"),
    targetBucket: typeof args.bucket === "string" ? (args.bucket as PhaseStorageBucket) : undefined,
    dryRun: args.write !== true
  });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
