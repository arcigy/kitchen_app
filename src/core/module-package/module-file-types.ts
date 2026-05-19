import type { FurnQuoteModulePackage } from "./module-package-types";

export const MODULE_FILE_MAGIC = "FURNQUOTE_MODULE_PACKAGE" as const;
export const MODULE_FILE_EXTENSION = ".fqm" as const;
export const MODULE_FILE_ENVELOPE_VERSION = 1 as const;
export const MODULE_FILE_PAYLOAD_TYPE = "furnquote-module-package" as const;
export const MODULE_FILE_PAYLOAD_VERSION = 1 as const;

export type FurnQuoteModuleFileEnvelope = {
  magic: typeof MODULE_FILE_MAGIC;
  envelopeVersion: typeof MODULE_FILE_ENVELOPE_VERSION;
  packageEncoding: "base64";
  compression: "gzip";
  payloadHash: string;
  createdAt: string;
  payload: string;
  signature?: {
    algorithm: "HMAC-SHA256";
    keyId: string;
    value: string;
  };
};

export type ModulePackageBundledAsset = {
  assetId: string;
  encoding: "base64";
  mimeType: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  data: string;
};

export type FurnQuoteModulePackagePayload = {
  payloadType: typeof MODULE_FILE_PAYLOAD_TYPE;
  payloadVersion: typeof MODULE_FILE_PAYLOAD_VERSION;
  exportedAt: string;
  modulePackage: FurnQuoteModulePackage;
  bundledAssets: ModulePackageBundledAsset[];
};

export type ModulePackageStoredMeta = {
  modulePackageId: string;
  moduleType: string;
  packageVersion: string;
  packageHash: string;
  source: "fqm" | "system-template" | "dev-json";
  importedAt: string;
  importedByUserId: string;
};
