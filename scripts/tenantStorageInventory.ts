import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { sanitizeStorageId } from "../src/core/storage/storage-types";

export type InventoryCategory =
  | "valid_tenant_projects_with_metadata"
  | "tenant_projects_missing_metadata"
  | "legacy_candidates_for_migration"
  | "debug_only_artifacts"
  | "orphan_unknown_artifacts"
  | "unsafe_skipped_paths";

export type RecommendedInventoryAction = "keep" | "migrate" | "delete_candidate" | "manual_review" | "unsafe_skip";
export type MetadataStatus = "valid" | "missing" | "invalid" | "not_applicable" | "unknown";

export type TenantStorageInventoryEntry = {
  category: InventoryCategory;
  path: string;
  detectedClientId?: string;
  detectedProjectId?: string;
  detectedPhaseId?: string;
  metadataStatus: MetadataStatus;
  recommendedAction: RecommendedInventoryAction;
  reason: string;
  fileCount: number;
  totalSize: number;
  lastModified: string | null;
};

export type TenantStorageInventoryReport = {
  generatedAt: string;
  projectRoot: string;
  entries: TenantStorageInventoryEntry[];
};

type InventoryArgs = {
  projectRoot?: string;
  legacyRoots?: string[];
};

type ProjectMeta = {
  version: 1;
  clientId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  phases: string[];
};

const DEFAULT_LEGACY_ROOTS = ["outputs", "exports", path.join("public", "debug-pdf")];

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function safeResolveRoot(projectRoot: string, root: string): string {
  const resolved = path.resolve(projectRoot, root);
  if (!isInside(projectRoot, resolved)) {
    throw new Error("Inventory root escapes the project root.");
  }
  return resolved;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function safeId(value: string, label: string): string | null {
  try {
    return sanitizeStorageId(value, label);
  } catch {
    return null;
  }
}

function isProjectMeta(value: unknown): value is ProjectMeta {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.clientId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    Array.isArray(record.phases) &&
    record.phases.every((phase) => typeof phase === "string")
  );
}

async function readMeta(metaPath: string): Promise<{ status: MetadataStatus; meta?: ProjectMeta }> {
  try {
    const parsed = JSON.parse(await readFile(metaPath, "utf-8")) as unknown;
    return isProjectMeta(parsed) ? { status: "valid", meta: parsed } : { status: "invalid" };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing" };
    }
    return { status: "invalid" };
  }
}

async function summarizePath(target: string): Promise<{ fileCount: number; totalSize: number; lastModified: string | null }> {
  try {
    const st = await stat(target);
    if (st.isFile()) {
      return { fileCount: 1, totalSize: st.size, lastModified: st.mtime.toISOString() };
    }
    if (!st.isDirectory()) {
      return { fileCount: 0, totalSize: 0, lastModified: st.mtime.toISOString() };
    }
    let fileCount = 0;
    let totalSize = 0;
    let lastModifiedMs = st.mtimeMs;
    const entries = await readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const child = await summarizePath(path.join(target, entry.name));
      fileCount += child.fileCount;
      totalSize += child.totalSize;
      if (child.lastModified) lastModifiedMs = Math.max(lastModifiedMs, Date.parse(child.lastModified));
    }
    return { fileCount, totalSize, lastModified: Number.isFinite(lastModifiedMs) ? new Date(lastModifiedMs).toISOString() : null };
  } catch {
    return { fileCount: 0, totalSize: 0, lastModified: null };
  }
}

async function createEntry(input: Omit<TenantStorageInventoryEntry, "fileCount" | "totalSize" | "lastModified">): Promise<TenantStorageInventoryEntry> {
  return {
    ...input,
    ...(await summarizePath(input.path))
  };
}

async function scanTenantProjects(projectRoot: string): Promise<TenantStorageInventoryEntry[]> {
  const entries: TenantStorageInventoryEntry[] = [];
  const clientsRoot = path.join(projectRoot, "storage", "clients");
  if (!(await pathExists(clientsRoot))) return entries;

  for (const clientDir of await readdir(clientsRoot, { withFileTypes: true })) {
    const clientPath = path.join(clientsRoot, clientDir.name);
    const clientId = safeId(clientDir.name, "clientId");
    if (!clientDir.isDirectory() || !clientId) {
      entries.push(await createEntry({
        category: "unsafe_skipped_paths",
        path: clientPath,
        metadataStatus: "unknown",
        recommendedAction: "unsafe_skip",
        reason: "Unsafe or non-directory client path."
      }));
      continue;
    }

    const projectsRoot = path.join(clientPath, "projects");
    if (!(await pathExists(projectsRoot))) {
      entries.push(await createEntry({
        category: "orphan_unknown_artifacts",
        path: clientPath,
        detectedClientId: clientId,
        metadataStatus: "not_applicable",
        recommendedAction: "manual_review",
        reason: "Client directory does not contain a projects folder."
      }));
      continue;
    }

    for (const projectDir of await readdir(projectsRoot, { withFileTypes: true })) {
      const projectPath = path.join(projectsRoot, projectDir.name);
      const projectId = safeId(projectDir.name, "projectId");
      if (!projectDir.isDirectory() || !projectId) {
        entries.push(await createEntry({
          category: "unsafe_skipped_paths",
          path: projectPath,
          detectedClientId: clientId,
          metadataStatus: "unknown",
          recommendedAction: "unsafe_skip",
          reason: "Unsafe or non-directory project path."
        }));
        continue;
      }

      const metaResult = await readMeta(path.join(projectPath, "project.meta.json"));
      const phaseId = await detectSinglePhaseId(projectPath);
      if (metaResult.status === "valid" && metaResult.meta?.clientId === clientId && metaResult.meta.projectId === projectId) {
        entries.push(await createEntry({
          category: "valid_tenant_projects_with_metadata",
          path: projectPath,
          detectedClientId: clientId,
          detectedProjectId: projectId,
          detectedPhaseId: phaseId,
          metadataStatus: "valid",
          recommendedAction: "keep",
          reason: "Project metadata matches tenant path."
        }));
      } else if (metaResult.status === "missing") {
        entries.push(await createEntry({
          category: "tenant_projects_missing_metadata",
          path: projectPath,
          detectedClientId: clientId,
          detectedProjectId: projectId,
          detectedPhaseId: phaseId,
          metadataStatus: "missing",
          recommendedAction: "manual_review",
          reason: "Tenant project path is known, but ownership metadata is missing."
        }));
      } else {
        entries.push(await createEntry({
          category: "orphan_unknown_artifacts",
          path: projectPath,
          detectedClientId: clientId,
          detectedProjectId: projectId,
          detectedPhaseId: phaseId,
          metadataStatus: metaResult.status,
          recommendedAction: "manual_review",
          reason: "Project metadata is invalid or does not match tenant path."
        }));
      }
    }
  }
  return entries;
}

async function detectSinglePhaseId(projectPath: string): Promise<string | undefined> {
  const phasesRoot = path.join(projectPath, "phases");
  if (!(await pathExists(phasesRoot))) return undefined;
  const phaseDirs = (await readdir(phasesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => safeId(entry.name, "phaseId"))
    .filter((value): value is string => Boolean(value));
  return phaseDirs.length === 1 ? phaseDirs[0] : undefined;
}

function inferLegacyCategory(rootName: string): Pick<TenantStorageInventoryEntry, "category" | "recommendedAction" | "reason"> {
  if (rootName.replaceAll("\\", "/").endsWith("public/debug-pdf")) {
    return {
      category: "debug_only_artifacts",
      recommendedAction: "delete_candidate",
      reason: "Debug PDF artifacts are dev/test output and should not be production data."
    };
  }
  return {
    category: "legacy_candidates_for_migration",
    recommendedAction: "manual_review",
    reason: "Legacy global output root requires owner identification before migration."
  };
}

async function scanLegacyRoots(projectRoot: string, legacyRoots: string[]): Promise<TenantStorageInventoryEntry[]> {
  const entries: TenantStorageInventoryEntry[] = [];
  for (const root of legacyRoots) {
    const resolved = safeResolveRoot(projectRoot, root);
    if (!(await pathExists(resolved))) continue;
    const inferred = inferLegacyCategory(root);
    entries.push(await createEntry({
      ...inferred,
      path: resolved,
      metadataStatus: "not_applicable"
    }));
  }
  return entries;
}

export async function createTenantStorageInventory(args: InventoryArgs = {}): Promise<TenantStorageInventoryReport> {
  const projectRoot = path.resolve(args.projectRoot ?? process.cwd());
  const legacyRoots = args.legacyRoots ?? DEFAULT_LEGACY_ROOTS;
  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    entries: [
      ...(await scanTenantProjects(projectRoot)),
      ...(await scanLegacyRoots(projectRoot, legacyRoots))
    ]
  };
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
  const report = await createTenantStorageInventory({
    projectRoot: typeof args.projectRoot === "string" ? args.projectRoot : undefined
  });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
