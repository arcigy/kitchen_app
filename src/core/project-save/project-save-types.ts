import type { ClientCatalog } from "../catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";
import type { ProjectMetadata, ProjectPhaseStatus } from "../project/project-types";

export const CURRENT_PROJECT_SAVE_VERSION = 1;

export type ProjectPhaseSave = {
  phaseId: string;
  phaseName: string;
  phaseNumber: number;
  status: ProjectPhaseStatus;
  layoutState: unknown;
  kitchenState: unknown;
  moduleInstances: unknown[];
  pricingSettings?: unknown;
  quoteSettings?: unknown;
  bomSnapshot?: unknown;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCatalogSnapshot = {
  catalogVersion: number;
  capturedAt: string;
  usedMaterialIds: string[];
  usedComponentIds: string[];
  usedModuleTypes: string[];
  usedModulePackageSnapshots?: UsedModulePackageSnapshot[];
  materials: unknown[];
  components: unknown[];
  modules: unknown[];
  priceListSnapshot?: unknown;
  fullCatalog?: ClientCatalog;
};

export type UsedModulePackageSnapshot = {
  modulePackageId: string;
  moduleType: string;
  packageVersion: string;
  packageHash: string;
  packageSnapshot: FurnQuoteModulePackage;
};

export type ProjectBundledAssetManifestItem = {
  assetId: string;
  phaseId: string;
  originalPath: string;
  storageBucket: "uploads";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt?: string;
};

export type ProjectExternalAssetManifestItem = {
  assetId: string;
  originalPath: string;
  reason: "system_asset" | "public_asset" | "external_reference" | "unsupported";
};

export type ProjectMissingAssetManifestItem = {
  assetId: string;
  originalPath: string;
  reason: string;
  critical: boolean;
};

export type ProjectGeneratedAssetManifestItem = {
  assetId: string;
  originalPath: string;
  kind: "render" | "export" | "debug" | "other";
  reason: "regeneratable" | "not_required_for_restore";
};

export type ProjectAssetManifest = {
  bundled: ProjectBundledAssetManifestItem[];
  external: ProjectExternalAssetManifestItem[];
  missing: ProjectMissingAssetManifestItem[];
  generated: ProjectGeneratedAssetManifestItem[];
};

export type ProjectSaveFile = {
  format: "kitchen-app-project";
  saveFormatVersion: number;
  clientId: string;
  projectId: string;
  activePhaseId: string;
  project: ProjectMetadata;
  phases: ProjectPhaseSave[];
  catalogSnapshot: ProjectCatalogSnapshot;
  appState: {
    layout: unknown;
    kitchen: unknown;
    modules: unknown[];
    scene: unknown;
    editor?: unknown;
    camera?: unknown;
    selections?: unknown;
    pricingSettings?: unknown;
    quoteSettings?: unknown;
  };
  assets: ProjectAssetManifest;
  integrity: {
    createdAt: string;
    updatedAt: string;
    savedAt: string;
    appVersion?: string;
    saveSchemaHash?: string;
  };
};

export type EncryptedProjectFileEnvelope = {
  magic: "FURNQUOTE_ENCRYPTED_PROJECT";
  envelopeVersion: 1;
  algorithm: "AES-256-GCM";
  keyId: string;
  createdAt: string;
  payloadEncoding: "base64";
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type ProjectBundledAssetPayload = {
  assetId: string;
  phaseId: string;
  encoding: "base64";
  mimeType: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  data: string;
};

export type ProjectExportPayload = {
  payloadType: "furnquote-project-export";
  payloadVersion: 1;
  exportedAt: string;
  save: ProjectSaveFile;
  bundledAssets: ProjectBundledAssetPayload[];
};
