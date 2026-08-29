import type http from "node:http";
import { describe, expect, it } from "vitest";
import { encodeResponseBody, registerResponseCompression } from "./http-response-compression";

function createResponseHarness() {
  const headers = new Map<string, string | number | readonly string[]>();
  return {
    response: {
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      setHeader: (name: string, value: string | number | readonly string[]) => {
        headers.set(name.toLowerCase(), value);
      }
    } as unknown as http.ServerResponse,
    headers
  };
}

describe("HTTP response compression", () => {
  it("compresses large responses when the client accepts gzip", () => {
    const { response, headers } = createResponseHarness();
    registerResponseCompression({ headers: { "accept-encoding": "br, gzip" } } as http.IncomingMessage, response);

    const encoded = encodeResponseBody(response, "catalog-data-".repeat(10_000));

    expect(headers.get("content-encoding")).toBe("gzip");
    expect(headers.get("vary")).toContain("Accept-Encoding");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    const csp = String(headers.get("content-security-policy"));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(encoded.byteLength).toBeLessThan(2_000);
  });

  it("keeps the original body when gzip is explicitly disabled by the client", () => {
    const { response, headers } = createResponseHarness();
    registerResponseCompression({ headers: { "accept-encoding": "*;q=1, gzip;q=0, br" } } as http.IncomingMessage, response);
    const body = "catalog-data-".repeat(1_000);

    const encoded = encodeResponseBody(response, body);

    expect(headers.has("content-encoding")).toBe(false);
    expect(encoded.toString("utf-8")).toBe(body);
  });
});
