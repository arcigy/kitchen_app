const MEBIBYTE = 1024 * 1024;
const DEFAULT_MAX_SINGLE_ASSET_MB = 25;
const DEFAULT_MAX_TOTAL_ASSET_MB = 150;
const DEFAULT_MAX_ASSET_COUNT = 200;
const PROJECT_IMPORT_OVERHEAD_MB = 16;

export type ProjectAssetBundleLimits = {
  maxSingleAssetBytes: number;
  maxTotalAssetBytes: number;
  maxAssetCount: number;
};

function positiveNumberEnv(env: NodeJS.ProcessEnv, name: string): number | null {
  const parsed = Number(env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveIntegerEnv(env: NodeJS.ProcessEnv, name: string): number | null {
  const parsed = Number.parseInt(String(env[name] ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getProjectAssetBundleLimits(env: NodeJS.ProcessEnv = process.env): ProjectAssetBundleLimits {
  return {
    maxSingleAssetBytes: Math.ceil((positiveNumberEnv(env, "PROJECT_FILE_MAX_SINGLE_ASSET_MB") ?? DEFAULT_MAX_SINGLE_ASSET_MB) * MEBIBYTE),
    maxTotalAssetBytes: Math.ceil((positiveNumberEnv(env, "PROJECT_FILE_MAX_TOTAL_ASSET_MB") ?? DEFAULT_MAX_TOTAL_ASSET_MB) * MEBIBYTE),
    maxAssetCount: positiveIntegerEnv(env, "PROJECT_FILE_MAX_ASSET_COUNT") ?? DEFAULT_MAX_ASSET_COUNT
  };
}

export function getProjectFileDecompressedLimitBytes(env: NodeJS.ProcessEnv = process.env): number {
  const configuredMb = positiveNumberEnv(env, "PROJECT_FILE_MAX_DECOMPRESSED_MB");
  if (configuredMb) return Math.ceil(configuredMb * MEBIBYTE);
  const encodedAssets = Math.ceil(getProjectAssetBundleLimits(env).maxTotalAssetBytes * 4 / 3);
  return encodedAssets + PROJECT_IMPORT_OVERHEAD_MB * MEBIBYTE;
}

export function getProjectImportBodyLimitBytes(env: NodeJS.ProcessEnv = process.env): number {
  const configuredMb = positiveNumberEnv(env, "HTTP_PROJECT_IMPORT_BODY_MAX_MB");
  return configuredMb ? Math.ceil(configuredMb * MEBIBYTE) : getProjectFileDecompressedLimitBytes(env);
}
