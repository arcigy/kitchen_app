import type { ClientCatalogRevision } from "../core/catalog/catalog-repository";
import { BoundedCompressedResponseCache } from "./boundedCompressedResponseCache";

const DEFAULT_MAX_ENTRIES = 8;
const DEFAULT_MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;

export type ClientCatalogBootstrapCacheKey = {
  clientId: string;
  revision: ClientCatalogRevision;
};

function cacheKey(value: ClientCatalogBootstrapCacheKey): string {
  return JSON.stringify([
    "catalog-bootstrap-v1",
    value.clientId,
    value.revision.catalogVersion,
    value.revision.updatedAt,
    value.revision.storageRevision
  ]);
}

export class ClientCatalogBootstrapResponseCache extends BoundedCompressedResponseCache<ClientCatalogBootstrapCacheKey> {
  constructor(
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxCompressedBytes = DEFAULT_MAX_COMPRESSED_BYTES
  ) {
    super(cacheKey, maxEntries, maxCompressedBytes);
  }
}

export function createClientCatalogBootstrapPendingKey(clientId: string, revision: ClientCatalogRevision | null): string {
  return revision ? cacheKey({ clientId, revision }) : JSON.stringify(["catalog-bootstrap-v1", clientId, null]);
}
