import { EventEmitter } from "node:events";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { registerRequestObservability } from "./http-request-observability";

describe("HTTP request observability", () => {
  it("adds a request id and logs sanitized metadata for slow requests", () => {
    const headers = new Map<string, string>();
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value)
    }) as unknown as http.ServerResponse;
    const logSlow = vi.fn();
    const times = [1_000, 3_500];

    const requestId = registerRequestObservability(
      { method: "GET", url: "/api/catalog?secret=hidden" } as http.IncomingMessage,
      response,
      { requestId: "request-1", now: () => times.shift() ?? 3_500, logSlow }
    );
    response.emit("finish");

    expect(requestId).toBe("request-1");
    expect(headers.get("x-request-id")).toBe("request-1");
    expect(JSON.parse(logSlow.mock.calls[0][0])).toEqual({
      event: "slow_http_request",
      requestId: "request-1",
      method: "GET",
      path: "/api/catalog",
      status: 200,
      durationMs: 2_500
    });
  });
});
