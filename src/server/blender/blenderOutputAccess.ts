import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../../core/client/client-context";
import { resolveClientStoragePath } from "../../core/storage/storage-path-resolver";

function assertPathInside(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)) return;
  throw new Error("File path is outside current client storage.");
}

function assertAllowedBlenderOutputExtension(filePath: string): void {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== ".blend" && extension !== ".png") {
    throw new Error("Only .blend and .png Blender outputs can be opened.");
  }
}

export function isBlenderDesktopOpenAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production";
}

export async function resolveTenantBlenderOutputPath(
  projectRoot: string,
  context: ClientContext,
  filePath: string
): Promise<string> {
  const resolved = path.resolve(filePath);
  const clientRoot = resolveClientStoragePath(projectRoot, context);
  assertPathInside(clientRoot, resolved);
  assertAllowedBlenderOutputExtension(resolved);
  const [realClientRoot, realFilePath] = await Promise.all([realpath(clientRoot), realpath(resolved)]);
  assertPathInside(realClientRoot, realFilePath);
  assertAllowedBlenderOutputExtension(realFilePath);
  if (!(await stat(realFilePath)).isFile()) throw new Error("Blender output path must be a file.");
  return realFilePath;
}

export function openFileInDesktop(filePath: string): void {
  let child;
  if (process.platform === "win32") {
    child = spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", filePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
  } else if (process.platform === "darwin") {
    child = spawn("open", [filePath], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" });
  }
  child.unref();
}
