import type http from "node:http";
import { createClientCatalogBootstrapView } from "../core/catalog/catalog-bootstrap-view";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import type { ClientContext } from "../core/client/client-context";
import {
  createClientCatalogBootstrapPendingKey,
  type ClientCatalogBootstrapCacheKey,
  type ClientCatalogBootstrapResponseCache
} from "./clientCatalogBootstrapResponseCache";
import { acceptsGzip, gzipJsonBody, sendPrecompressedGzipJson } from "./http-response-compression";

type ClientCatalogBootstrapEndpointDeps = {
  getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  createRepository(): ClientCatalogRepository;
  responseCache: ClientCatalogBootstrapResponseCache;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
};

const BOOTSTRAP_VIEW = "catalog-bootstrap-v1";

function sameRevision(left: ClientCatalogBootstrapCacheKey["revision"] | null, right: ClientCatalogBootstrapCacheKey["revision"] | null): boolean {
  return !!left && !!right &&
    left.catalogVersion === right.catalogVersion &&
    left.updatedAt === right.updatedAt &&
    left.storageRevision === right.storageRevision;
}

export async function handleClientCatalogBootstrapApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ClientCatalogBootstrapEndpointDeps
): Promise<boolean> {
  if (req.method !== "GET" || url.pathname !== "/api/catalog/bootstrap") return false;
  const context = await deps.getContext(req.headers.cookie);
  const repository = deps.createRepository();
  const initialRevision = await repository.getRevision(context);
  const initialKey = initialRevision ? { clientId: context.clientId, revision: initialRevision } : null;
  const acceptsCompressedResponse = acceptsGzip(req.headers["accept-encoding"]);
  const cached = acceptsCompressedResponse && initialKey ? deps.responseCache.get(initialKey) : null;
  if (cached) {
    sendPrecompressedGzipJson(res, cached);
    return true;
  }

  const loadPayload = async () => {
    const catalog = await repository.ensureCatalogExists(context);
    return {
      ok: true,
      view: BOOTSTRAP_VIEW,
      catalog: createClientCatalogBootstrapView(catalog)
    };
  };

  if (!acceptsCompressedResponse) {
    deps.sendJson(res, 200, await loadPayload());
    return true;
  }

  const pendingKey = createClientCatalogBootstrapPendingKey(context.clientId, initialRevision);
  const prepared = await deps.responseCache.coalesce(pendingKey, async () => {
    const payload = await loadPayload();
    const body = await gzipJsonBody(payload);
    if (!body) return { compressed: null, payload } as const;
    const finalRevision = await repository.getRevision(context);
    if (finalRevision && (!initialRevision || sameRevision(initialRevision, finalRevision))) {
      deps.responseCache.set({ clientId: context.clientId, revision: finalRevision }, body);
    }
    return { compressed: body } as const;
  });
  if (prepared.compressed) sendPrecompressedGzipJson(res, prepared.compressed);
  else deps.sendJson(res, 200, prepared.payload);
  return true;
}
