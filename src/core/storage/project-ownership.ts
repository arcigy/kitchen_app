import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeStorageId } from "./storage-types";

type AccessMode = "read" | "write";

type OwnershipOptions = {
  mode?: AccessMode;
  projectRoot?: string;
  allowLegacyReadWithoutMeta?: boolean;
};

export type ProjectOwnershipRecord = {
  version: 1;
  projectId: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
  phases: string[];
};

type ProjectRecordReadResult =
  | { status: "found"; record: ProjectOwnershipRecord }
  | { status: "missing" }
  | { status: "invalid" };

const PROJECT_META_FILE = "project.meta.json";

function createProjectPath(projectRoot: string, clientId: string, projectId: string): string {
  const safeClientId = sanitizeStorageId(clientId, "clientId");
  const safeProjectId = sanitizeStorageId(projectId, "projectId");
  return path.resolve(projectRoot, "storage", "clients", safeClientId, "projects", safeProjectId);
}

function createProjectMetaPath(projectRoot: string, clientId: string, projectId: string): string {
  return path.join(createProjectPath(projectRoot, clientId, projectId), PROJECT_META_FILE);
}

function isProjectRecord(value: unknown): value is ProjectOwnershipRecord {
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

function canonicalizePhaseIds(phases: string[]): string[] {
  return [...new Set(phases.filter((phaseId) => typeof phaseId === "string").map((id) => sanitizeStorageId(id, "phaseId")))].sort();
}

async function readProjectRecord(projectRoot: string, clientId: string, projectId: string): Promise<ProjectRecordReadResult> {
  const metaPath = createProjectMetaPath(projectRoot, clientId, projectId);
  try {
    const raw = await readFile(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return isProjectRecord(parsed) ? { status: "found", record: parsed } : { status: "invalid" };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing" };
    }
    return { status: "invalid" };
  }
}

async function writeProjectRecord(
  projectRoot: string,
  clientId: string,
  projectId: string,
  record: ProjectOwnershipRecord
): Promise<void> {
  const projectPath = createProjectPath(projectRoot, clientId, projectId);
  await mkdir(projectPath, { recursive: true });
  await writeFile(createProjectMetaPath(projectRoot, clientId, projectId), JSON.stringify(record, null, 2), "utf-8");
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertProjectRecordMatchesScope(record: ProjectOwnershipRecord, clientId: string, projectId: string): void {
  if (
    sanitizeStorageId(record.clientId, "clientId") !== clientId ||
    sanitizeStorageId(record.projectId, "projectId") !== projectId
  ) {
    throw new Error("Project does not belong to the current client.");
  }
}

export async function assertProjectBelongsToClient(
  projectRoot: string,
  clientId: string,
  projectId: string,
  mode: AccessMode = "read",
  options: Pick<OwnershipOptions, "allowLegacyReadWithoutMeta"> = {}
): Promise<void> {
  const safeClientId = sanitizeStorageId(clientId, "clientId");
  const safeProjectId = sanitizeStorageId(projectId, "projectId");
  const projectRecord = await readProjectRecord(projectRoot, safeClientId, safeProjectId);

  if (projectRecord.status === "missing") {
    if (mode === "write") {
      await writeProjectRecord(projectRoot, safeClientId, safeProjectId, {
        version: 1,
        clientId: safeClientId,
        projectId: safeProjectId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        phases: []
      });
      return;
    }
    if (options.allowLegacyReadWithoutMeta) return;
    throw new Error("Project ownership metadata is missing.");
  }

  if (projectRecord.status === "invalid") {
    throw new Error("Project ownership metadata is invalid.");
  }

  assertProjectRecordMatchesScope(projectRecord.record, safeClientId, safeProjectId);
}

export async function assertPhaseBelongsToProject(
  projectRoot: string,
  clientId: string,
  projectId: string,
  phaseId: string,
  mode: AccessMode = "read",
  options: Pick<OwnershipOptions, "allowLegacyReadWithoutMeta"> = {}
): Promise<void> {
  const safeClientId = sanitizeStorageId(clientId, "clientId");
  const safeProjectId = sanitizeStorageId(projectId, "projectId");
  const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
  const projectRecord = await readProjectRecord(projectRoot, safeClientId, safeProjectId);

  if (projectRecord.status === "missing") {
    if (mode === "write") {
      await assertProjectBelongsToClient(projectRoot, safeClientId, safeProjectId, mode);
      await writeProjectRecord(projectRoot, safeClientId, safeProjectId, {
        version: 1,
        clientId: safeClientId,
        projectId: safeProjectId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        phases: [safePhaseId]
      });
      return;
    }
    if (options.allowLegacyReadWithoutMeta) return;
    throw new Error("Project ownership metadata is missing.");
  }

  if (projectRecord.status === "invalid") {
    throw new Error("Project ownership metadata is invalid.");
  }

  assertProjectRecordMatchesScope(projectRecord.record, safeClientId, safeProjectId);

  if (!projectRecord.record.phases.includes(safePhaseId)) {
    if (mode === "write") {
      await writeProjectRecord(projectRoot, safeClientId, safeProjectId, {
        ...projectRecord.record,
        updatedAt: nowIso(),
        phases: canonicalizePhaseIds([...projectRecord.record.phases, safePhaseId])
      });
      return;
    }
    throw new Error("Phase does not belong to the requested project.");
  }
}

export async function assertClientProjectPhaseAccess(
  projectRoot: string,
  clientId: string,
  projectId: string,
  phaseId: string,
  options: OwnershipOptions = {}
): Promise<void> {
  const mode = options.mode ?? "read";
  const safeClientId = sanitizeStorageId(clientId, "clientId");
  const safeProjectId = sanitizeStorageId(projectId, "projectId");
  const safePhaseId = sanitizeStorageId(phaseId, "phaseId");
  const targetRoot = options.projectRoot ?? projectRoot;
  await assertProjectBelongsToClient(targetRoot, safeClientId, safeProjectId, mode, options);
  await assertPhaseBelongsToProject(targetRoot, safeClientId, safeProjectId, safePhaseId, mode, options);
}

export async function ensureProjectOwnershipForWrite(
  projectRoot: string,
  clientId: string,
  projectId: string,
  phaseId: string
): Promise<void> {
  await assertClientProjectPhaseAccess(projectRoot, clientId, projectId, phaseId, { projectRoot, mode: "write" });
}

export async function readProjectOwnershipMetadata(
  projectRoot: string,
  clientId: string,
  projectId: string
): Promise<ProjectOwnershipRecord | null> {
  const safeClientId = sanitizeStorageId(clientId, "clientId");
  const safeProjectId = sanitizeStorageId(projectId, "projectId");
  const result = await readProjectRecord(projectRoot, safeClientId, safeProjectId);
  return result.status === "found" ? result.record : null;
}

export async function writeProjectOwnershipMetadata(
  projectRoot: string,
  clientId: string,
  projectId: string,
  record: ProjectOwnershipRecord
): Promise<void> {
  const safeClientId = sanitizeStorageId(clientId, "clientId");
  const safeProjectId = sanitizeStorageId(projectId, "projectId");
  assertProjectRecordMatchesScope(record, safeClientId, safeProjectId);
  await writeProjectRecord(projectRoot, safeClientId, safeProjectId, {
    ...record,
    clientId: safeClientId,
    projectId: safeProjectId,
    phases: canonicalizePhaseIds(record.phases)
  });
}

export function getProjectMetaPath(projectRoot: string, clientId: string, projectId: string): string {
  return createProjectMetaPath(projectRoot, clientId, projectId);
}
