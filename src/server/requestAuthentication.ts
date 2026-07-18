import type http from "node:http";
import { CLIENT_SESSION_COOKIE } from "../core/client/session-cookie";

export function clientSessionHeaderFromRequest(req: http.IncomingMessage): string | string[] | undefined {
  if (req.headers.cookie) return req.headers.cookie;
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match ? `${CLIENT_SESSION_COOKIE}=${match[1]}` : undefined;
}

export function bearerSessionToken(req: http.IncomingMessage): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  return /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1];
}
