import { createHash } from "node:crypto";
import type { ProjectSaveFile } from "../project-save/project-save-types";

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export type ProjectWriteIdempotency = {
  keyHash: string;
  requestHash: string;
};

export type ProjectWriteConsistencyOptions = {
  expectedRevision?: number;
  idempotency?: ProjectWriteIdempotency;
};

export class ProjectSaveRevisionConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number
  ) {
    super("Project changed since it was loaded. Reload the project before saving again.");
    this.name = "ProjectSaveRevisionConflictError";
  }
}

export class ProjectIdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was already used for a different request.");
    this.name = "ProjectIdempotencyConflictError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

export function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers["idempotency-key"];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value) return null;
  if (!IDEMPOTENCY_KEY_RE.test(value)) throw new SyntaxError("Idempotency-Key is invalid.");
  return value;
}

export function createProjectWriteIdempotency(args: {
  clientId: string;
  scope: string;
  key: string;
  request: unknown;
}): ProjectWriteIdempotency {
  if (!IDEMPOTENCY_KEY_RE.test(args.key)) throw new SyntaxError("Idempotency-Key is invalid.");
  return {
    keyHash: sha256(`${args.clientId}\n${args.scope}\n${args.key}`),
    requestHash: sha256(`${args.scope}\n${canonicalJson(args.request)}`)
  };
}

export function createProjectWriteIdempotencyForText(args: {
  clientId: string;
  scope: string;
  key: string;
  requestText: string;
}): ProjectWriteIdempotency {
  if (!IDEMPOTENCY_KEY_RE.test(args.key)) throw new SyntaxError("Idempotency-Key is invalid.");
  const requestHash = createHash("sha256")
    .update(args.scope, "utf-8")
    .update("\n", "utf-8")
    .update(args.requestText, "utf-8")
    .digest("hex");
  return {
    keyHash: sha256(`${args.clientId}\n${args.scope}\n${args.key}`),
    requestHash
  };
}

export function prepareProjectSaveWrite(args: {
  stored: ProjectSaveFile | null;
  incoming: ProjectSaveFile;
  options?: ProjectWriteConsistencyOptions;
}): { save: ProjectSaveFile; replayed: boolean } {
  const { stored, incoming, options } = args;
  const idempotency = options?.idempotency;
  if (idempotency && stored?.integrity.lastWrite?.keyHash === idempotency.keyHash) {
    if (stored.integrity.lastWrite.requestHash !== idempotency.requestHash) {
      throw new ProjectIdempotencyConflictError();
    }
    return { save: stored, replayed: true };
  }

  const actualRevision = stored?.integrity.saveRevision ?? 0;
  if (options?.expectedRevision !== undefined && options.expectedRevision !== actualRevision) {
    throw new ProjectSaveRevisionConflictError(options.expectedRevision, actualRevision);
  }
  if (idempotency && (!SHA256_RE.test(idempotency.keyHash) || !SHA256_RE.test(idempotency.requestHash))) {
    throw new Error("Project write idempotency hashes are invalid.");
  }

  const { lastWrite: _lastWrite, ...integrity } = incoming.integrity;
  return {
    replayed: false,
    save: {
      ...incoming,
      integrity: {
        ...integrity,
        saveRevision: actualRevision + 1,
        ...(idempotency ? { lastWrite: idempotency } : {})
      }
    }
  };
}
