import { createHash } from "node:crypto";
import { lstat, open, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type StorageEntryType = "directory" | "file";

export type StorageTreeManifestEntry = {
  path: string;
  type: StorageEntryType;
  sizeBytes: number;
  sha256: string | null;
  mode: number;
  uid: number;
  gid: number;
};

export type StorageTreeManifest = {
  schemaVersion: "arcigy.storage-tree-manifest.v1";
  generatedAt: string;
  root: string;
  totalFiles: number;
  totalDirectories: number;
  totalBytes: number;
  treeSha256: string;
  entries: StorageTreeManifestEntry[];
  readOnly: true;
};

export type StorageTreeMismatch = {
  path: string;
  field: "missing_in_source" | "missing_in_target" | "type" | "sizeBytes" | "sha256" | "mode" | "uid" | "gid";
  source: string | number | null;
  target: string | number | null;
};

export type StorageTreeComparison = {
  exact: boolean;
  sourceTreeSha256: string;
  targetTreeSha256: string;
  sourceFiles: number;
  targetFiles: number;
  sourceBytes: number;
  targetBytes: number;
  mismatches: StorageTreeMismatch[];
};

function fail(message: string): never {
  throw new Error(`Storage tree manifest failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeRelativePath(relativePath: string): string {
  if (relativePath === "") return ".";
  const segments = relativePath.split(path.sep);
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\") || segment.includes("\0"))) {
    fail(`unsafe relative path ${JSON.stringify(relativePath)}.`);
  }
  return segments.join("/");
}

function metadata(entryPath: string, type: StorageEntryType, stats: Awaited<ReturnType<typeof lstat>>, digest: string | null): StorageTreeManifestEntry {
  return {
    path: entryPath,
    type,
    sizeBytes: type === "file" ? stats.size : 0,
    sha256: digest,
    mode: stats.mode & 0o7777,
    uid: stats.uid,
    gid: stats.gid
  };
}

function assertStableStats(
  before: Awaited<ReturnType<typeof lstat>>,
  after: Awaited<ReturnType<typeof lstat>>,
  relativePath: string
): void {
  if (before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
    || before.mode !== after.mode) {
    fail(`entry changed while being captured at ${relativePath}.`);
  }
}

async function hashStableFile(target: string, relativePath: string): Promise<{ digest: string; stats: Awaited<ReturnType<typeof lstat>> }> {
  const handle = await open(target, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail(`entry is no longer a regular file at ${relativePath}.`);
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    assertStableStats(before, after, relativePath);
    return { digest: hash.digest("hex"), stats: after };
  } finally {
    await handle.close();
  }
}

async function scanDirectory(root: string, target: string, entries: StorageTreeManifestEntry[]): Promise<void> {
  const relativePath = safeRelativePath(path.relative(root, target));
  const before = await lstat(target);
  if (before.isSymbolicLink()) fail(`symbolic links are not allowed at ${relativePath}.`);
  if (!before.isDirectory()) fail(`expected a directory at ${relativePath}.`);
  entries.push(metadata(relativePath, "directory", before, null));

  const children = (await readdir(target, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    const childTarget = path.join(target, child.name);
    const childRelative = safeRelativePath(path.relative(root, childTarget));
    const childStats = await lstat(childTarget);
    if (childStats.isSymbolicLink()) fail(`symbolic links are not allowed at ${childRelative}.`);
    if (childStats.isDirectory()) {
      await scanDirectory(root, childTarget, entries);
      continue;
    }
    if (!childStats.isFile()) fail(`special filesystem entries are not allowed at ${childRelative}.`);
    const hashed = await hashStableFile(childTarget, childRelative);
    entries.push(metadata(childRelative, "file", hashed.stats, hashed.digest));
  }

  const after = await lstat(target);
  assertStableStats(before, after, relativePath);
}

function manifestDigest(entries: StorageTreeManifestEntry[]): string {
  return sha256(JSON.stringify(entries));
}

export async function createStorageTreeManifest(rootPath: string, generatedAt = new Date().toISOString()): Promise<StorageTreeManifest> {
  const root = path.resolve(rootPath);
  const timestamp = new Date(generatedAt);
  if (!rootPath.trim()) fail("root path is required.");
  if (!Number.isFinite(timestamp.getTime())) fail("generatedAt must be a valid timestamp.");
  const rootStats = await lstat(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) fail("root must be a real directory, not a file or symbolic link.");

  const entries: StorageTreeManifestEntry[] = [];
  await scanDirectory(root, root, entries);
  entries.sort((left, right) => left.path.localeCompare(right.path) || left.type.localeCompare(right.type));
  return {
    schemaVersion: "arcigy.storage-tree-manifest.v1",
    generatedAt: timestamp.toISOString(),
    root,
    totalFiles: entries.filter((entry) => entry.type === "file").length,
    totalDirectories: entries.filter((entry) => entry.type === "directory").length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    treeSha256: manifestDigest(entries),
    entries,
    readOnly: true
  };
}

function isManifest(value: unknown): value is StorageTreeManifest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === "arcigy.storage-tree-manifest.v1"
    && typeof record.treeSha256 === "string"
    && typeof record.totalFiles === "number"
    && typeof record.totalBytes === "number"
    && Array.isArray(record.entries);
}

function isManifestEntry(value: unknown): value is StorageTreeManifestEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const entryPath = typeof entry.path === "string" ? entry.path : "";
  const safePath = entryPath === "." || (
    entryPath.length > 0
    && !path.isAbsolute(entryPath)
    && !entryPath.includes("\\")
    && !/[\u0000-\u001f\u007f]/u.test(entryPath)
    && entryPath.split("/").every((segment) => !!segment && segment !== "." && segment !== "..")
  );
  const type = entry.type;
  const shaValid = type === "directory"
    ? entry.sha256 === null && entry.sizeBytes === 0
    : typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256);
  return safePath
    && (type === "directory" || type === "file")
    && typeof entry.sizeBytes === "number"
    && Number.isSafeInteger(entry.sizeBytes)
    && entry.sizeBytes >= 0
    && shaValid
    && typeof entry.mode === "number"
    && Number.isInteger(entry.mode)
    && entry.mode >= 0
    && entry.mode <= 0o7777
    && typeof entry.uid === "number"
    && Number.isSafeInteger(entry.uid)
    && entry.uid >= 0
    && typeof entry.gid === "number"
    && Number.isSafeInteger(entry.gid)
    && entry.gid >= 0;
}

function validateManifest(manifest: StorageTreeManifest, label: string): void {
  if (!isManifest(manifest)) fail(`${label} manifest is invalid.`);
  if (!Number.isFinite(Date.parse(manifest.generatedAt))
    || typeof manifest.root !== "string"
    || !path.isAbsolute(manifest.root)
    || manifest.readOnly !== true
    || !/^[a-f0-9]{64}$/u.test(manifest.treeSha256)
    || !manifest.entries.every(isManifestEntry)) {
    fail(`${label} manifest metadata or entries are invalid.`);
  }
  const sortedPaths = manifest.entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
  if (manifest.entries.length === 0
    || manifest.entries[0]?.path !== "."
    || manifest.entries[0]?.type !== "directory"
    || manifest.entries.some((entry, index) => entry.path !== sortedPaths[index])) {
    fail(`${label} manifest entries are not in canonical path order.`);
  }
  if (manifest.treeSha256 !== manifestDigest(manifest.entries)) fail(`${label} manifest digest is invalid.`);
  if (manifest.totalFiles !== manifest.entries.filter((entry) => entry.type === "file").length) fail(`${label} file count is invalid.`);
  if (manifest.totalDirectories !== manifest.entries.filter((entry) => entry.type === "directory").length) fail(`${label} directory count is invalid.`);
  if (manifest.totalBytes !== manifest.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)) fail(`${label} byte count is invalid.`);
  const paths = manifest.entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail(`${label} manifest has duplicate paths.`);
}

function mismatch(
  mismatches: StorageTreeMismatch[],
  entryPath: string,
  field: StorageTreeMismatch["field"],
  source: StorageTreeMismatch["source"],
  target: StorageTreeMismatch["target"]
): void {
  mismatches.push({ path: entryPath, field, source, target });
}

export function compareStorageTreeManifests(source: StorageTreeManifest, target: StorageTreeManifest): StorageTreeComparison {
  validateManifest(source, "source");
  validateManifest(target, "target");
  const sourceByPath = new Map(source.entries.map((entry) => [entry.path, entry]));
  const targetByPath = new Map(target.entries.map((entry) => [entry.path, entry]));
  const allPaths = [...new Set([...sourceByPath.keys(), ...targetByPath.keys()])].sort();
  const mismatches: StorageTreeMismatch[] = [];

  for (const entryPath of allPaths) {
    const sourceEntry = sourceByPath.get(entryPath);
    const targetEntry = targetByPath.get(entryPath);
    if (!sourceEntry) {
      mismatch(mismatches, entryPath, "missing_in_source", null, targetEntry?.type ?? null);
      continue;
    }
    if (!targetEntry) {
      mismatch(mismatches, entryPath, "missing_in_target", sourceEntry.type, null);
      continue;
    }
    for (const field of ["type", "sizeBytes", "sha256", "mode", "uid", "gid"] as const) {
      if (sourceEntry[field] !== targetEntry[field]) mismatch(mismatches, entryPath, field, sourceEntry[field], targetEntry[field]);
    }
  }

  return {
    exact: mismatches.length === 0 && source.treeSha256 === target.treeSha256,
    sourceTreeSha256: source.treeSha256,
    targetTreeSha256: target.treeSha256,
    sourceFiles: source.totalFiles,
    targetFiles: target.totalFiles,
    sourceBytes: source.totalBytes,
    targetBytes: target.totalBytes,
    mismatches
  };
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`missing ${name} value.`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => ["--write", "--copy", "--move", "--delete", "--execute"].includes(arg))) {
    fail("this tool is permanently read-only and cannot copy, move, or delete storage files.");
  }
  const root = readFlag(args, "--root");
  const sourcePath = readFlag(args, "--verify-source");
  const targetPath = readFlag(args, "--verify-target");
  if (root && !sourcePath && !targetPath) {
    if (!path.isAbsolute(root)) fail("--root must be an absolute path.");
    process.stdout.write(`${JSON.stringify(await createStorageTreeManifest(root), null, 2)}\n`);
    return;
  }
  if (!root && sourcePath && targetPath) {
    const [source, target] = await Promise.all([
      readFile(path.resolve(sourcePath), "utf8").then((value) => JSON.parse(value) as unknown),
      readFile(path.resolve(targetPath), "utf8").then((value) => JSON.parse(value) as unknown)
    ]);
    if (!isManifest(source) || !isManifest(target)) fail("verification inputs must be storage-tree manifests.");
    const comparison = compareStorageTreeManifests(source, target);
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    if (!comparison.exact) process.exitCode = 1;
    return;
  }
  fail("use either --root <absolute-directory> or --verify-source <manifest> --verify-target <manifest>.");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
