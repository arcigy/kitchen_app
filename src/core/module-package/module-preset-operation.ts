import { createHash } from "node:crypto";
import type { ModulePresetWriteOperation } from "./module-package-types";
import { ModulePackageRevisionConflictError } from "./module-package-write-lock";

function canonicalJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]));
  }
  throw new Error("Preset parameters must contain valid JSON values.");
}

export function createModulePresetWriteOperation(operationId: string | undefined, userId: string, request: unknown): ModulePresetWriteOperation | undefined {
  if (operationId === undefined) return undefined;
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId)) throw new Error("Invalid preset operation identity.");
  return { operationId, userId, requestHash: createHash("sha256").update(JSON.stringify(canonicalJson(request))).digest("hex") };
}

export function isSameModulePresetOperation(saved: ModulePresetWriteOperation | undefined, requested: ModulePresetWriteOperation | undefined): boolean {
  if (!saved || !requested || saved.operationId !== requested.operationId) return false;
  if (saved.userId !== requested.userId || saved.requestHash !== requested.requestHash) throw new ModulePackageRevisionConflictError();
  return true;
}
