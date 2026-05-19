import type { EncryptedProjectFileEnvelope } from "./project-save-types";

export const PROJECT_FILE_MAGIC = "FURNQUOTE_ENCRYPTED_PROJECT";
export const PROJECT_FILE_EXTENSION = ".fqp";
export const PROJECT_FILE_MIME_TYPE = "application/octet-stream";

export function toSafeProjectFileName(name: string | undefined, fallback = "project"): string {
  const safe = (name ?? "")
    .trim()
    .replace(/\.[Ff][Qq][Pp]$/, "")
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^[_ .-]+|[_ .-]+$/g, "")
    .slice(0, 80);
  return `${safe || fallback}${PROJECT_FILE_EXTENSION}`;
}

export function serializeEncryptedProjectFile(envelope: EncryptedProjectFileEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

export function parseEncryptedProjectFile(text: string): unknown {
  return JSON.parse(text) as unknown;
}
