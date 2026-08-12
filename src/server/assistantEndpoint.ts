import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { runAssistantTurn } from "../assistant/agent";
import { reindexAssistantRag, searchAssistantRag } from "../assistant/rag";
import type { AssistantTurnRequest } from "../assistant/types";
import {
  ASSISTANT_CAPABILITY_BOUNDARIES,
  assistantToolsForRole,
  assistantToolMetadataForOrchestrator,
  canRoleUseAssistantTool
} from "../assistant/toolRegistry";
import { ASSISTANT_CAPABILITY_PACKS } from "../assistant/capabilityDiscovery";
import { validateAssistantToolCall } from "../assistant/toolValidation";
import { getAssistantModelAssignments } from "../assistant/openaiResponses";
import { localeForLanguage, normalizeLanguage } from "../i18n";

type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type GetContext = (cookieHeader: string | string[] | undefined) => Promise<ClientContext>;
type GetCatalog = (ctx: ClientContext) => Promise<ClientCatalog>;

type AssistantEndpointDeps = {
  projectRoot: string;
  getContext: GetContext;
  getCatalog: GetCatalog;
  readJsonBody: ReadJsonBody;
  sendJson: SendJson;
};

function isAssistantRoute(pathname: string): boolean {
  return pathname === "/api/assistant/turn" ||
    pathname === "/api/assistant/continue" ||
    pathname === "/api/assistant/capabilities" ||
    pathname === "/api/assistant/tool-authorization" ||
    pathname === "/api/assistant/rag/reindex";
}

function getBodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected JSON body.");
  return body as Record<string, unknown>;
}

function assertNoClientIdPayload(body: unknown): void {
  if (body && typeof body === "object" && "clientId" in body) {
    throw new Error("Unexpected clientId in request body.");
  }
}

function parseAssistantTurnRequest(body: unknown): AssistantTurnRequest {
  const record = getBodyRecord(body);
  assertNoClientIdPayload(record);
  if (typeof record.message !== "string") throw new Error("message is required.");
  if (!record.clientContext || typeof record.clientContext !== "object" || Array.isArray(record.clientContext)) {
    throw new Error("clientContext is required.");
  }
  return {
    message: record.message.slice(0, 8000),
    locale: typeof record.locale === "string" && ["sk-SK", "cs-CZ", "en-GB"].includes(record.locale)
      ? record.locale as "sk-SK" | "cs-CZ" | "en-GB"
      : localeForLanguage(normalizeLanguage(undefined)),
    clientContext: record.clientContext as AssistantTurnRequest["clientContext"],
    conversation: Array.isArray(record.conversation) ? record.conversation as AssistantTurnRequest["conversation"] : [],
    toolResults: Array.isArray(record.toolResults) ? record.toolResults as AssistantTurnRequest["toolResults"] : [],
    workflow: record.workflow && typeof record.workflow === "object" && !Array.isArray(record.workflow)
      ? record.workflow as AssistantTurnRequest["workflow"]
      : null,
    debugTraceId: typeof record.debugTraceId === "string" ? record.debugTraceId.slice(0, 120) : undefined,
    debugCycle: typeof record.debugCycle === "number" && Number.isInteger(record.debugCycle)
      ? Math.max(0, Math.min(20, record.debugCycle))
      : undefined
  };
}

export async function handleAssistantApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: AssistantEndpointDeps
): Promise<boolean> {
  if (!isAssistantRoute(url.pathname)) return false;
  const ctx = await deps.getContext(req.headers.cookie);
  const catalog = await deps.getCatalog(ctx);

  if (req.method === "GET" && url.pathname === "/api/assistant/capabilities") {
    deps.sendJson(res, 200, {
      ok: true,
      knowledgeVersion: "assistant-capabilities.v3",
      tools: assistantToolsForRole(ctx.role),
      orchestratorToolMetadata: assistantToolMetadataForOrchestrator(undefined, ctx.role),
      orchestration: {
        stages: ["communicator", "orchestrator", "executor", "analyzer", "communicator"],
        maxIterations: 5,
        models: getAssistantModelAssignments()
      },
      boundaries: ASSISTANT_CAPABILITY_BOUNDARIES,
      capabilityPacks: ASSISTANT_CAPABILITY_PACKS,
      tenantAvailability: {
        enabledModulePackageIds: catalog.modules.filter((item) => item.enabled).map((item) => item.modulePackageId).filter(Boolean),
        vendorId: catalog.vendorCatalog?.vendorId ?? null
      }
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/assistant/tool-authorization") {
    const raw = await deps.readJsonBody(req);
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const toolId = typeof body.toolId === "string" ? body.toolId : "";
    const input = body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? body.input as Record<string, unknown>
      : {};
    const validation = validateAssistantToolCall({ id: "server_authorization", toolId, input });
    if (validation.errors.length > 0) {
      deps.sendJson(res, 400, { authorized: false, error: validation.errors.join(" ") });
      return true;
    }
    if (!validation.definition || !canRoleUseAssistantTool(ctx.role, validation.definition)) {
      deps.sendJson(res, 403, { authorized: false, error: "Your current role is not allowed to execute this assistant tool." });
      return true;
    }
    if (toolId === "catalog.insertModule") {
      const modulePackageId = String(input.modulePackageId ?? "");
      const authorized = catalog.modules.some((item) => item.enabled && item.modulePackageId === modulePackageId);
      deps.sendJson(res, authorized ? 200 : 403, {
        authorized,
        error: authorized ? undefined : "Module package is not enabled for the authenticated tenant."
      });
      return true;
    }
    if (toolId === "kitchen.create") {
      const modules = Array.isArray(input.modules)
        ? input.modules.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
        : [];
      const requestedPackageIds = modules.map((item) => String(item.modulePackageId ?? ""));
      const packagesAuthorized = requestedPackageIds.every((modulePackageId) =>
        !!modulePackageId && catalog.modules.some((item) => item.enabled && item.modulePackageId === modulePackageId)
      );
      const contextPatch = input.contextPatch && typeof input.contextPatch === "object" && !Array.isArray(input.contextPatch)
        ? input.contextPatch as Record<string, unknown>
        : {};
      const worktop = input.worktop && typeof input.worktop === "object" && !Array.isArray(input.worktop)
        ? input.worktop as Record<string, unknown>
        : {};
      const requestedMaterialIds = [
        contextPatch.frontsMaterialId,
        contextPatch.corpusMaterialId,
        contextPatch.backMaterialId,
        contextPatch.drawerBottomMaterialId,
        contextPatch.worktopMaterialId,
        worktop.materialId
      ].filter((value): value is string => typeof value === "string" && value.length > 0);
      const materialsAuthorized = requestedMaterialIds.every((materialId) =>
        catalog.materials.some((material) => material.id === materialId && material.isActive !== false)
      );
      const handleComponentId = typeof contextPatch.handleComponentId === "string" ? contextPatch.handleComponentId : "";
      const componentAuthorized = !handleComponentId || catalog.components.some((component) =>
        component.id === handleComponentId && component.isActive !== false
      );
      const authorized = packagesAuthorized && materialsAuthorized && componentAuthorized;
      deps.sendJson(res, authorized ? 200 : 403, {
        authorized,
        error: authorized ? undefined : "Kitchen intent references a module, material or component outside the authenticated tenant catalog."
      });
      return true;
    }
    if (toolId === "vendorCatalog.insertResolvedModule") {
      const catalogKey = String(input.catalogKey ?? "");
      const productTemplateId = String(input.productTemplateId ?? "");
      const moduleType = String(input.moduleType ?? "");
      const modulePackageId = String(input.modulePackageId ?? "");
      const vendorMatch = catalog.vendorCatalog?.productVariants.some((item) =>
        item.catalogKey === catalogKey && item.productTemplateId === productTemplateId
      ) ?? false;
      const moduleMatch = catalog.modules.some((item) =>
        item.enabled && item.moduleType === moduleType && item.modulePackageId === modulePackageId
      );
      const authorized = vendorMatch && moduleMatch;
      deps.sendJson(res, authorized ? 200 : 403, {
        authorized,
        error: authorized ? undefined : "Resolved vendor module is not available in the authenticated tenant catalog."
      });
      return true;
    }
    deps.sendJson(res, 200, { authorized: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/assistant/rag/reindex") {
    const index = await reindexAssistantRag(deps.projectRoot, ctx, catalog);
    deps.sendJson(res, 200, { ok: true, persisted: index.persisted, chunks: index.chunks.length });
    return true;
  }

  if (req.method === "POST" && (url.pathname === "/api/assistant/turn" || url.pathname === "/api/assistant/continue")) {
    const request = parseAssistantTurnRequest(await deps.readJsonBody(req));
    const ragChunks = await searchAssistantRag({
      projectRoot: deps.projectRoot,
      ctx,
      catalog,
      query: request.message,
      limit: 6
    });
    const response = await runAssistantTurn({ ...request, ragChunks, catalog, actorRole: ctx.role });
    deps.sendJson(res, 200, response);
    return true;
  }

  deps.sendJson(res, 405, { ok: false, error: "Method not allowed." });
  return true;
}
