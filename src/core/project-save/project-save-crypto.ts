import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { EncryptedProjectFileEnvelope, ProjectBundledAssetPayload, ProjectExportPayload, ProjectSaveFile } from "./project-save-types";
import { PROJECT_FILE_MAGIC } from "./project-save-file";
import { loadProjectSaveFile } from "./project-save-loader";
import { validateProjectSaveFile } from "./project-save-validation";

export type ProjectFileCryptoOptions = {
  secret?: string;
  keyId?: string;
  allowDevFallback?: boolean;
};

function getSecret(options: ProjectFileCryptoOptions = {}): string {
  const secret = options.secret ?? process.env.PROJECT_FILE_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("PROJECT_FILE_SECRET is required in production.");
  if (options.allowDevFallback === false) throw new Error("PROJECT_FILE_SECRET is required.");
  return "dev-only-project-file-secret-change-me";
}

function getKey(options: ProjectFileCryptoOptions = {}): Buffer {
  return createHash("sha256").update(getSecret(options), "utf-8").digest();
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`).join(",")}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertSafeFileName(fileName: string): void {
  if (!fileName.trim() || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    throw new Error("Bundled asset fileName is unsafe.");
  }
}

function assertSafeId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label} is invalid.`);
}

function assertSha256(value: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Bundled asset sha256 is invalid.");
}

function decodeBase64Strict(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("Bundled asset data must be valid base64.");
  }
  return Buffer.from(value, "base64");
}

export function validateBundledAssets(assets: ProjectBundledAssetPayload[]): void {
  if (!Array.isArray(assets)) throw new Error("Project export bundledAssets must be an array.");
  const ids = new Set<string>();
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") throw new Error("Bundled asset is invalid.");
    if (typeof asset.assetId !== "string" || !asset.assetId.trim()) throw new Error("Bundled asset assetId is required.");
    if (typeof asset.phaseId !== "string" || !asset.phaseId.trim()) throw new Error("Bundled asset phaseId is required.");
    assertSafeId(asset.phaseId, "Bundled asset phaseId");
    if (ids.has(asset.assetId)) throw new Error("Bundled asset assetId must be unique.");
    ids.add(asset.assetId);
    if (asset.encoding !== "base64") throw new Error("Bundled asset encoding is unsupported.");
    if (typeof asset.mimeType !== "string" || !asset.mimeType.trim()) throw new Error("Bundled asset mimeType is required.");
    if (typeof asset.fileName !== "string") throw new Error("Bundled asset fileName is required.");
    assertSafeFileName(asset.fileName);
    if (typeof asset.sha256 !== "string") throw new Error("Bundled asset sha256 is required.");
    assertSha256(asset.sha256);
    if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 0) throw new Error("Bundled asset sizeBytes is invalid.");
    if (typeof asset.data !== "string") throw new Error("Bundled asset data is required.");
    const decoded = decodeBase64Strict(asset.data);
    if (decoded.byteLength !== asset.sizeBytes) throw new Error("Bundled asset sizeBytes does not match data.");
    const actual = createHash("sha256").update(decoded).digest("hex");
    if (actual !== asset.sha256.toLowerCase()) throw new Error("Bundled asset sha256 does not match data.");
  }
}

export function validateProjectExportPayload(payload: ProjectExportPayload): void {
  if (!isRecord(payload)) throw new Error("Project export payload must be an object.");
  if (payload.payloadType !== "furnquote-project-export") throw new Error("Project export payload type is unsupported.");
  if (payload.payloadVersion !== 1) throw new Error("Project export payload version is unsupported.");
  if (typeof payload.exportedAt !== "string" || !payload.exportedAt) throw new Error("Project export exportedAt is required.");
  validateProjectSaveFile(payload.save);
  validateBundledAssets(payload.bundledAssets);
}

function assertEnvelope(value: unknown): EncryptedProjectFileEnvelope {
  if (!value || typeof value !== "object") throw new Error("Encrypted project file envelope is invalid.");
  const envelope = value as EncryptedProjectFileEnvelope;
  if (envelope.magic !== PROJECT_FILE_MAGIC) throw new Error("Encrypted project file magic is invalid.");
  if (envelope.envelopeVersion !== 1) throw new Error("Encrypted project file envelope version is unsupported.");
  if (envelope.algorithm !== "AES-256-GCM") throw new Error("Encrypted project file algorithm is unsupported.");
  if (envelope.payloadEncoding !== "base64") throw new Error("Encrypted project file encoding is unsupported.");
  for (const field of ["iv", "authTag", "ciphertext", "keyId", "createdAt"] as const) {
    if (typeof envelope[field] !== "string" || envelope[field].length === 0) throw new Error(`Encrypted project file ${field} is required.`);
  }
  return envelope;
}

export function encryptProjectSaveFile(save: ProjectSaveFile, options: ProjectFileCryptoOptions = {}): EncryptedProjectFileEnvelope {
  return encryptProjectExportPayload({
    payloadType: "furnquote-project-export",
    payloadVersion: 1,
    exportedAt: new Date().toISOString(),
    save,
    bundledAssets: []
  }, options);
}

export function encryptProjectExportPayload(payload: ProjectExportPayload, options: ProjectFileCryptoOptions = {}): EncryptedProjectFileEnvelope {
  validateProjectExportPayload(payload);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(options), iv);
  const compressed = gzipSync(Buffer.from(canonicalJson(payload), "utf-8"));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    magic: PROJECT_FILE_MAGIC,
    envelopeVersion: 1,
    algorithm: "AES-256-GCM",
    keyId: options.keyId ?? process.env.PROJECT_FILE_KEY_ID ?? "v1",
    createdAt: new Date().toISOString(),
    payloadEncoding: "base64",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptProjectSaveFile(envelopeValue: unknown, options: ProjectFileCryptoOptions = {}): ProjectSaveFile {
  return decryptProjectExportPayload(envelopeValue, options).save;
}

export function decryptProjectExportPayload(envelopeValue: unknown, options: ProjectFileCryptoOptions = {}): ProjectExportPayload {
  const envelope = assertEnvelope(envelopeValue);
  const decipher = createDecipheriv("aes-256-gcm", getKey(options), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  const payload = JSON.parse(gunzipSync(decrypted).toString("utf-8")) as ProjectExportPayload | ProjectSaveFile;
  if (isRecord(payload) && "payloadType" in payload && payload.payloadType === "furnquote-project-export") {
    const migratedPayload = {
      ...payload,
      save: loadProjectSaveFile(payload.save)
    } as ProjectExportPayload;
    validateProjectExportPayload(migratedPayload);
    return migratedPayload;
  }
  throw new Error("Project export payload type is unsupported.");
}
