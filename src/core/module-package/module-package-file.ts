import { createHash } from "node:crypto";
import type { FurnQuoteModulePackage } from "./module-package-types";

export const MODULE_PACKAGE_FILE_EXTENSION = ".fqm";

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .filter((key) => key !== "packageHash")
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortForHash(record[key]);
      return acc;
    }, {});
}

export function canonicalizeModulePackage(modulePackage: FurnQuoteModulePackage): string {
  return JSON.stringify(sortForHash(modulePackage));
}

export function computeModulePackageHash(modulePackage: FurnQuoteModulePackage): string {
  return createHash("sha256").update(canonicalizeModulePackage(modulePackage)).digest("hex");
}

export function parseModulePackageJson(raw: string): FurnQuoteModulePackage {
  return JSON.parse(raw) as FurnQuoteModulePackage;
}

export function serializeModulePackageJson(modulePackage: FurnQuoteModulePackage): string {
  const packageHash = computeModulePackageHash(modulePackage);
  return `${JSON.stringify({ ...modulePackage, integrity: { ...modulePackage.integrity, packageHash } }, null, 2)}\n`;
}
