import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  readProjectOwnershipMetadata,
  writeProjectOwnershipMetadata,
  type ProjectOwnershipRecord
} from "../src/core/storage/project-ownership";
import { resolveBucketFilePath } from "../src/core/storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageFileName, sanitizeStorageId, type PhaseStorageBucket } from "../src/core/storage/storage-types";

export type TrustedMigrationArtifactType = "save" | "backup" | "export" | "render" | "upload" | "debug";
export type TrustedMigrationAction = "migrate" | "skip" | "delete_candidate";

export type TrustedMigrationMappingItem = {
  sourcePath: string;
  targetClientId: string;
  targetProjectId: string;
  targetPhaseId: string;
  artifactType: TrustedMigrationArtifactType;
  action: TrustedMigrationAction;
  reason: string;
};

export type TrustedMigrationArgs = {
  projectRoot?: string;
  mappingPath?: string;
  dryRun?: boolean;
  overwrite?: boolean;
};

export type TrustedMigrationItemResult = {
  sourcePath: string;
  targetClientId?: string;
  targetProjectId?: string;
  targetPhaseId?: string;
  artifactType?: TrustedMigrationArtifactType;
  action?: TrustedMigrationAction;
  status: "would_migrate" | "migrated" | "skipped" | "delete_candidate" | "conflict" | "error";
  reason: string;
  targetPaths: string[];
  conflicts: string[];
  errors: string[];
  missingMetadata: boolean;
};

export type TrustedMigrationReport = {
  startedAt: string;
  dryRun: boolean;
  migratedCount: number;
  skippedCount: number;
  conflictsCount: number;
  errorsCount: number;
  items: TrustedMigrationItemResult[];
  reportPath?: string;
};

type PlannedFile = {
  source: string;
  target: string;
};

const ALLOWED_LEGACY_ROOTS = ["outputs", "exports", path.join("public", "debug-pdf")];

const ARTIFACT_BUCKETS: Record<TrustedMigrationArtifactType, PhaseStorageBucket> = {
  save: "saves",
  backup: "backups",
  export: "exports",
  render: "renders",
  upload: "uploads",
  debug: "uploads"
};

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolveProjectRoot(projectRoot?: string): string {
  return path.resolve(projectRoot ?? process.cwd());
}

function resolveMappingPath(projectRoot: string, mappingPath?: string): string {
  if (!mappingPath) throw new Error("Trusted mapping file is required.");
  const resolved = path.resolve(projectRoot, mappingPath);
  if (!isInside(projectRoot, resolved)) throw new Error("Mapping file path escapes the project root.");
  return resolved;
}

function resolveLegacySource(projectRoot: string, sourcePath: string): string {
  const resolved = path.resolve(projectRoot, sourcePath);
  const allowedRoots = ALLOWED_LEGACY_ROOTS.map((root) => path.resolve(projectRoot, root));
  if (!allowedRoots.some((root) => isInside(root, resolved))) {
    throw new Error("Source path is outside allowed legacy roots.");
  }
  return resolved;
}

function isMappingItem(value: unknown): value is TrustedMigrationMappingItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.sourcePath === "string" &&
    typeof item.targetClientId === "string" &&
    typeof item.targetProjectId === "string" &&
    typeof item.targetPhaseId === "string" &&
    typeof item.reason === "string" &&
    ["save", "backup", "export", "render", "upload", "debug"].includes(String(item.artifactType)) &&
    ["migrate", "skip", "delete_candidate"].includes(String(item.action))
  );
}

async function readMapping(projectRoot: string, mappingPath?: string): Promise<TrustedMigrationMappingItem[]> {
  const raw = JSON.parse(await readFile(resolveMappingPath(projectRoot, mappingPath), "utf-8")) as unknown;
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (!items) throw new Error("Trusted mapping file must be a JSON array or an object with items.");
  const invalidIndex = items.findIndex((item) => !isMappingItem(item));
  if (invalidIndex >= 0) throw new Error(`Trusted mapping item ${invalidIndex} is invalid.`);
  return items as TrustedMigrationMappingItem[];
}

function targetFileName(sourceRoot: string, sourceFile: string): string {
  const relative = path.relative(sourceRoot, sourceFile) || path.basename(sourceFile);
  return sanitizeStorageFileName(relative.split(/[\\/]+/u).filter(Boolean).join("__"));
}

async function collectPlannedFiles(projectRoot: string, item: TrustedMigrationMappingItem, sourcePath: string): Promise<PlannedFile[]> {
  const context = {
    userId: "tenant_storage_migration_admin",
    clientId: sanitizeStorageId(item.targetClientId, "clientId"),
    role: "admin" as const
  };
  const scope = createClientProjectPhaseScope(context, {
    projectId: item.targetProjectId,
    phaseId: item.targetPhaseId
  });
  const bucket = ARTIFACT_BUCKETS[item.artifactType];
  const sourceStats = await stat(sourcePath);

  if (sourceStats.isFile()) {
    return [{
      source: sourcePath,
      target: resolveBucketFilePath(projectRoot, scope, bucket, sanitizeStorageFileName(path.basename(sourcePath)))
    }];
  }
  if (!sourceStats.isDirectory()) return [];

  const files: PlannedFile[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push({
          source: entryPath,
          target: resolveBucketFilePath(projectRoot, scope, bucket, targetFileName(sourcePath, entryPath))
        });
      }
    }
  }
  await walk(sourcePath);
  return files;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function requireWriteAllowed(dryRun: boolean): void {
  if (dryRun) return;
  if (process.env.ALLOW_TENANT_STORAGE_MIGRATION !== "true") {
    throw new Error("Set ALLOW_TENANT_STORAGE_MIGRATION=true before running write migration.");
  }
}

async function writeMetadataForItem(projectRoot: string, item: TrustedMigrationMappingItem, sourcePath: string, startedAt: string): Promise<void> {
  const existing = await readProjectOwnershipMetadata(projectRoot, item.targetClientId, item.targetProjectId);
  const sourceStats = await stat(sourcePath);
  const record: ProjectOwnershipRecord = {
    version: 1,
    clientId: sanitizeStorageId(item.targetClientId, "clientId"),
    projectId: sanitizeStorageId(item.targetProjectId, "projectId"),
    createdAt: existing?.createdAt ?? sourceStats.birthtime.toISOString(),
    updatedAt: sourceStats.mtime.toISOString() || existing?.updatedAt || startedAt,
    phases: [...new Set([...(existing?.phases ?? []), sanitizeStorageId(item.targetPhaseId, "phaseId")])].sort()
  };
  await writeProjectOwnershipMetadata(projectRoot, item.targetClientId, item.targetProjectId, record);
}

function emptyResult(item: TrustedMigrationMappingItem): TrustedMigrationItemResult {
  return {
    sourcePath: item.sourcePath,
    targetClientId: item.targetClientId,
    targetProjectId: item.targetProjectId,
    targetPhaseId: item.targetPhaseId,
    artifactType: item.artifactType,
    action: item.action,
    status: "skipped",
    reason: item.reason,
    targetPaths: [],
    conflicts: [],
    errors: [],
    missingMetadata: false
  };
}

async function processItem(projectRoot: string, item: TrustedMigrationMappingItem, dryRun: boolean, overwrite: boolean, startedAt: string): Promise<TrustedMigrationItemResult> {
  const result = emptyResult(item);
  if (item.action === "skip") return result;
  if (item.action === "delete_candidate") {
    return { ...result, status: "delete_candidate" };
  }

  try {
    const sourcePath = resolveLegacySource(projectRoot, item.sourcePath);
    result.sourcePath = sourcePath;
    const metadata = await readProjectOwnershipMetadata(projectRoot, item.targetClientId, item.targetProjectId);
    result.missingMetadata = !metadata;
    const files = await collectPlannedFiles(projectRoot, item, sourcePath);
    result.targetPaths = files.map((file) => file.target);
    result.conflicts = overwrite ? [] : (await Promise.all(files.map(async (file) => (await fileExists(file.target)) ? file.target : null))).filter((value): value is string => Boolean(value));

    if (result.conflicts.length > 0) {
      return { ...result, status: "conflict", reason: "Target exists and overwrite is disabled." };
    }
    if (dryRun) return { ...result, status: "would_migrate" };

    await writeMetadataForItem(projectRoot, item, sourcePath, startedAt);
    for (const file of files) {
      await mkdir(path.dirname(file.target), { recursive: true });
      await copyFile(file.source, file.target);
    }
    return { ...result, status: "migrated" };
  } catch (error: unknown) {
    return {
      ...result,
      status: "error",
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

function count(items: TrustedMigrationItemResult[], status: TrustedMigrationItemResult["status"]): number {
  return items.filter((item) => item.status === status).length;
}

function reportPath(projectRoot: string, startedAt: string): string {
  const stamp = startedAt.replaceAll(":", "").replaceAll(".", "").replaceAll("-", "").slice(0, 15);
  return path.join(projectRoot, "storage", "migration-reports", `tenant-storage-migration-${stamp}.json`);
}

export async function runTenantStorageMigration(args: TrustedMigrationArgs = {}): Promise<TrustedMigrationReport> {
  const dryRun = args.dryRun ?? true;
  requireWriteAllowed(dryRun);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const mapping = await readMapping(projectRoot, args.mappingPath);
  const startedAt = new Date().toISOString();
  const items = await Promise.all(mapping.map((item) => processItem(projectRoot, item, dryRun, args.overwrite === true, startedAt)));
  const report: TrustedMigrationReport = {
    startedAt,
    dryRun,
    migratedCount: count(items, "migrated"),
    skippedCount: count(items, "skipped") + count(items, "delete_candidate"),
    conflictsCount: count(items, "conflict"),
    errorsCount: count(items, "error"),
    items
  };

  if (!dryRun) {
    const target = reportPath(projectRoot, startedAt);
    await mkdir(path.dirname(target), { recursive: true });
    report.reportPath = target;
    await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  }

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runTenantStorageMigration({
    mappingPath: typeof args.mapping === "string" ? args.mapping : undefined,
    dryRun: args.write !== true,
    overwrite: args.overwrite === true
  });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
