import type http from "node:http";
import { CLIENT_SESSION_COOKIE } from "../core/client/session-cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function lastForwardedValue(value: string | string[] | undefined): string | null {
  const joined = Array.isArray(value) ? value.join(",") : value;
  return joined?.split(",").map((part) => part.trim()).filter(Boolean).at(-1) ?? null;
}

function requestOrigin(req: http.IncomingMessage): string | null {
  const protocol = lastForwardedValue(req.headers["x-forwarded-proto"])
    ?? ((req.socket as http.IncomingMessage["socket"] & { encrypted?: boolean }).encrypted ? "https" : "http");
  const host = lastForwardedValue(req.headers["x-forwarded-host"])
    ?? lastForwardedValue(req.headers.host);
  if (!host || (protocol !== "http" && protocol !== "https")) return null;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function configuredOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const origins = new Set<string>();
  if (env.NODE_ENV !== "production") {
    // `dev:local` supports an isolated Vite port so concurrent worktrees do
    // not share a browser session. Keep the explicit local-only allowlist in
    // sync with that port without widening production origin policy.
    const vitePort = env.KITCHEN_UI_PORT || "5180";
    origins.add(`http://127.0.0.1:${vitePort}`);
    origins.add(`http://localhost:${vitePort}`);
  }
  for (const value of (env.ARCIGY_TRUSTED_ORIGINS ?? "").split(",")) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed optional entries instead of weakening origin checks.
    }
  }
  return origins;
}

function hasClientSessionCookie(req: http.IncomingMessage): boolean {
  const cookie = Array.isArray(req.headers.cookie) ? req.headers.cookie.join("; ") : req.headers.cookie;
  return cookie?.split(";").some((part) => part.trim().startsWith(`${CLIENT_SESSION_COOKIE}=`)) ?? false;
}

export function shouldRejectRequestOrigin(
  req: http.IncomingMessage,
  pathname: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const method = (req.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return false;

  // Token-authenticated integrations such as Supplier Bridge do not use the
  // browser session cookie. Login is protected separately against login CSRF.
  if (!hasClientSessionCookie(req) && pathname !== "/api/auth/login") return false;

  const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  if (!originHeader || originHeader === "null") {
    return lastForwardedValue(req.headers["sec-fetch-site"]) === "cross-site";
  }

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    return true;
  }

  if (origin === requestOrigin(req)) return false;
  return !configuredOrigins(env).has(origin);
}
