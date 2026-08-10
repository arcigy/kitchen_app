import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import { loadServerClientProfile } from "./serverRepositories";
import { updateServerClientLanguage } from "./serverRepositories";
import { canEditClientProfile } from "../core/client/client-context";
import { normalizeLanguage, type AppLanguage } from "../i18n";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";

type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;

export async function handleClientProfileApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: {
    getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
    readJsonBody: ReadJsonBody;
    sendJson: SendJson;
    loadProfile?: (clientId: string) => ReturnType<typeof loadServerClientProfile>;
    updateLanguage?: (clientId: string, language: AppLanguage) => ReturnType<typeof updateServerClientLanguage>;
    canEditProfile?: (context: ClientContext) => boolean;
  }
): Promise<boolean> {
  if (url.pathname !== "/api/client/profile" && url.pathname !== "/api/client/profile/language") return false;
  // Browser sessions use cookies while the Supplier Bridge extension uses the
  // same signed session through a short-lived bearer token. Keep authorization
  // and tenant resolution at the shared request boundary for both clients.
  const context = await deps.getContext(clientSessionHeaderFromRequest(req));
  if (req.method === "PATCH" && url.pathname === "/api/client/profile/language") {
    if (!(deps.canEditProfile ?? canEditClientProfile)(context)) {
      deps.sendJson(res, 403, { ok: false, code: "client_profile_forbidden", error: "You cannot change the company language." });
      return true;
    }
    const body = await deps.readJsonBody(req);
    const requested = body && typeof body === "object" ? (body as { language?: unknown }).language : null;
    const language = typeof requested === "string" && ["sk", "cs", "cz", "en"].includes(requested)
      ? normalizeLanguage(requested) : null;
    if (!language) {
      deps.sendJson(res, 400, { ok: false, code: "invalid_language", error: "language must be sk, cs, or en." });
      return true;
    }
    const profile = await (deps.updateLanguage ?? updateServerClientLanguage)(context.clientId, language);
    if (!profile) {
      deps.sendJson(res, 404, { ok: false, code: "client_profile_not_found", error: "Client profile was not found." });
      return true;
    }
    deps.sendJson(res, 200, { ok: true, profile });
    return true;
  }
  if (req.method !== "GET" || url.pathname !== "/api/client/profile") return false;
  const profile = await (deps.loadProfile ?? loadServerClientProfile)(context.clientId);
  if (!profile) {
    deps.sendJson(res, 404, { ok: false, error: "Client profile was not found." });
    return true;
  }
  deps.sendJson(res, 200, { ok: true, profile });
  return true;
}
