import type http from "node:http";
import type { AuthSessionStore } from "../core/auth/auth-session-store";
import type { UserService } from "../core/auth/user-service";
import type { ClientContext } from "../core/client/client-context";
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthSession,
  handleExtensionAuthLogin,
  handleExtensionAuthLogout,
  handleExtensionAuthSession
} from "./authEndpoint";
import type { ClientJourneyMetrics } from "./clientJourneyMetrics";
import { handleClientJourneyMetricsApi } from "./clientJourneyMetrics";
import type { HttpRequestBudget } from "./http-request-budget";
import type { HttpRequestMetrics } from "./http-request-metrics";
import { canReadHttpMetrics } from "./http-request-metrics";
import { registerMutationAudit } from "./http-mutation-audit";
import { registerRequestObservability } from "./http-request-observability";
import { shouldRejectRequestOrigin } from "./http-request-origin";
import { registerResponseCompression, sendResponseBody } from "./http-response-compression";
import { getServerErrorStatus, publicServerErrorDetails, publicServerErrorMessage } from "./server-error-response";

type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type SendText = (res: http.ServerResponse, status: number, text: string) => void;

export type WorkerRequestPipelineContext = {
  host: string;
  port: number;
  userService: UserService;
  authSessionStore: AuthSessionStore;
  requestMetrics: HttpRequestMetrics;
  clientJourneyMetrics: ClientJourneyMetrics;
  requestBudget: HttpRequestBudget;
  readJsonBody: ReadJsonBody;
  sendJson: SendJson;
  sendText: SendText;
  checkReadiness(): Promise<unknown>;
  getClientContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  handleApplicationRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void>;
  logError?(message: string): void;
};

export function createWorkerRequestHandler(context: WorkerRequestPipelineContext) {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    registerResponseCompression(req, res);
    const requestId = registerRequestObservability(req, res);
    context.requestMetrics.register(req, res);
    try {
      const protocolHost = req.headers.host || `${context.host}:${context.port}`;
      const url = new URL(req.url || "/", `http://${protocolHost}`);
      registerMutationAudit(req, res, url, requestId);

      if (shouldRejectRequestOrigin(req, url.pathname)) {
        return context.sendJson(res, 403, { ok: false, error: "Request origin is not allowed." });
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return context.sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/metrics") {
        if (!canReadHttpMetrics(req)) return context.sendText(res, 404, "Not found");
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return sendResponseBody(res, context.requestMetrics.render() + context.clientJourneyMetrics.render());
      }

      if (req.method === "GET" && url.pathname === "/ready") {
        try {
          return context.sendJson(res, 200, await context.checkReadiness());
        } catch (error) {
          res.setHeader("Retry-After", "2");
          return context.sendJson(res, 503, { ok: false, error: publicServerErrorMessage(error, 503) });
        }
      }

      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        return await handleAuthLogin(req, res, context.readJsonBody, context.sendJson, {
          userService: context.userService,
          authSessionStore: context.authSessionStore
        });
      }
      if (req.method === "GET" && url.pathname === "/api/auth/session") {
        return await handleAuthSession(req, res, context.sendJson, {
          userService: context.userService,
          authSessionStore: context.authSessionStore
        });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        return await handleAuthLogout(req, res, context.sendJson, {
          authSessionStore: context.authSessionStore
        });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/extension-login") {
        return await handleExtensionAuthLogin(req, res, context.readJsonBody, context.sendJson, {
          userService: context.userService,
          authSessionStore: context.authSessionStore
        });
      }
      if (req.method === "GET" && url.pathname === "/api/auth/extension-session") {
        return await handleExtensionAuthSession(req, res, context.sendJson, {
          userService: context.userService,
          authSessionStore: context.authSessionStore
        });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/extension-logout") {
        return await handleExtensionAuthLogout(req, res, context.sendJson, {
          authSessionStore: context.authSessionStore
        });
      }

      const budgetDecision = context.requestBudget.acquire(req, url);
      if (!budgetDecision.allowed) {
        res.setHeader("Retry-After", String(budgetDecision.retryAfterSeconds));
        return context.sendJson(res, 429, { ok: false, error: "Request limit reached. Please retry shortly." });
      }
      budgetDecision.registerRelease(res);

      if (
        await handleClientJourneyMetricsApi(req, res, url, {
          getContext: context.getClientContext,
          readJsonBody: context.readJsonBody,
          sendJson: context.sendJson,
          metrics: context.clientJourneyMetrics
        })
      ) return;

      return await context.handleApplicationRequest(req, res, url);
    } catch (error: unknown) {
      const status = getServerErrorStatus(error);
      if (status === 503) res.setHeader("Retry-After", "2");
      const message = publicServerErrorMessage(error, status);
      (context.logError ?? console.error)(
        `[worker] requestId=${requestId} ${req.method ?? "UNKNOWN"} ${req.url ?? "/"} -> ${status}: ${error instanceof Error ? error.message : String(error)}`
      );
      return context.sendJson(res, status, { ok: false, error: message, requestId, ...publicServerErrorDetails(error) });
    }
  };
}
