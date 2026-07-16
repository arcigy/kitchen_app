import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import { createServerCatalogRepository, createServerModulePackageRepository } from "./serverRepositories";

type ClientAppDataRevisionEndpointDeps = {
  projectRoot: string;
  getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
};

export async function handleClientAppDataRevisionApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ClientAppDataRevisionEndpointDeps
): Promise<boolean> {
  if (req.method !== "GET" || url.pathname !== "/api/app-data/revision") return false;

  const context = await deps.getContext(req.headers.cookie);
  const [catalog, modules] = await Promise.all([
    createServerCatalogRepository(deps.projectRoot).getRevision(context),
    createServerModulePackageRepository(deps.projectRoot).getRevision(context)
  ]);
  deps.sendJson(res, 200, {
    ok: true,
    revision: {
      clientId: context.clientId,
      catalog,
      modules
    }
  });
  return true;
}
