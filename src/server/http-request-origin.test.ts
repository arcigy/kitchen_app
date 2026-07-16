import type http from "node:http";
import { describe, expect, it } from "vitest";
import { CLIENT_SESSION_COOKIE } from "../core/client/session-cookie";
import { shouldRejectRequestOrigin } from "./http-request-origin";

function request(input: {
  method?: string;
  origin?: string;
  host?: string;
  forwardedHost?: string;
  forwardedProto?: string;
  cookie?: string;
  fetchSite?: string;
}): http.IncomingMessage {
  return {
    method: input.method ?? "POST",
    headers: {
      host: input.host ?? "127.0.0.1:5191",
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.forwardedHost ? { "x-forwarded-host": input.forwardedHost } : {}),
      ...(input.forwardedProto ? { "x-forwarded-proto": input.forwardedProto } : {}),
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.fetchSite ? { "sec-fetch-site": input.fetchSite } : {})
    },
    socket: {}
  } as http.IncomingMessage;
}

const sessionCookie = `${CLIENT_SESSION_COOKIE}=signed-session`;

describe("request origin protection", () => {
  it("allows same-origin cookie-authenticated mutations behind the proxy", () => {
    expect(shouldRejectRequestOrigin(request({
      origin: "https://arcigy.example.com",
      forwardedHost: "spoofed.invalid, arcigy.example.com",
      forwardedProto: "http, https",
      cookie: sessionCookie
    }), "/api/projects/project-a/save", {})).toBe(false);
  });

  it("rejects a foreign origin for cookie-authenticated mutations", () => {
    expect(shouldRejectRequestOrigin(request({
      origin: "https://evil.example",
      forwardedHost: "arcigy.example.com",
      forwardedProto: "https",
      cookie: sessionCookie
    }), "/api/projects/project-a/save", {})).toBe(true);
  });

  it("rejects cross-site browser mutations without an Origin header", () => {
    expect(shouldRejectRequestOrigin(request({ cookie: sessionCookie, fetchSite: "cross-site" }), "/api/projects", {})).toBe(true);
  });

  it("protects login but keeps bearer-token integrations compatible", () => {
    const foreign = request({ origin: "chrome-extension://bridge-id" });
    expect(shouldRejectRequestOrigin(foreign, "/api/auth/login", {})).toBe(true);
    expect(shouldRejectRequestOrigin(foreign, "/api/supplier-bridge/sessions/session-a/attach", {})).toBe(false);
  });

  it("allows an explicitly configured trusted frontend origin", () => {
    expect(shouldRejectRequestOrigin(request({
      origin: "https://preview.arcigy.example",
      forwardedHost: "api.arcigy.example",
      forwardedProto: "https",
      cookie: sessionCookie
    }), "/api/projects", { ARCIGY_TRUSTED_ORIGINS: "https://preview.arcigy.example/path" })).toBe(false);
  });

  it("allows the fixed Vite origin only outside production", () => {
    const localProxyRequest = request({
      origin: "http://127.0.0.1:5180",
      host: "127.0.0.1:5191",
      cookie: sessionCookie
    });
    expect(shouldRejectRequestOrigin(localProxyRequest, "/api/projects", {})).toBe(false);
    expect(shouldRejectRequestOrigin(localProxyRequest, "/api/projects", { NODE_ENV: "production" })).toBe(true);
  });

  it("does not apply to safe methods", () => {
    expect(shouldRejectRequestOrigin(request({ method: "GET", origin: "https://evil.example", cookie: sessionCookie }), "/api/projects", {})).toBe(false);
  });
});
