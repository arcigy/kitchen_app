import { createHash } from "node:crypto";
import { sanitizeStorageFileName } from "../storage/storage-types";
import type { FurnQuoteModulePackagePayload, ModulePackageBundledAsset } from "./module-file-types";
import {
  MODULE_FILE_PAYLOAD_TYPE,
  MODULE_FILE_PAYLOAD_VERSION,
  type FurnQuoteModuleFileEnvelope
} from "./module-file-types";
import { validateFurnQuoteModulePackage, type ModulePackageValidationOptions } from "./module-package-validation";

export class ModuleFileValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid FurnQuote module file: ${errors.join("; ")}`);
  }
}

export type ModuleFileValidationOptions = ModulePackageValidationOptions & {
  maxSingleAssetBytes?: number;
  maxTotalAssetBytes?: number;
  maxAssetCount?: number;
};

const DEFAULT_MAX_SINGLE_ASSET_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_ASSET_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_ASSET_COUNT = 100;
const SAFE_ASSET_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/json", "application/octet-stream"]);

function envLimitBytes(name: string, fallback: number): number {
  const mb = Number(process.env[name]);
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : fallback;
}

function envLimitCount(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertSafeAssetFileName(fileName: string, errors: string[]): void {
  try {
    const sanitized = sanitizeStorageFileName(fileName);
    if (sanitized !== fileName) errors.push(`asset filename must already be storage-safe: ${fileName}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function validateAsset(asset: ModulePackageBundledAsset, errors: string[], options: Required<Pick<ModuleFileValidationOptions, "maxSingleAssetBytes">>) {
  if (!asset.assetId?.trim()) errors.push("assetId is required");
  if (asset.encoding !== "base64") errors.push(`asset ${asset.assetId || "(missing)"} must use base64 encoding`);
  assertSafeAssetFileName(asset.fileName, errors);
  if (!SAFE_ASSET_MIME.has(asset.mimeType)) errors.push(`unsupported asset MIME type: ${asset.mimeType}`);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(asset.data, "base64");
  } catch {
    errors.push(`asset ${asset.fileName} has invalid base64 data`);
    return;
  }
  if (bytes.length !== asset.sizeBytes) errors.push(`asset ${asset.fileName} sizeBytes does not match data`);
  if (bytes.length > options.maxSingleAssetBytes) errors.push(`asset ${asset.fileName} exceeds max single asset size`);
  if (sha256Hex(bytes) !== asset.sha256) errors.push(`asset ${asset.fileName} sha256 does not match data`);
}

export function validateModuleFileEnvelope(envelope: FurnQuoteModuleFileEnvelope): void {
  const errors: string[] = [];
  if (!isRecord(envelope)) throw new ModuleFileValidationError(["envelope must be an object"]);
  if (envelope.magic !== "FURNQUOTE_MODULE_PACKAGE") errors.push("magic must be FURNQUOTE_MODULE_PACKAGE");
  if (envelope.envelopeVersion !== 1) errors.push(`unsupported envelopeVersion ${envelope.envelopeVersion}`);
  if (envelope.packageEncoding !== "base64") errors.push("packageEncoding must be base64");
  if (envelope.compression !== "gzip") errors.push("compression must be gzip");
  if (typeof envelope.payloadHash !== "string" || !/^[a-f0-9]{64}$/.test(envelope.payloadHash)) errors.push("payloadHash must be sha256 hex");
  if (typeof envelope.payload !== "string" || envelope.payload.trim().length === 0) errors.push("payload is required");
  if (envelope.signature) {
    if (envelope.signature.algorithm !== "HMAC-SHA256") errors.push("unsupported signature algorithm");
    if (!envelope.signature.keyId.trim()) errors.push("signature keyId is required");
    if (!envelope.signature.value.trim()) errors.push("signature value is required");
  }
  if (errors.length > 0) throw new ModuleFileValidationError(errors);
}

export function validateModulePackagePayload(
  payload: FurnQuoteModulePackagePayload,
  options: ModuleFileValidationOptions = {}
): FurnQuoteModulePackagePayload {
  const errors: string[] = [];
  if (!isRecord(payload)) throw new ModuleFileValidationError(["payload must be an object"]);
  if (payload.payloadType !== MODULE_FILE_PAYLOAD_TYPE) errors.push(`payloadType must be ${MODULE_FILE_PAYLOAD_TYPE}`);
  if (payload.payloadVersion !== MODULE_FILE_PAYLOAD_VERSION) errors.push(`unsupported payloadVersion ${payload.payloadVersion}`);
  if (!Array.isArray(payload.bundledAssets)) errors.push("bundledAssets must be an array");

  const maxSingleAssetBytes = options.maxSingleAssetBytes ?? envLimitBytes("MODULE_FILE_MAX_SINGLE_ASSET_MB", DEFAULT_MAX_SINGLE_ASSET_BYTES);
  const maxTotalAssetBytes = options.maxTotalAssetBytes ?? envLimitBytes("MODULE_FILE_MAX_TOTAL_ASSET_MB", DEFAULT_MAX_TOTAL_ASSET_BYTES);
  const maxAssetCount = options.maxAssetCount ?? envLimitCount("MODULE_FILE_MAX_ASSET_COUNT", DEFAULT_MAX_ASSET_COUNT);
  const assets = Array.isArray(payload.bundledAssets) ? payload.bundledAssets : [];
  if (assets.length > maxAssetCount) errors.push("bundledAssets exceeds max asset count");
  for (const asset of assets) validateAsset(asset, errors, { maxSingleAssetBytes });
  const totalBytes = assets.reduce((sum, asset) => sum + (Number.isFinite(asset.sizeBytes) ? asset.sizeBytes : 0), 0);
  if (totalBytes > maxTotalAssetBytes) errors.push("bundledAssets exceeds max total asset size");

  try {
    validateFurnQuoteModulePackage(payload.modulePackage, options);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (errors.length > 0) throw new ModuleFileValidationError(errors);
  return payload;
}
