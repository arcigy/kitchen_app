import type http from "node:http";
import {
  CatalogExactLookupCache,
  createCatalogExactLookupService
} from "../core/catalog/catalog-exact-lookup";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import type { ClientContext } from "../core/client/client-context";

type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;

type ExactLookupRoute = {
  kind: "material" | "component";
  code: string;
  family?: string;
  componentType?: string;
};

export type CatalogLookupEndpointDeps = {
  getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  createRepository(): ClientCatalogRepository;
  cache: CatalogExactLookupCache;
  sendJson: SendJson;
};

function decodePathCode(value: string): string | null {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return null;
  }
}

function parseExactLookupRoute(url: URL): ExactLookupRoute | null {
  if (url.pathname === "/api/catalog/lookup") {
    const kind = url.searchParams.get("kind");
    if (kind !== "material" && kind !== "component") return null;
    return {
      kind,
      code: (url.searchParams.get("id") ?? "").trim(),
      family: url.searchParams.get("family")?.trim() || undefined,
      componentType: url.searchParams.get("componentType")?.trim() || undefined
    };
  }

  const materialMatch = url.pathname.match(/^\/api\/materials\/by-code\/(.+)$/);
  if (materialMatch) {
    const code = decodePathCode(materialMatch[1]!);
    return code === null ? { kind: "material", code: "" } : { kind: "material", code };
  }

  const componentMatch = url.pathname.match(/^\/api\/components\/by-code\/(.+)$/);
  if (componentMatch) {
    const code = decodePathCode(componentMatch[1]!);
    return code === null ? { kind: "component", code: "" } : { kind: "component", code };
  }

  return null;
}

export async function handleCatalogExactLookupApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: CatalogLookupEndpointDeps
): Promise<boolean> {
  if (req.method !== "GET") return false;
  const route = parseExactLookupRoute(url);
  if (!route) return false;
  if (!route.code) {
    deps.sendJson(res, 400, { ok: false, error: "id is required." });
    return true;
  }

  const context = await deps.getContext(req.headers.cookie);
  const service = createCatalogExactLookupService({
    repository: deps.createRepository(),
    cache: deps.cache
  });

  if (route.kind === "material") {
    const lookup = await service.lookupMaterial(context, route.code);
    const material =
      lookup.material &&
      (!route.family || (lookup.material.materialType === "board" && lookup.material.boardFamily === route.family))
        ? lookup.material
        : null;
    deps.sendJson(res, material ? 200 : 404, {
      ok: !!material,
      material,
      unitPrice: material ? lookup.unitPrice : null
    });
    return true;
  }

  const lookup = await service.lookupComponent(context, route.code);
  const component =
    lookup.component && (!route.componentType || lookup.component.componentType === route.componentType)
      ? lookup.component
      : null;
  deps.sendJson(res, component ? 200 : 404, {
    ok: !!component,
    component,
    unitPrice: component ? lookup.unitPrice : null
  });
  return true;
}
