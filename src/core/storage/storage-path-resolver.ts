import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { assertClientProjectPhaseAccess } from "./project-ownership";
import {
  assertClientScope,
  createClientProjectPhaseScope,
  sanitizeStorageFileName,
  sanitizeStorageId,
  type ClientProjectPhaseScope,
  type PhaseStorageBucket
} from "./storage-types";

const BUCKETS = new Set<PhaseStorageBucket>(["saves", "backups", "exports", "renders", "uploads"]);

export function isLegacyProjectReadAllowed(): boolean {
  return process.env.ALLOW_LEGACY_PROJECT_READ === "true";
}

function assertPathInside(root: string, target: string): void {
  const rel = path.relative(root, target);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return;
  throw new Error("Resolved storage path escapes the storage root.");
}

function safeJoin(root: string, ...segments: string[]): string {
  const resolved = path.resolve(root, ...segments);
  assertPathInside(root, resolved);
  return resolved;
}

export function resolveStorageRootPath(projectRoot: string): string {
  return path.resolve(projectRoot, "storage");
}

export function resolveClientStoragePath(projectRoot: string, context: ClientContext): string {
  const storageRoot = resolveStorageRootPath(projectRoot);
  const clientId = sanitizeStorageId(context.clientId, "clientId");
  return safeJoin(storageRoot, "clients", clientId);
}

export function resolveClientCatalogPath(projectRoot: string, context: ClientContext): string {
  return safeJoin(resolveClientStoragePath(projectRoot, context), "catalog");
}

export function resolveClientModulePackagesPath(projectRoot: string, context: ClientContext): string {
  return safeJoin(resolveClientCatalogPath(projectRoot, context), "modules");
}

export function resolveClientModulePackagePath(projectRoot: string, context: ClientContext, modulePackageId: string): string {
  return safeJoin(resolveClientModulePackagesPath(projectRoot, context), sanitizeStorageId(modulePackageId, "modulePackageId"));
}

export function resolveProjectStoragePath(projectRoot: string, scope: ClientProjectPhaseScope): string {
  const storageRoot = resolveStorageRootPath(projectRoot);
  return safeJoin(
    storageRoot,
    "clients",
    sanitizeStorageId(scope.clientId, "clientId"),
    "projects",
    sanitizeStorageId(scope.projectId, "projectId")
  );
}

export function resolvePhaseStoragePath(projectRoot: string, scope: ClientProjectPhaseScope): string {
  return safeJoin(
    resolveProjectStoragePath(projectRoot, scope),
    "phases",
    sanitizeStorageId(scope.phaseId, "phaseId")
  );
}

export function resolvePhaseBucketPath(projectRoot: string, scope: ClientProjectPhaseScope, bucket: PhaseStorageBucket): string {
  if (!BUCKETS.has(bucket)) throw new Error("Unsupported storage bucket.");
  return safeJoin(resolvePhaseStoragePath(projectRoot, scope), bucket);
}

export function resolveBucketFilePath(
  projectRoot: string,
  scope: ClientProjectPhaseScope,
  bucket: PhaseStorageBucket,
  fileName: string
): string {
  return safeJoin(resolvePhaseBucketPath(projectRoot, scope, bucket), sanitizeStorageFileName(fileName));
}

export function resolveRenderPath(projectRoot: string, scope: ClientProjectPhaseScope, fileName: string): string {
  return resolveBucketFilePath(projectRoot, scope, "renders", fileName);
}

export function resolveExportPath(projectRoot: string, scope: ClientProjectPhaseScope, fileName: string): string {
  return resolveBucketFilePath(projectRoot, scope, "exports", fileName);
}

export function resolveUploadPath(projectRoot: string, scope: ClientProjectPhaseScope, fileName: string): string {
  return resolveBucketFilePath(projectRoot, scope, "uploads", fileName);
}

export function buildStorageFileUrl(scope: ClientProjectPhaseScope, bucket: PhaseStorageBucket, fileName: string): string {
  if (!BUCKETS.has(bucket)) throw new Error("Unsupported storage bucket.");
  const safeScope = createClientProjectPhaseScope(
    { userId: "", role: "viewer", clientId: scope.clientId },
    { projectId: scope.projectId, phaseId: scope.phaseId }
  );
  return [
    "/storage/clients",
    encodeURIComponent(safeScope.clientId),
    "projects",
    encodeURIComponent(safeScope.projectId),
    "phases",
    encodeURIComponent(safeScope.phaseId),
    bucket,
    encodeURIComponent(sanitizeStorageFileName(fileName))
  ].join("/");
}

export async function resolveStorageRequestPath(
  projectRoot: string,
  context: ClientContext,
  requestPathname: string
): Promise<{ path: string; bucket: PhaseStorageBucket; fileName: string; scope: ClientProjectPhaseScope }> {
  const segments = requestPathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const [storage, clients, clientId, projects, projectId, phases, phaseId, bucket, fileName, ...rest] = segments;
  if (
    storage !== "storage" ||
    clients !== "clients" ||
    projects !== "projects" ||
    phases !== "phases" ||
    rest.length > 0 ||
    !clientId ||
    !projectId ||
    !phaseId ||
    !bucket ||
    !fileName
  ) {
    throw new Error("Invalid storage URL.");
  }

  if (!BUCKETS.has(bucket as PhaseStorageBucket)) throw new Error("Unsupported storage bucket.");
  const scope = createClientProjectPhaseScope(context, { projectId, phaseId });
  if (scope.clientId !== sanitizeStorageId(clientId, "clientId")) {
    assertClientScope(context, { ...scope, clientId: sanitizeStorageId(clientId, "clientId") });
  }
  await assertClientProjectPhaseAccess(projectRoot, scope.clientId, scope.projectId, scope.phaseId, {
    allowLegacyReadWithoutMeta: isLegacyProjectReadAllowed()
  });

  return {
    bucket: bucket as PhaseStorageBucket,
    fileName: sanitizeStorageFileName(fileName),
    scope,
    path: resolveBucketFilePath(projectRoot, scope, bucket as PhaseStorageBucket, fileName)
  };
}

export function assertOutputPathInsideStorage(projectRoot: string, outputPath: string): string {
  const storageRoot = resolveStorageRootPath(projectRoot);
  const resolved = path.resolve(outputPath);
  assertPathInside(storageRoot, resolved);
  return resolved;
}
