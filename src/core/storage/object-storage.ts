import { resolveObjectStoragePrefix } from "../database/database-config";
import { sanitizeStorageFileName, sanitizeStorageId, type PhaseStorageBucket } from "./storage-types";

export type ObjectStorageKeyInput = {
  clientId: string;
  projectId?: string | null;
  phaseId?: string | null;
  bucket: PhaseStorageBucket | "catalog" | "organization" | "exports";
  assetId: string;
  fileName: string;
};

export function buildObjectStorageKey(input: ObjectStorageKeyInput, env: NodeJS.ProcessEnv = process.env): string {
  const prefix = resolveObjectStoragePrefix(env);
  const clientId = sanitizeStorageId(input.clientId, "clientId");
  const assetId = sanitizeStorageId(input.assetId, "assetId");
  const fileName = sanitizeStorageFileName(input.fileName);
  const scope = input.projectId
    ? [
        "organizations",
        clientId,
        "projects",
        sanitizeStorageId(input.projectId, "projectId"),
        "phases",
        sanitizeStorageId(input.phaseId || "phase_1", "phaseId")
      ]
    : ["organizations", clientId];
  return [prefix, ...scope, input.bucket, `${assetId}-${fileName}`].join("/");
}
