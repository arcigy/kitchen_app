import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { runAssistantTurn } from "../assistant/agent";
import { reindexAssistantRag, searchAssistantRag } from "../assistant/rag";
import type { AssistantTurnRequest } from "../assistant/types";

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
    clientContext: record.clientContext as AssistantTurnRequest["clientContext"],
    conversation: Array.isArray(record.conversation) ? record.conversation as AssistantTurnRequest["conversation"] : [],
    toolResults: Array.isArray(record.toolResults) ? record.toolResults as AssistantTurnRequest["toolResults"] : []
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
    const response = await runAssistantTurn({ ...request, ragChunks, catalog });
    deps.sendJson(res, 200, response);
    return true;
  }

  deps.sendJson(res, 405, { ok: false, error: "Method not allowed." });
  return true;
}
