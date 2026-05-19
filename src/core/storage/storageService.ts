import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { assertClientProjectPhaseAccess } from "./project-ownership";
import {
  buildStorageFileUrl,
  resolveBucketFilePath,
  resolveExportPath,
  resolvePhaseBucketPath,
  resolveRenderPath,
  resolveStorageRequestPath
} from "./storage-path-resolver";
import { createClientProjectPhaseScope, type ClientProjectPhaseScope, type PhaseStorageBucket } from "./storage-types";

type StorageServiceArgs = {
  projectRoot: string;
  context: ClientContext;
  projectId?: string | null;
  phaseId?: string | null;
};

export type StorageService = {
  scope: ClientProjectPhaseScope;
  ensurePhaseDirectories: () => Promise<void>;
  getRenderPath: (fileName: string) => string;
  getExportPath: (fileName: string) => string;
  getStorageUrl: (bucket: PhaseStorageBucket, fileName: string) => string;
  writeJson: (bucket: PhaseStorageBucket, fileName: string, data: unknown) => Promise<string>;
};

export async function createStorageService(args: StorageServiceArgs): Promise<StorageService> {
  const projectRoot = path.resolve(args.projectRoot);
  const scope = createClientProjectPhaseScope(args.context, {
    projectId: args.projectId,
    phaseId: args.phaseId
  });
  await assertClientProjectPhaseAccess(projectRoot, scope.clientId, scope.projectId, scope.phaseId, { mode: "write" });

  const ensurePhaseDirectories = async () => {
    await Promise.all(
      (["saves", "backups", "exports", "renders", "uploads"] as PhaseStorageBucket[]).map((bucket) =>
        mkdir(resolvePhaseBucketPath(projectRoot, scope, bucket), { recursive: true })
      )
    );
  };

  const writeJson = async (bucket: PhaseStorageBucket, fileName: string, data: unknown) => {
    await ensurePhaseDirectories();
    const target =
      bucket === "renders"
        ? resolveRenderPath(projectRoot, scope, fileName)
        : bucket === "exports"
          ? resolveExportPath(projectRoot, scope, fileName)
          : resolveBucketFilePath(projectRoot, scope, bucket, fileName);
    await writeFile(target, JSON.stringify(data, null, 2), "utf-8");
    return target;
  };

  return {
    scope,
    ensurePhaseDirectories,
    getRenderPath: (fileName: string) => resolveRenderPath(projectRoot, scope, fileName),
    getExportPath: (fileName: string) => resolveExportPath(projectRoot, scope, fileName),
    getStorageUrl: (bucket: PhaseStorageBucket, fileName: string) => buildStorageFileUrl(scope, bucket, fileName),
    writeJson
  };
}

export async function readScopedStorageFile(
  projectRoot: string,
  context: ClientContext,
  requestPathname: string
): Promise<{ buffer: Buffer; fileName: string; bucket: PhaseStorageBucket; scope: ClientProjectPhaseScope }> {
  const resolved = await resolveStorageRequestPath(projectRoot, context, requestPathname);
  const st = await stat(resolved.path);
  if (!st.isFile()) throw new Error("Storage file not found.");
  return {
    buffer: await readFile(resolved.path),
    fileName: resolved.fileName,
    bucket: resolved.bucket,
    scope: resolved.scope
  };
}