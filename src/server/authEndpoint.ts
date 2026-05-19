import type http from "node:http";
import { createLoginRateLimiter } from "../core/auth/login-rate-limit";
import { createInMemoryUserRepository } from "../core/auth/user-repository";
import { createUserService, type UserService } from "../core/auth/user-service";
import {
  clearClientSessionCookieValue,
  parseClientSessionCookieDetailed,
  serializeClientSessionCookie,
  shouldUseSecureSessionCookie
} from "../core/client/session-cookie";

type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>;

const defaultUserService = createUserService(createInMemoryUserRepository());
const defaultLoginRateLimiter = createLoginRateLimiter();
const INVALID_CREDENTIALS = "Invalid credentials.";

export type AuthEndpointDependencies = {
  userService?: UserService;
  loginRateLimiter?: LoginRateLimiter;
};

function getStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : null;
}

function getLoginRateLimitKey(req: http.IncomingMessage, username: string): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  return `${ip}:${username.trim().toLowerCase()}`;
}

export async function handleAuthLogin(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  readJsonBody: ReadJsonBody,
  sendJson: SendJson,
  dependencies: AuthEndpointDependencies = {}
): Promise<void> {
  const userService = dependencies.userService ?? defaultUserService;
  const loginRateLimiter = dependencies.loginRateLimiter ?? defaultLoginRateLimiter;
  const body = await readJsonBody(req);
  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  if (!username || !password) return sendJson(res, 400, { ok: false, error: INVALID_CREDENTIALS });

  const rateLimitKey = getLoginRateLimitKey(req, username);
  if (loginRateLimiter.isLimited(rateLimitKey)) {
    return sendJson(res, 429, { ok: false, error: INVALID_CREDENTIALS });
  }

  const session = await userService.authenticate(username, password);
  if (!session) {
    loginRateLimiter.recordFailure(rateLimitKey);
    return sendJson(res, 401, { ok: false, error: INVALID_CREDENTIALS });
  }
  loginRateLimiter.reset(rateLimitKey);

  res.setHeader(
    "Set-Cookie",
    serializeClientSessionCookie(session, {
      secure: shouldUseSecureSessionCookie(req.headers)
    })
  );
  return sendJson(res, 200, { ok: true, session });
}

export async function handleAuthSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sendJson: SendJson,
  dependencies: AuthEndpointDependencies = {}
): Promise<void> {
  const userService = dependencies.userService ?? defaultUserService;
  const result = parseClientSessionCookieDetailed(req.headers.cookie);
  if (!result.ok) {
    if (result.reason === "expired") {
      res.setHeader(
        "Set-Cookie",
        clearClientSessionCookieValue({
          secure: shouldUseSecureSessionCookie(req.headers)
        })
      );
    }
    return sendJson(res, 401, { ok: false, authenticated: false });
  }

  const user = await userService.getUserById(result.session.userId);
  if (!user || !user.isActive) {
    res.setHeader(
      "Set-Cookie",
      clearClientSessionCookieValue({
        secure: shouldUseSecureSessionCookie(req.headers)
      })
    );
    return sendJson(res, 401, { ok: false, authenticated: false });
  }

  return sendJson(res, 200, { ok: true, authenticated: true, session: result.session });
}

export function handleAuthLogout(req: http.IncomingMessage, res: http.ServerResponse, sendJson: SendJson): void {
  res.setHeader(
    "Set-Cookie",
    clearClientSessionCookieValue({
      secure: shouldUseSecureSessionCookie(req.headers)
    })
  );
  return sendJson(res, 200, { ok: true });
}
