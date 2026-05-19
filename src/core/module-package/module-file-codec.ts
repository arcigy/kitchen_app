import { createHmac } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  MODULE_FILE_MAGIC,
  MODULE_FILE_ENVELOPE_VERSION,
  MODULE_FILE_PAYLOAD_TYPE,
  MODULE_FILE_PAYLOAD_VERSION,
  type FurnQuoteModuleFileEnvelope,
  type FurnQuoteModulePackagePayload
} from "./module-file-types";
import { sha256Hex, validateModuleFileEnvelope, validateModulePackagePayload, type ModuleFileValidationOptions } from "./module-file-validation";
import type { FurnQuoteModulePackage } from "./module-package-types";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function getModuleFileSecret(): string | null {
  return process.env.MODULE_FILE_SECRET?.trim() || null;
}

function signPayloadHash(payloadHash: string): FurnQuoteModuleFileEnvelope["signature"] | undefined {
  const secret = getModuleFileSecret();
  if (!secret) return undefined;
  return {
    algorithm: "HMAC-SHA256",
    keyId: process.env.MODULE_FILE_KEY_ID?.trim() || "default",
    value: createHmac("sha256", secret).update(payloadHash).digest("hex")
  };
}

function verifySignature(envelope: FurnQuoteModuleFileEnvelope): void {
  const secret = getModuleFileSecret();
  if (!secret) return;
  if (!envelope.signature) throw new Error("module file signature is required when MODULE_FILE_SECRET is set");
  const expected = createHmac("sha256", secret).update(envelope.payloadHash).digest("hex");
  if (expected !== envelope.signature.value) throw new Error("module file signature does not match payloadHash");
}

export function createModuleFilePayload(args: {
  modulePackage: FurnQuoteModulePackage;
  bundledAssets?: FurnQuoteModulePackagePayload["bundledAssets"];
  exportedAt?: string;
}): FurnQuoteModulePackagePayload {
  return {
    payloadType: MODULE_FILE_PAYLOAD_TYPE,
    payloadVersion: MODULE_FILE_PAYLOAD_VERSION,
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    modulePackage: args.modulePackage,
    bundledAssets: args.bundledAssets ?? []
  };
}

export function createModuleFileEnvelope(payload: FurnQuoteModulePackagePayload): FurnQuoteModuleFileEnvelope {
  const payloadBytes = Buffer.from(canonicalJson(payload), "utf-8");
  const compressed = gzipSync(payloadBytes);
  const payloadHash = sha256Hex(compressed);
  return {
    magic: MODULE_FILE_MAGIC,
    envelopeVersion: MODULE_FILE_ENVELOPE_VERSION,
    packageEncoding: "base64",
    compression: "gzip",
    payloadHash,
    createdAt: new Date().toISOString(),
    payload: compressed.toString("base64"),
    signature: signPayloadHash(payloadHash)
  };
}

export function decodeModuleFileEnvelope(
  envelope: FurnQuoteModuleFileEnvelope,
  options: ModuleFileValidationOptions = {}
): FurnQuoteModulePackagePayload {
  validateModuleFileEnvelope(envelope);
  verifySignature(envelope);
  const compressed = Buffer.from(envelope.payload, "base64");
  if (compressed.length === 0 || sha256Hex(compressed) !== envelope.payloadHash) {
    throw new Error("module file payloadHash does not match payload");
  }
  const raw = gunzipSync(compressed).toString("utf-8");
  const payload = JSON.parse(raw) as FurnQuoteModulePackagePayload;
  return validateModulePackagePayload(payload, options);
}

export function packModulePackage(input: FurnQuoteModulePackagePayload | FurnQuoteModulePackage): string {
  const payload = "payloadType" in input ? input : createModuleFilePayload({ modulePackage: input });
  return `${JSON.stringify(createModuleFileEnvelope(payload), null, 2)}\n`;
}

export function unpackModulePackage(file: string | Uint8Array, options: ModuleFileValidationOptions = {}): FurnQuoteModulePackagePayload {
  const text = typeof file === "string" ? file : Buffer.from(file).toString("utf-8");
  return decodeModuleFileEnvelope(JSON.parse(text) as FurnQuoteModuleFileEnvelope, options);
}

export function buildModulePackageFromSourceTemplate(sourceJson: FurnQuoteModulePackage): FurnQuoteModulePackagePayload {
  return createModuleFilePayload({ modulePackage: sourceJson });
}
