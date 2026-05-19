import path from "node:path";

const GLOBAL_DEBUG_OUTPUT_ROOTS = [
  path.join("public", "debug-pdf"),
  "outputs"
];

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function isGlobalDebugOutputPath(targetPath: string, projectRoot = process.cwd()): boolean {
  const resolved = path.resolve(projectRoot, targetPath);
  return GLOBAL_DEBUG_OUTPUT_ROOTS.some((root) => isInside(path.resolve(projectRoot, root), resolved));
}

export function assertDevOnlyDebugOutputAllowed(targetPath: string, projectRoot = process.cwd()): void {
  if (process.env.NODE_ENV === "production" && isGlobalDebugOutputPath(targetPath, projectRoot)) {
    throw new Error("Global debug output paths are disabled in production.");
  }
}
