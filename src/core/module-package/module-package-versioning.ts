import { CURRENT_MODULE_PACKAGE_VERSION } from "./module-package-types";

function parseVersion(value: string | undefined): number[] {
  if (!value) return [0, 0, 0];
  return value.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function compareAppVersions(left: string | undefined, right: string | undefined): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function isSupportedModulePackageVersion(packageVersion: number): boolean {
  return Number.isInteger(packageVersion) && packageVersion >= 1 && packageVersion <= CURRENT_MODULE_PACKAGE_VERSION;
}
