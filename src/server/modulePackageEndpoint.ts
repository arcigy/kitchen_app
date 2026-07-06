import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createModulePackageService } from "../core/module-package/module-package-service";
import { createServerCatalogRepository, createServerModulePackageRepository } from "./serverRepositories";

type ModulePackageEndpointDeps = {
  projectRoot: string;
  getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  readJsonBody(req: http.IncomingMessage): Promise<unknown>;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
};

function bodyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Module import body is required.");
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function handleModulePackageApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ModulePackageEndpointDeps
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/modules")) return false;
  const context = await deps.getContext(req.headers.cookie);
  const catalogRepository = createServerCatalogRepository(deps.projectRoot);
  const service = createModulePackageService({
    context,
    packageRepository: createServerModulePackageRepository(deps.projectRoot),
    catalogRepository
  });

  if (req.method === "GET" && url.pathname === "/api/modules") {
    await catalogRepository.ensureCatalogExists(context);
    const packages = await service.listPackages();
    deps.sendJson(res, 200, { ok: true, modules: packages });
    return true;
  }

  const detailMatch = url.pathname.match(/^\/api\/modules\/([^/]+)$/);
  if (req.method === "GET" && detailMatch) {
    const modulePackage = await service.getPackage(decodeURIComponent(detailMatch[1]!));
    if (!modulePackage) {
      deps.sendJson(res, 404, { ok: false, error: "Module package not found." });
      return true;
    }
    deps.sendJson(res, 200, { ok: true, module: modulePackage });
    return true;
  }

  const presetMatch = url.pathname.match(/^\/api\/modules\/([^/]+)\/parameter-presets$/);
  if (req.method === "POST" && presetMatch) {
    const body = bodyRecord(await deps.readJsonBody(req));
    if (typeof body.clientId === "string") throw new Error("Unexpected clientId in request body.");
    const name = typeof body.name === "string" ? body.name : "";
    const note = typeof body.note === "string" ? body.note : "";
    const parameters = optionalRecord(body.parameters);
    const result = await service.createParameterPreset({
      modulePackageId: decodeURIComponent(presetMatch[1]!),
      name,
      note,
      parameters
    });
    deps.sendJson(res, 201, {
      ok: true,
      modulePackage: result.modulePackage,
      catalogModule: result.catalogModule,
      preset: {
        presetId: result.preset.presetId,
        label: result.preset.label,
        note: result.preset.note
      }
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/modules/import") {
    const body = bodyRecord(await deps.readJsonBody(req));
    if (typeof body.clientId === "string") throw new Error("Unexpected clientId in request body.");
    const fqm = typeof body.fqm === "string" ? body.fqm : typeof body.moduleFile === "string" ? body.moduleFile : undefined;
    const rawJson = typeof body.rawJson === "string" ? body.rawJson : undefined;
    const packageValue = body.package;
    if (!fqm && !rawJson && !packageValue) throw new Error("package is required.");
    const imported = await service.importPackage(
      fqm
        ? { fqm, enabled: body.enabled !== false }
        : rawJson
        ? { rawJson, enabled: body.enabled !== false }
        : { package: packageValue as FurnQuoteModulePackage, enabled: body.enabled !== false }
    );
    deps.sendJson(res, 201, { ok: true, modulePackage: imported.modulePackage, catalogModule: imported.catalogModule });
    return true;
  }

  return false;
}
