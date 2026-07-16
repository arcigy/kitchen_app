import { randomUUID } from "node:crypto";
import type http from "node:http";

const DEFAULT_SLOW_REQUEST_MS = 2_000;

type ObservabilityOptions = {
  now?: () => number;
  requestId?: string;
  logSlow?: (message: string) => void;
};

function slowRequestThresholdMs(): number {
  const configured = Number(process.env.HTTP_SLOW_REQUEST_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SLOW_REQUEST_MS;
}

export function registerRequestObservability(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: ObservabilityOptions = {}
): string {
  const requestId = options.requestId ?? randomUUID();
  const now = options.now ?? Date.now;
  const startedAt = now();
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () => {
    const durationMs = Math.max(0, now() - startedAt);
    if (durationMs < slowRequestThresholdMs()) return;
    (options.logSlow ?? console.warn)(JSON.stringify({
      event: "slow_http_request",
      requestId,
      method: req.method ?? "UNKNOWN",
      path: String(req.url ?? "/").split("?", 1)[0],
      status: res.statusCode,
      durationMs
    }));
  });
  return requestId;
}
