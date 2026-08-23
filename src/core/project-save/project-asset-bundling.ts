import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { resolvePhaseBucketPath, resolveUploadPath } from "../storage/storage-path-resolver";
import { createClientProjectPhaseScope, sanitizeStorageFileName } from "../storage/storage-types";
import type { ProjectBundledAssetManifestItem, ProjectBundledAssetPayload, ProjectSaveFile } from "./project-save-types";
import { validateBundledAssets } from "./project-save-crypto";
import { getProjectAssetBundleLimits, type ProjectAssetBundleLimits } from "./project-file-limits";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export type { ProjectAssetBundleLimits } from "./project-file-limits";

export type ProjectAssetBundleResult = {
  save: ProjectSaveFile;
  bundledAssets: ProjectBundledAssetPayload[];
};

export { getProjectAssetBundleLimits } from "./project-file-limits";

function mimeTypeForFileName(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return null;
}

function assertSafeOriginalPath(originalPath: string): void {
  if (originalPath.includes("..") || originalPath.includes("\\")) {
    throw new Error("Bundled asset originalPath is unsafe.");
  }
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function listUploadFileNames(projectRoot: string, ctx: ClientContext, projectId: string, phaseId: string): Promise<string[]> {
  const scope = createClientProjectPhaseScope(ctx, { projectId, phaseId });
  const uploadsDir = resolvePhaseBucketPath(projectRoot, scope, "uploads");
  let entries;
  try {
    entries = await readdir(uploadsDir, { withFileTypes: true });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => sanitizeStorageFileName(String(entry.name))).sort();
}

function phaseIdsFromSave(save: ProjectSaveFile): string[] {
  return [...new Set(save.phases.map((phase) => phase.phaseId))].sort();
}

function requiredManifestFilesByPhase(save: ProjectSaveFile): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const item of save.assets?.bundled ?? []) {
    const phaseId = item.phaseId || save.activePhaseId;
    const files = out.get(phaseId) ?? new Set<string>();
    files.add(sanitizeStorageFileName(item.fileName));
    out.set(phaseId, files);
  }
  return out;
}

export async function bundleProjectAssets(args: {
  projectRoot: string;
  ctx: ClientContext;
  save: ProjectSaveFile;
  limits?: ProjectAssetBundleLimits;
}): Promise<ProjectAssetBundleResult> {
  const limits = args.limits ?? getProjectAssetBundleLimits();
  const requiredByPhase = requiredManifestFilesByPhase(args.save);
  const filesByPhase = new Map<string, Set<string>>();
  for (const phaseId of phaseIdsFromSave(args.save)) {
    const files = new Set(await listUploadFileNames(args.projectRoot, args.ctx, args.save.projectId, phaseId));
    for (const required of requiredByPhase.get(phaseId) ?? []) files.add(required);
    filesByPhase.set(phaseId, files);
  }
  const assetCount = [...filesByPhase.values()].reduce((sum, files) => sum + files.size, 0);
  if (assetCount > limits.maxAssetCount) throw new Error("Project export has too many bundled assets.");

  const bundledAssets: ProjectBundledAssetPayload[] = [];
  const manifest: ProjectBundledAssetManifestItem[] = [];
  let totalBytes = 0;

  for (const [phaseId, fileNames] of [...filesByPhase.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const scope = createClientProjectPhaseScope(args.ctx, { projectId: args.save.projectId, phaseId });
    for (const fileName of [...fileNames].sort()) {
      const safeFileName = sanitizeStorageFileName(fileName);
      const mimeType = mimeTypeForFileName(safeFileName);
      if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) throw new Error(`Project asset MIME type is not allowed for ${safeFileName}.`);
      const filePath = resolveUploadPath(args.projectRoot, scope, safeFileName);
      const fileStat = await stat(filePath).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(`Project asset is missing: ${phaseId}/${safeFileName}`);
        }
        throw error;
      });
      if (!fileStat.isFile()) throw new Error(`Project asset is not a file: ${phaseId}/${safeFileName}`);
      if (fileStat.size > limits.maxSingleAssetBytes) throw new Error(`Project asset exceeds the single asset size limit: ${phaseId}/${safeFileName}`);
      totalBytes += fileStat.size;
      if (totalBytes > limits.maxTotalAssetBytes) throw new Error("Project assets exceed the total bundle size limit.");
      const buffer = await readFile(filePath);
      const sha256 = hashBuffer(buffer);
      const assetId = `upload:${phaseId}:${safeFileName}`;
      const originalPath = `/storage/clients/${scope.clientId}/projects/${scope.projectId}/phases/${scope.phaseId}/uploads/${safeFileName}`;
      assertSafeOriginalPath(originalPath);
      bundledAssets.push({
        assetId,
        phaseId,
        encoding: "base64",
        mimeType,
        fileName: safeFileName,
        sha256,
        sizeBytes: buffer.byteLength,
        data: buffer.toString("base64")
      });
      manifest.push({
        assetId,
        phaseId,
        originalPath,
        storageBucket: "uploads",
        fileName: safeFileName,
        mimeType,
        sizeBytes: buffer.byteLength,
        sha256,
        createdAt: fileStat.birthtime.toISOString()
      });
      }
  }

  validateBundledAssets(bundledAssets);
  return {
    save: {
      ...args.save,
      assets: {
        bundled: manifest,
        external: args.save.assets?.external ?? [],
        missing: args.save.assets?.missing ?? [],
        generated: args.save.assets?.generated ?? []
      }
    },
    bundledAssets
  };
}

export async function restoreBundledProjectAssets(args: {
  projectRoot: string;
  ctx: ClientContext;
  save: ProjectSaveFile;
  bundledAssets: ProjectBundledAssetPayload[];
}): Promise<ProjectBundledAssetManifestItem[]> {
  validateBundledAssets(args.bundledAssets);
  const restored: ProjectBundledAssetManifestItem[] = [];

  for (const asset of args.bundledAssets) {
    const scope = createClientProjectPhaseScope(args.ctx, { projectId: args.save.projectId, phaseId: asset.phaseId });
    const uploadsDir = resolvePhaseBucketPath(args.projectRoot, scope, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    const safeFileName = sanitizeStorageFileName(asset.fileName);
    const mimeType = mimeTypeForFileName(safeFileName);
    if (!mimeType || mimeType !== asset.mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Project asset MIME type is not allowed for ${safeFileName}.`);
    }
    const target = resolveUploadPath(args.projectRoot, scope, safeFileName);
    const data = Buffer.from(asset.data, "base64");
    const sha256 = hashBuffer(data);
    if (sha256 !== asset.sha256.toLowerCase()) throw new Error(`Project asset hash mismatch for ${safeFileName}.`);
    await writeFile(target, data, { flag: "wx" });
    const originalPath = `/storage/clients/${scope.clientId}/projects/${scope.projectId}/phases/${scope.phaseId}/uploads/${safeFileName}`;
    restored.push({
      assetId: asset.assetId,
      phaseId: asset.phaseId,
      originalPath,
      storageBucket: "uploads",
      fileName: safeFileName,
      mimeType,
      sizeBytes: data.byteLength,
      sha256
    });
  }

  return restored;
}
