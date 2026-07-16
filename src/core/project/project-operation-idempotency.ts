import { sanitizeStorageId } from "../storage/storage-types";
import type { ProjectMetadata } from "./project-types";
import { ProjectIdempotencyConflictError, type ProjectWriteIdempotency } from "./project-write-consistency";

export const PROJECT_OPERATION_RECEIPT_KEY = "_arcigyOperationReceipt";

export type ProjectOperationReceipt = ProjectWriteIdempotency & {
  operation: "create" | "import";
};

type StoredProjectMetadata = ProjectMetadata & {
  [PROJECT_OPERATION_RECEIPT_KEY]?: ProjectOperationReceipt;
};

export function deterministicProjectId(prefix: string, receipt: ProjectOperationReceipt): string {
  return sanitizeStorageId(`${prefix}_${receipt.keyHash.slice(0, 32)}`, "projectId");
}

export function attachProjectOperationReceipt(
  metadata: ProjectMetadata,
  receipt: ProjectOperationReceipt
): StoredProjectMetadata {
  return { ...metadata, [PROJECT_OPERATION_RECEIPT_KEY]: receipt };
}

export function stripProjectOperationReceipt(value: unknown): ProjectMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Project metadata is invalid.");
  }
  const record = value as Record<string, unknown>;
  const { [PROJECT_OPERATION_RECEIPT_KEY]: _receipt, ...metadata } = record;
  return metadata as ProjectMetadata;
}

export function readProjectOperationReceipt(value: unknown): ProjectOperationReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = (value as Record<string, unknown>)[PROJECT_OPERATION_RECEIPT_KEY];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return null;
  const candidate = receipt as Record<string, unknown>;
  if (
    (candidate.operation !== "create" && candidate.operation !== "import") ||
    typeof candidate.keyHash !== "string" ||
    typeof candidate.requestHash !== "string"
  ) return null;
  return candidate as ProjectOperationReceipt;
}

export function assertProjectOperationReplay(value: unknown, expected: ProjectOperationReceipt): ProjectMetadata {
  const stored = readProjectOperationReceipt(value);
  if (
    !stored ||
    stored.operation !== expected.operation ||
    stored.keyHash !== expected.keyHash ||
    stored.requestHash !== expected.requestHash
  ) {
    throw new ProjectIdempotencyConflictError();
  }
  return stripProjectOperationReceipt(value);
}

export function preserveProjectOperationReceipt(existing: unknown, metadata: ProjectMetadata): StoredProjectMetadata {
  const receipt = readProjectOperationReceipt(existing);
  return receipt ? attachProjectOperationReceipt(metadata, receipt) : metadata;
}
