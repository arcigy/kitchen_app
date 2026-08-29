import type { ModulePackageRepositoryRevision } from "../core/module-package/module-package-repository";
import { BoundedCompressedResponseCache } from "./boundedCompressedResponseCache";

const DEFAULT_MAX_ENTRIES = 16;
const DEFAULT_MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;

export type ClientModulePackagesCacheKey = {
  clientId: string;
  revision: ModulePackageRepositoryRevision;
};

function cacheKey(value: ClientModulePackagesCacheKey): string {
  return JSON.stringify([
    "module-packages-v1",
    value.clientId,
    value.revision.count,
    value.revision.updatedAt,
    value.revision.storageRevision
  ]);
}

export class ClientModulePackagesResponseCache extends BoundedCompressedResponseCache<ClientModulePackagesCacheKey> {
  constructor(maxEntries = DEFAULT_MAX_ENTRIES, maxCompressedBytes = DEFAULT_MAX_COMPRESSED_BYTES) {
    super(cacheKey, maxEntries, maxCompressedBytes);
  }
}

export function createClientModulePackagesPendingKey(
  clientId: string,
  revision: ModulePackageRepositoryRevision
): string {
  return cacheKey({ clientId, revision });
}
