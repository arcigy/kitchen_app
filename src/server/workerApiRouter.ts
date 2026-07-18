import type http from "node:http";
import type { CatalogExactLookupCache } from "../core/catalog/catalog-exact-lookup";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import type { ModulePackageRepository } from "../core/module-package/module-package-repository";
import type { ClientContext } from "../core/client/client-context";
import { handleAssistantApi } from "./assistantEndpoint";
import { handleCatalogExactLookupApi } from "./catalogLookupEndpoint";
import { handleClientCatalogBootstrapApi } from "./clientCatalogBootstrapEndpoint";
import { handleClientAppDataRevisionApi } from "./clientAppDataRevisionEndpoint";
import { handleClientProfileApi } from "./clientEndpoint";
import { handleDemosMaterialImage, handleDemosMaterialLookup } from "./demosMaterialLookup";
import { handleModulePackageApi } from "./modulePackageEndpoint";
import { handleProjectApi } from "./projectEndpoint";
import { handleProjectMaterialsApi } from "./projectMaterialsEndpoint";
import { handleProjectMarginsApi } from "./projectMarginsEndpoint";
import { handleSupplierBridgeApi } from "./supplierBridgeEndpoint";
import type { ClientCatalogBootstrapResponseCache } from "./clientCatalogBootstrapResponseCache";
import type { ClientModulePackagesResponseCache } from "./clientModulePackagesResponseCache";

type GetClientContext = (cookieHeader: string | string[] | undefined) => Promise<ClientContext>;
type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type DirectRouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
type UrlRouteHandler = (req: http.IncomingMessage, url: URL, res: http.ServerResponse) => Promise<void>;
type EntrySpecificRouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<boolean>;

export type WorkerApiRouterContext = {
  projectRoot: string;
  getClientContext: GetClientContext;
  readJsonBody: ReadJsonBody;
  sendJson: SendJson;
  clientCatalogBootstrapResponseCache: ClientCatalogBootstrapResponseCache;
  clientModulePackagesResponseCache: ClientModulePackagesResponseCache;
  catalogLookupCache: CatalogExactLookupCache;
  createCatalogRepository(): ClientCatalogRepository;
  createModulePackageRepository(): ModulePackageRepository;
  handleCatalog: DirectRouteHandler;
  handleCatalogLookup: UrlRouteHandler;
  handleMaterialProofCatalogs: DirectRouteHandler;
  handleStorageFile(req: http.IncomingMessage, url: URL, res: http.ServerResponse): Promise<void>;
  handleExport: DirectRouteHandler;
  handleOpenBlenderOutput: DirectRouteHandler;
  handleEntrySpecificRoute?: EntrySpecificRouteHandler;
  handleNotFound(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void>;
};

export async function handleWorkerApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  context: WorkerApiRouterContext
): Promise<void> {
  if (
    await handleClientProfileApi(req, res, url, {
      getContext: context.getClientContext,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleClientAppDataRevisionApi(req, res, url, {
      projectRoot: context.projectRoot,
      getContext: context.getClientContext,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleClientCatalogBootstrapApi(req, res, url, {
      getContext: context.getClientContext,
      createRepository: context.createCatalogRepository,
      responseCache: context.clientCatalogBootstrapResponseCache,
      sendJson: context.sendJson
    })
  ) return;

  if (req.method === "GET" && url.pathname === "/api/catalog") {
    return await context.handleCatalog(req, res);
  }

  if (
    await handleCatalogExactLookupApi(req, res, url, {
      getContext: context.getClientContext,
      createRepository: context.createCatalogRepository,
      cache: context.catalogLookupCache,
      sendJson: context.sendJson
    })
  ) return;

  if (req.method === "GET" && url.pathname === "/api/catalog/lookup") {
    return await context.handleCatalogLookup(req, url, res);
  }
  if (req.method === "GET" && url.pathname === "/api/material-proof/catalogs") {
    return await context.handleMaterialProofCatalogs(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/demos/material-lookup") {
    return await handleDemosMaterialLookup(url, res, context.sendJson);
  }
  if (req.method === "GET" && url.pathname === "/api/demos/material-image") {
    return await handleDemosMaterialImage(url, res);
  }

  if (context.handleEntrySpecificRoute && await context.handleEntrySpecificRoute(req, res, url)) return;

  if (
    await handleModulePackageApi(req, res, url, {
      getContext: context.getClientContext,
      createCatalogRepository: context.createCatalogRepository,
      createModulePackageRepository: context.createModulePackageRepository,
      responseCache: context.clientModulePackagesResponseCache,
      readJsonBody: context.readJsonBody,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleProjectMaterialsApi(req, res, url, {
      projectRoot: context.projectRoot,
      getContext: context.getClientContext,
      readJsonBody: context.readJsonBody,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleProjectMarginsApi(req, res, url, {
      projectRoot: context.projectRoot,
      getContext: context.getClientContext,
      readJsonBody: context.readJsonBody,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleSupplierBridgeApi(req, res, url, {
      projectRoot: context.projectRoot,
      getContext: context.getClientContext,
      readJsonBody: context.readJsonBody,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleProjectApi(req, res, url, {
      projectRoot: context.projectRoot,
      getContext: context.getClientContext,
      readJsonBody: context.readJsonBody,
      sendJson: context.sendJson
    })
  ) return;

  if (
    await handleAssistantApi(req, res, url, {
      projectRoot: context.projectRoot,
      getContext: context.getClientContext,
      getCatalog: async (clientContext) => context.createCatalogRepository().ensureCatalogExists(clientContext),
      readJsonBody: context.readJsonBody,
      sendJson: context.sendJson
    })
  ) return;

  if (req.method === "GET" && url.pathname.startsWith("/storage/")) {
    return await context.handleStorageFile(req, url, res);
  }
  if (req.method === "POST" && url.pathname === "/api/blender/export") {
    return await context.handleExport(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/blender/open-output") {
    return await context.handleOpenBlenderOutput(req, res);
  }

  return await context.handleNotFound(req, res, url);
}
