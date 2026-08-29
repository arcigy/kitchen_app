import { describe, expect, it } from "vitest";
import type http from "node:http";
import { CLIENT_SESSION_COOKIE } from "../core/client/session-cookie";
import { bearerSessionToken, clientSessionHeaderFromRequest } from "./requestAuthentication";

function request(headers: http.IncomingHttpHeaders): http.IncomingMessage {
  return { headers } as http.IncomingMessage;
}

describe("request authentication", () => {
  it("keeps the browser cookie authoritative when both credentials are present", () => {
    expect(clientSessionHeaderFromRequest(request({ cookie: "browser=1", authorization: "Bearer extension-token" }))).toBe("browser=1");
  });

  it("adapts an explicit extension bearer into the existing signed-session validation boundary", () => {
    expect(clientSessionHeaderFromRequest(request({ authorization: "Bearer signed.extension" }))).toBe(`${CLIENT_SESSION_COOKIE}=signed.extension`);
    expect(bearerSessionToken(request({ authorization: "Bearer signed.extension" }))).toBe("signed.extension");
  });

  it("rejects malformed bearer values", () => {
    expect(clientSessionHeaderFromRequest(request({ authorization: "Bearer token with spaces" }))).toBeUndefined();
    expect(bearerSessionToken(request({ authorization: "Basic secret" }))).toBeUndefined();
  });
});
