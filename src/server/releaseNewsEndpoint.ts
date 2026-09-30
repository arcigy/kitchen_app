import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import { findReleaseNotice, RELEASE_NOTICES } from "../core/release-news/releaseNewsCatalog";
import type { ReleaseNewsRepository } from "../core/release-news/releaseNewsRepository";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";

type Dependencies = {
  getContext(cookie: string | string[] | undefined): Promise<ClientContext>;
  readJsonBody(req: http.IncomingMessage): Promise<unknown>;
  sendJson(res: http.ServerResponse, status: number, body: unknown): void;
  repository: ReleaseNewsRepository;
  now?: () => Date;
};

export async function handleReleaseNewsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: Dependencies
): Promise<boolean> {
  if (url.pathname !== "/api/release-news" && !url.pathname.startsWith("/api/release-news/")) return false;
  const context = await deps.getContext(clientSessionHeaderFromRequest(req));
  if (req.method === "GET" && url.pathname === "/api/release-news") {
    const acknowledgedNoticeIds = await deps.repository.listAcknowledged(context);
    deps.sendJson(res, 200, { notices: RELEASE_NOTICES, acknowledgedNoticeIds });
    return true;
  }
  const match = /^\/api\/release-news\/([a-z0-9-]+)\/acknowledgement$/.exec(url.pathname);
  if (req.method !== "PUT" || !match) {
    deps.sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }
  const noticeId = match[1];
  if (!findReleaseNotice(noticeId)) {
    deps.sendJson(res, 404, { error: "Release notice not found" });
    return true;
  }
  try {
    const body = await deps.readJsonBody(req);
    if (body && typeof body === "object" && Object.keys(body).length > 0) {
      deps.sendJson(res, 400, { error: "Acknowledgement request body must be empty." });
      return true;
    }
  } catch {
    deps.sendJson(res, 400, { error: "Invalid acknowledgement request." });
    return true;
  }
  const acknowledgement = await deps.repository.acknowledge(context, noticeId, (deps.now ?? (() => new Date()))());
  deps.sendJson(res, 200, { acknowledgement });
  return true;
}
