import { randomUUID } from "node:crypto";
import type http from "node:http";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import type { ClientContext } from "../core/client/client-context";
import type { ClientProfile } from "../core/client/client-types";
import type { ClientEventRepository } from "../core/client-events/client-event-repository";
import { isClientReportedOfferEventType, type ClientEvent } from "../core/client-events/client-event-types";
import type { ProjectRepository } from "../core/project/project-repository";
import { createProjectService } from "../core/project/project-service";
import type { ProjectMetadata } from "../core/project/project-types";
import { readIdempotencyKey } from "../core/project/project-write-consistency";
import { resolveDelfiSheetMaterialMarginPolicy } from "../custom/delfi/projectMargins";
import { projectMarginsViewFromSave } from "./projectMarginsEndpoint";
import { createServerProjectRepository } from "./projectRepository";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";
import { createServerCatalogRepository, loadServerClientProfile } from "./serverRepositories";

export type OfferEventsEndpointDeps = {
  projectRoot: string;
  getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  readJsonBody(req: http.IncomingMessage): Promise<unknown>;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
  repository: ClientEventRepository;
  createProjectRepository?: () => ProjectRepository;
  createCatalogRepository?: () => ClientCatalogRepository;
  loadClientProfile?: (clientId: string) => Promise<ClientProfile | null>;
  now?: () => Date;
};

type OfferRoute = { projectId: string; action: "offer-events" | "offer-status" };

function parseRoute(pathname: string): OfferRoute | null {
  const match = /^\/api\/projects\/([^/]+)\/(offer-events|offer-status)$/.exec(pathname);
  if (!match) return null;
  return { projectId: decodeURIComponent(match[1]), action: match[2] as OfferRoute["action"] };
}

function bodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SyntaxError("Expected a JSON object.");
  if ("clientId" in body) throw new SyntaxError("Unexpected clientId in request body.");
  return body as Record<string, unknown>;
}

function isMissingProject(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Offer tracking for client success metrics:
 * - POST /api/projects/:id/offer-events records that the browser generated an offer document;
 * - PUT /api/projects/:id/offer-status marks the offer as sent to the end customer (or reverts it)
 *   and stores the server-computed offer price at that moment.
 */
export async function handleOfferEventsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: OfferEventsEndpointDeps
): Promise<boolean> {
  const route = parseRoute(url.pathname);
  if (!route) return false;
  const ctx = await deps.getContext(clientSessionHeaderFromRequest(req));
  const projectRepository = deps.createProjectRepository?.() ?? createServerProjectRepository({ projectRoot: deps.projectRoot });
  const now = (deps.now ?? (() => new Date()))();

  let project: ProjectMetadata;
  try {
    project = await projectRepository.getProject(ctx, route.projectId);
  } catch (error) {
    if (!isMissingProject(error)) throw error;
    deps.sendJson(res, 404, { ok: false, error: "Project not found." });
    return true;
  }

  try {
    if (route.action === "offer-events") {
      if (req.method !== "POST") {
        deps.sendJson(res, 405, { ok: false, error: "Method not allowed." });
        return true;
      }
      const idempotencyKey = readIdempotencyKey(req.headers);
      if (!idempotencyKey) throw new SyntaxError("Idempotency-Key header is required.");
      const body = bodyRecord(await deps.readJsonBody(req));
      if (!isClientReportedOfferEventType(body.type)) throw new SyntaxError("Unknown offer event type.");
      const result = await deps.repository.record(offerEvent(ctx, project, body.type, {}, now, idempotencyKey));
      deps.sendJson(res, 200, { ok: true, recorded: result.recorded });
      return true;
    }

    if (req.method !== "PUT") {
      deps.sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    if (ctx.role === "viewer") {
      deps.sendJson(res, 403, { ok: false, error: "Viewer role cannot change the offer status." });
      return true;
    }
    const body = bodyRecord(await deps.readJsonBody(req));
    if (typeof body.sent !== "boolean") throw new SyntaxError("sent must be a boolean.");
    const isSent = project.status === "sent";
    if (body.sent === isSent) {
      deps.sendJson(res, 200, { ok: true, project });
      return true;
    }
    const updated: ProjectMetadata = {
      ...project,
      status: body.sent ? "sent" : "draft",
      updatedAt: now.toISOString(),
      updatedByUserId: ctx.userId
    };
    await projectRepository.saveProjectMetadata(ctx, updated);
    const data = body.sent ? await offerPriceSnapshot(ctx, projectRepository, project.projectId, deps) : {};
    await deps.repository.record(offerEvent(ctx, project, body.sent ? "offer.marked_sent" : "offer.sent_reverted", data, now, null));
    deps.sendJson(res, 200, { ok: true, project: updated });
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) {
      deps.sendJson(res, 400, { ok: false, error: error.message });
      return true;
    }
    throw error;
  }
}

function offerEvent(
  ctx: ClientContext,
  project: ProjectMetadata,
  eventType: ClientEvent["eventType"],
  data: Record<string, unknown>,
  now: Date,
  idempotencyKey: string | null
): ClientEvent {
  return {
    clientId: ctx.clientId,
    projectId: project.projectId,
    eventId: randomUUID(),
    phaseId: project.activePhaseId ?? null,
    actorUserId: ctx.userId,
    eventType,
    data,
    createdAt: now.toISOString(),
    idempotencyKey
  };
}

/** The offer price as the margins view computes it; a failure never blocks marking the offer as sent. */
async function offerPriceSnapshot(
  ctx: ClientContext,
  projectRepository: ProjectRepository,
  projectId: string,
  deps: OfferEventsEndpointDeps
): Promise<Record<string, unknown>> {
  try {
    const catalogRepository = deps.createCatalogRepository?.() ?? createServerCatalogRepository(deps.projectRoot);
    const [catalog, profile, save] = await Promise.all([
      catalogRepository.ensureCatalogExists(ctx),
      (deps.loadClientProfile ?? loadServerClientProfile)(ctx.clientId),
      createProjectService(projectRepository).loadProject(ctx, projectId)
    ]);
    const currency = profile?.defaults.currency ?? "EUR";
    const sheetMaterialMargin = resolveDelfiSheetMaterialMarginPolicy(ctx.clientId, process.env.ARCIGY_DELFI_CLIENT_ID);
    const view = projectMarginsViewFromSave(save, catalog, false, currency, sheetMaterialMargin);
    return { finalPrice: view.summary.finalPrice, currency: view.currency, priceComplete: view.warnings.length === 0 };
  } catch (error) {
    return { priceError: error instanceof Error ? error.message.slice(0, 200) : "unknown" };
  }
}
