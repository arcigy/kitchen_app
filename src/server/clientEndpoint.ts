import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import { loadServerClientProfile } from "./serverRepositories";

type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;

export async function handleClientProfileApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: {
    getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
    sendJson: SendJson;
  }
): Promise<boolean> {
  if (req.method !== "GET" || url.pathname !== "/api/client/profile") return false;
  const context = await deps.getContext(req.headers.cookie);
  const profile = await loadServerClientProfile(context.clientId);
  if (!profile) {
    deps.sendJson(res, 404, { ok: false, error: "Client profile was not found." });
    return true;
  }
  deps.sendJson(res, 200, { ok: true, profile });
  return true;
}
