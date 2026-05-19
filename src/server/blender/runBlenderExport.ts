import { spawn } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertOutputPathInsideStorage, resolveStorageRootPath } from "../../core/storage/storage-path-resolver";
import type { StorageService } from "../../core/storage/storageService";
import type { ClientProjectPhaseScope } from "../../core/storage/storage-types";

type RunBlenderExportArgs = {
  sceneJson: unknown;
  storage: Pick<StorageService, "scope" | "ensurePhaseDirectories" | "getRenderPath">;
  sceneFileName: string;
  blendFileName: string;
  previewFileName?: string | null;
  projectRoot?: string;
  blenderPath?: string;
  timeoutMs?: number;
};

export type RunBlenderExportResult = {
  jsonPath: string;
  blendPath: string;
  previewPath: string | null;
  exitCode: number;
  stdout: string;
  stderr: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const canExecute = async (p: string) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const tryResolveBlenderFromDefaultInstall = async (): Promise<string | null> => {
  if (process.platform !== "win32") return null;

  const directCandidates = [
    "C:\\Program Files\\Blender Foundation\\Blender\\blender.exe",
    "C:\\Program Files (x86)\\Blender Foundation\\Blender\\blender.exe"
  ];
  for (const exe of directCandidates) {
    if (await canExecute(exe)) return exe;
  }

  const candidatesRoots = ["C:\\Program Files\\Blender Foundation", "C:\\Program Files (x86)\\Blender Foundation"];
  for (const root of candidatesRoots) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const blenderDirs = entries.filter((e) => e.isDirectory() && e.name.toLowerCase().startsWith("blender "));
      blenderDirs.sort((a, b) => b.name.localeCompare(a.name));
      for (const d of blenderDirs) {
        const exe = path.join(root, d.name, "blender.exe");
        if (await canExecute(exe)) return exe;
      }
    } catch {
      // ignore
    }
  }
  return null;
};

const resolveBlenderBin = async (explicit: string | undefined) => {
  if (explicit) return explicit;
  if (process.env.BLENDER_PATH) return process.env.BLENDER_PATH;
  const auto = await tryResolveBlenderFromDefaultInstall();
  return auto ?? "blender";
};

const assertAllowedResolvedAssetPath = (projectRoot: string, storageScope: ClientProjectPhaseScope, resolvedPath: string): string => {
  const resolved = path.resolve(resolvedPath);
  const allowedRoots = [
    path.resolve(projectRoot, "public"),
    path.resolve(projectRoot, "src", "assets"),
    path.resolve(
      resolveStorageRootPath(projectRoot),
      "clients",
      storageScope.clientId,
      "projects",
      storageScope.projectId,
      "phases",
      storageScope.phaseId,
      "uploads"
    )
  ];

  for (const root of allowedRoots) {
    const rel = path.relative(root, resolved);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return resolved;
  }

  throw new Error("Scene asset path is not allowed for this client/project/phase.");
};

const resolvePublicOrStorageUrlPath = (projectRoot: string, storageScope: ClientProjectPhaseScope, pathname: string): string => {
  if (pathname.startsWith("/storage/clients/")) {
    return path.join(resolveStorageRootPath(projectRoot), pathname.slice("/storage/".length));
  }
  if (pathname.startsWith("/")) return path.join(projectRoot, "public", pathname.slice(1));
  return path.resolve(projectRoot, pathname);
};

const normalizeHdriPath = (projectRoot: string, storageScope: ClientProjectPhaseScope, hdriPath: unknown): string | null => {
  if (typeof hdriPath !== "string" || !hdriPath.trim()) return null;
  const p = hdriPath.trim();
  if (path.isAbsolute(p) && !p.startsWith("/")) throw new Error("Absolute filesystem asset paths are not allowed.");
  if (p.startsWith("http://") || p.startsWith("https://")) {
    const u = new URL(p);
    return assertAllowedResolvedAssetPath(projectRoot, storageScope, resolvePublicOrStorageUrlPath(projectRoot, storageScope, u.pathname));
  }
  if (p.startsWith("/")) return assertAllowedResolvedAssetPath(projectRoot, storageScope, resolvePublicOrStorageUrlPath(projectRoot, storageScope, p));
  return assertAllowedResolvedAssetPath(projectRoot, storageScope, path.resolve(projectRoot, p));
};

const normalizePublicAssetPath = (projectRoot: string, storageScope: ClientProjectPhaseScope, uri: unknown): string | null => {
  if (typeof uri !== "string" || !uri.trim()) return null;
  const raw = uri.trim();
  if (path.isAbsolute(raw) && !raw.startsWith("/")) throw new Error("Absolute filesystem asset paths are not allowed.");

  const fromPath = (p: string) => {
    const resolved = p.startsWith("/")
      ? resolvePublicOrStorageUrlPath(projectRoot, storageScope, p)
      : path.resolve(projectRoot, p);
    return assertAllowedResolvedAssetPath(projectRoot, storageScope, resolved);
  };

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      return fromPath(u.pathname);
    } catch {
      return fromPath(raw);
    }
  }

  return fromPath(raw);
};

const withResolvedHdri = (projectRoot: string, storageScope: ClientProjectPhaseScope, sceneJson: unknown) => {
  if (!isRecord(sceneJson)) return sceneJson;
  const env = sceneJson.environment;
  if (!isRecord(env)) return sceneJson;
  const resolved = normalizeHdriPath(projectRoot, storageScope, env.hdriPath);
  return {
    ...sceneJson,
    environment: {
      ...env,
      hdriPath: resolved
    }
  };
};

const withResolvedMaterialTextures = (projectRoot: string, storageScope: ClientProjectPhaseScope, sceneJson: unknown) => {
  if (!isRecord(sceneJson)) return sceneJson;
  const objects = sceneJson.objects;
  if (!Array.isArray(objects)) return sceneJson;

  const nextObjects = objects.map((o) => {
    if (!isRecord(o)) return o;
    const mat = o.material;
    if (!isRecord(mat)) return o;
    const textures = mat.textures;
    if (!isRecord(textures)) return o;

    const resolveOne = (t: unknown) => {
      if (!isRecord(t)) return t;
      const resolvedUri = normalizePublicAssetPath(projectRoot, storageScope, t.uri);
      if (!resolvedUri) return t;
      return { ...t, uri: resolvedUri };
    };

    const nextTextures: Record<string, unknown> = { ...textures };
    for (const k of Object.keys(nextTextures)) nextTextures[k] = resolveOne(nextTextures[k]);

    return {
      ...o,
      material: {
        ...mat,
        textures: nextTextures
      }
    };
  });

  return { ...sceneJson, objects: nextObjects };
};

const withStorageMeta = (sceneJson: unknown, storageScope: ClientProjectPhaseScope) => {
  if (!isRecord(sceneJson)) return sceneJson;
  const meta = isRecord(sceneJson.meta) ? sceneJson.meta : {};
  return {
    ...sceneJson,
    meta: {
      ...meta,
      storage: storageScope
    }
  };
};

export async function runBlenderExport(args: RunBlenderExportArgs): Promise<RunBlenderExportResult> {
  const projectRoot = args.projectRoot ? path.resolve(args.projectRoot) : process.cwd();
  await args.storage.ensurePhaseDirectories();
  const jsonPath = assertOutputPathInsideStorage(projectRoot, args.storage.getRenderPath(args.sceneFileName));
  const blendPath = assertOutputPathInsideStorage(projectRoot, args.storage.getRenderPath(args.blendFileName));
  const previewPath =
    args.previewFileName === null
      ? null
      : args.previewFileName
        ? assertOutputPathInsideStorage(projectRoot, args.storage.getRenderPath(args.previewFileName))
        : null;

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await mkdir(path.dirname(blendPath), { recursive: true });
  if (previewPath) await mkdir(path.dirname(previewPath), { recursive: true });

  const sceneJson = withStorageMeta(
    withResolvedMaterialTextures(projectRoot, args.storage.scope, withResolvedHdri(projectRoot, args.storage.scope, args.sceneJson)),
    args.storage.scope
  );
  await writeFile(jsonPath, JSON.stringify(sceneJson, null, 2), "utf-8");

  const blenderBin = await resolveBlenderBin(args.blenderPath);
  if (path.isAbsolute(blenderBin) && !(await canExecute(blenderBin))) {
    throw new Error(`Blender binary not found at: ${blenderBin}. Set BLENDER_PATH or install Blender.`);
  }
  const importerPath = path.join(projectRoot, "scripts", "blender", "import_scene.py");

  const rel = (p: string) => {
    const r = path.relative(projectRoot, p);
    return r.length > 0 ? r : p;
  };

  const blenderArgs = [
    "--background",
    "--python",
    rel(importerPath),
    "--",
    rel(jsonPath),
    rel(blendPath),
    previewPath ? rel(previewPath) : "-"
  ];

  const child = spawn(blenderBin, blenderArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  const timeoutMs = typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs) ? Math.max(1_000, args.timeoutMs) : 60_000;

  const exitCode: number = await new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error(`Blender timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve(code ?? 0);
    });
  }).catch((err: unknown) => {
    const hint =
      blenderBin === "blender"
        ? "Install Blender (or set BLENDER_PATH)."
        : "Check BLENDER_PATH points to a valid Blender executable.";
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to run Blender (${blenderBin}). ${hint} Original error: ${msg}`);
  });

  if (exitCode !== 0) {
    const msg = [
      `Blender exited with code ${exitCode}.`,
      `Command: ${blenderBin} ${blenderArgs.map((a) => JSON.stringify(a)).join(" ")}`,
      stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
      stdout.trim() ? `stdout:\n${stdout.trim()}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    throw new Error(msg);
  }

  return { jsonPath, blendPath, previewPath, exitCode, stdout, stderr };
}
