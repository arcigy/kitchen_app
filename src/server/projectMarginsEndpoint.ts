import type http from "node:http";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ClientContext } from "../core/client/client-context";
import type { ClientProfile } from "../core/client/client-types";
import type { PriceCurrency } from "../core/pricing/currency";
import {
  normalizeProjectMarginSettingsState,
  type ProjectMarginCategory,
  type ProjectMarginTarget
} from "../core/project-margins/project-margin-types";
import { isProjectMarginCategory } from "../core/project-margins/project-margin-validation";
import {
  ProjectMarginRevisionConflictError,
  type ProjectRepository
} from "../core/project/project-repository";
import { createProjectService } from "../core/project/project-service";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import type { ProjectMaterialWarning } from "../core/project-materials/project-material-types";
import {
  applyProjectMarginSettingsOperation,
  buildProjectMarginsView,
  projectMarginTargetIds,
  type ProjectMarginSettingsOperation,
  type ProjectMarginsView
} from "../layout/bom/projectMargins";
import { buildProjectPricingViews, type ProjectPricingView } from "../layout/bom/projectPricing";
import type { KitchenGroup, LayoutInstance } from "../layout/appState";
import type { KitchenContext } from "../layout/kitchenContext";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";
import { resolveProjectMaterialInputs } from "./projectMaterialQuantityResolver";
import { createServerProjectRepository } from "./projectRepository";
import { createServerCatalogRepository, loadServerClientProfile } from "./serverRepositories";

type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type GetContext = (cookieHeader: string | string[] | undefined) => Promise<ClientContext>;

export type ProjectMarginsEndpointDeps = {
  projectRoot: string;
  getContext: GetContext;
  readJsonBody: ReadJsonBody;
  sendJson: SendJson;
  createProjectRepository?: () => ProjectRepository;
  createCatalogRepository?: () => ClientCatalogRepository;
  loadClientProfile?: (clientId: string) => Promise<ClientProfile | null>;
};

type ProjectMarginsRoute = { projectId: string };

class ProjectMarginRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 = 400,
    readonly code: "INVALID_MARGIN_REQUEST" | "STALE_MARGIN_TARGET" = "INVALID_MARGIN_REQUEST"
  ) {
    super(message);
  }
}

function parseRoute(pathname: string): ProjectMarginsRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "api" || parts[1] !== "projects" || parts[3] !== "margins") return null;
  try {
    const projectId = decodeURIComponent(parts[2]!);
    return projectId ? { projectId } : null;
  } catch {
    return null;
  }
}

function record(value: unknown, path = "request body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectMarginRequestError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ProjectMarginRequestError(`${path} must be a finite number.`);
  return value;
}

function category(value: unknown, path: string): ProjectMarginCategory {
  if (!isProjectMarginCategory(value)) throw new ProjectMarginRequestError(`${path} is unsupported.`);
  return value;
}

function target(value: unknown): ProjectMarginTarget {
  const body = record(value, "operation.target");
  const scopeId = typeof body.scopeId === "string" ? body.scopeId.trim() : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!scopeId || !itemId) throw new ProjectMarginRequestError("operation.target requires scopeId and itemId.");
  return { scopeId, itemId, category: category(body.category, "operation.target.category") };
}

export function parseProjectMarginSettingsOperation(value: unknown): ProjectMarginSettingsOperation {
  const body = record(value, "operation");
  switch (body.type) {
    case "set_default":
      return { type: "set_default", marginPercent: finiteNumber(body.marginPercent, "operation.marginPercent") };
    case "set_group":
      return {
        type: "set_group",
        category: category(body.category, "operation.category"),
        marginPercent: finiteNumber(body.marginPercent, "operation.marginPercent")
      };
    case "set_item":
      return {
        type: "set_item",
        target: target(body.target),
        marginPercent: finiteNumber(body.marginPercent, "operation.marginPercent")
      };
    case "reset_group":
      return { type: "reset_group", category: category(body.category, "operation.category") };
    case "reset_item":
      return { type: "reset_item", target: target(body.target) };
    case "set_additional_labor":
      return {
        type: "set_additional_labor",
        additionalLaborCost: finiteNumber(body.additionalLaborCost, "operation.additionalLaborCost")
      };
    default:
      throw new ProjectMarginRequestError("Unsupported project margin operation.");
  }
}

function entriesFromSave(save: ProjectSaveFile, catalog: ClientCatalog): { entries: ProjectPricingView[]; warnings: string[] } {
  const resolutionWarnings: ProjectMaterialWarning[] = [];
  const inputs = resolveProjectMaterialInputs(save, catalog, resolutionWarnings);
  const warnings = resolutionWarnings.map((warning) => warning.description);
  const entries: ProjectPricingView[] = [];

  for (const instance of inputs.instances) {
    try {
      const context = resolveProjectMarginKitchenContext(instance, inputs.kitchenContext, inputs.kitchenGroups);
      entries.push(...buildProjectPricingViews([instance], [], [], context, catalog));
    } catch (error) {
      warnings.push(`Modul ${instance.id}: cenu sa nepodarilo vypočítať (${error instanceof Error ? error.message : "neznáma chyba"}).`);
    }
  }
  for (const worktop of inputs.worktops) {
    try {
      entries.push(...buildProjectPricingViews([], [worktop], [], inputs.kitchenContext, catalog));
    } catch (error) {
      warnings.push(`Pracovná doska ${worktop.id}: cenu sa nepodarilo vypočítať (${error instanceof Error ? error.message : "neznáma chyba"}).`);
    }
  }
  for (const furniture of inputs.customFurniture) {
    try {
      entries.push(...buildProjectPricingViews([], [], [furniture], inputs.kitchenContext, catalog));
    } catch (error) {
      warnings.push(`Vlastný nábytok ${furniture.id}: cenu sa nepodarilo vypočítať (${error instanceof Error ? error.message : "neznáma chyba"}).`);
    }
  }
  return { entries, warnings };
}

export function resolveProjectMarginKitchenContext(
  instance: Pick<LayoutInstance, "kitchenGroupId">,
  fallback: KitchenContext,
  groups: readonly KitchenGroup[]
): KitchenContext {
  return groups.find((group) => group.id === instance.kitchenGroupId)?.ctx ?? fallback;
}

export function projectMarginsViewFromSave(
  save: ProjectSaveFile,
  catalog: ClientCatalog,
  editable: boolean,
  currency: PriceCurrency = "EUR"
): ProjectMarginsView {
  const { entries, warnings } = entriesFromSave(save, catalog);
  return buildProjectMarginsView(entries, normalizeProjectMarginSettingsState(save.appState.quoteSettings), {
    editable,
    warnings,
    currency,
    materialAssignments: save.appState.materialAssignments.assignments
  });
}

export async function handleProjectMarginsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ProjectMarginsEndpointDeps
): Promise<boolean> {
  const route = parseRoute(url.pathname);
  if (!route) return false;
  const ctx = await deps.getContext(clientSessionHeaderFromRequest(req));
  if (req.method === "PUT" && ctx.role === "viewer") {
    deps.sendJson(res, 403, { ok: false, code: "MARGIN_WRITE_FORBIDDEN", error: "Viewer role cannot change project margins." });
    return true;
  }
  if (req.method !== "GET" && req.method !== "PUT") {
    deps.sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed." });
    return true;
  }

  const repository = deps.createProjectRepository?.() ?? createServerProjectRepository({ projectRoot: deps.projectRoot });
  const catalogRepository = deps.createCatalogRepository?.() ?? createServerCatalogRepository(deps.projectRoot);
  const [catalog, profile] = await Promise.all([
    catalogRepository.ensureCatalogExists(ctx),
    (deps.loadClientProfile ?? loadServerClientProfile)(ctx.clientId)
  ]);
  const currency = profile?.defaults.currency ?? "EUR";
  const save = await createProjectService(repository).loadProject(ctx, route.projectId);
  const currentState = normalizeProjectMarginSettingsState(save.appState.quoteSettings);
  const currentView = projectMarginsViewFromSave(save, catalog, ctx.role !== "viewer", currency);

  if (req.method === "GET") {
    deps.sendJson(res, 200, { ok: true, view: currentView });
    return true;
  }

  try {
    const body = record(await deps.readJsonBody(req));
    if ("clientId" in body) throw new ProjectMarginRequestError("Unexpected clientId in request body.");
    const revision = finiteNumber(body.revision, "revision");
    if (!Number.isSafeInteger(revision) || revision < 0) throw new ProjectMarginRequestError("revision must be a non-negative safe integer.");
    if (revision !== currentState.revision) {
      deps.sendJson(res, 409, {
        ok: false,
        code: "PROJECT_MARGIN_REVISION_CONFLICT",
        error: "Project margins changed in another session. Reload and try again.",
        revision: currentState.revision
      });
      return true;
    }
    const operation = parseProjectMarginSettingsOperation(body.operation);
    let nextState;
    try {
      nextState = applyProjectMarginSettingsOperation(
        currentState,
        operation,
        projectMarginTargetIds(currentView),
        new Date().toISOString()
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid project margin operation.";
      const stale = message.includes("no longer exists");
      throw new ProjectMarginRequestError(message, 422, stale ? "STALE_MARGIN_TARGET" : "INVALID_MARGIN_REQUEST");
    }
    const updatedSave = await repository.updateProjectMarginSettings(
      ctx,
      save.projectId,
      save.activePhaseId,
      revision,
      nextState
    );
    deps.sendJson(res, 200, { ok: true, view: projectMarginsViewFromSave(updatedSave, catalog, true, currency) });
    return true;
  } catch (error) {
    if (error instanceof ProjectMarginRevisionConflictError) {
      deps.sendJson(res, 409, {
        ok: false,
        code: error.code,
        error: "Project margins changed in another session. Reload and try again.",
        revision: error.actualRevision
      });
      return true;
    }
    if (error instanceof ProjectMarginRequestError) {
      deps.sendJson(res, error.status, { ok: false, code: error.code, error: error.message });
      return true;
    }
    throw error;
  }
}
