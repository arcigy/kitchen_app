import type http from "node:http";
import { createLoginRateLimiter } from "../core/auth/login-rate-limit";
import { createInMemoryAuthSessionStore, type AuthSessionStore } from "../core/auth/auth-session-store";
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
const defaultAuthSessionStore = createInMemoryAuthSessionStore();
const defaultLoginRateLimiter = createLoginRateLimiter();
const INVALID_CREDENTIALS = "Invalid credentials.";

export type AuthEndpointDependencies = {
  userService?: UserService;
  loginRateLimiter?: LoginRateLimiter;
  authSessionStore?: AuthSessionStore;
};

function getStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : null;
}

function getLoginRateLimitKey(req: http.IncomingMessage, username: string): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[forwardedFor.length - 1]
    : forwardedFor?.split(",").at(-1)?.trim() || req.socket.remoteAddress || "unknown";
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
  const authSessionStore = dependencies.authSessionStore ?? defaultAuthSessionStore;
  const body = await readJsonBody(req);
  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  if (!username || !password) return sendJson(res, 400, { ok: false, error: INVALID_CREDENTIALS });

  const rateLimitKey = getLoginRateLimitKey(req, username);
  if (loginRateLimiter.isLimited(rateLimitKey)) {
    return sendJson(res, 429, { ok: false, error: INVALID_CREDENTIALS });
  }

  const authenticatedSession = await userService.authenticate(username, password);
  if (!authenticatedSession) {
    loginRateLimiter.recordFailure(rateLimitKey);
    return sendJson(res, 401, { ok: false, error: INVALID_CREDENTIALS });
  }
  loginRateLimiter.reset(rateLimitKey);
  const session = await authSessionStore.issue(authenticatedSession);

  res.setHeader(
    "Set-Cookie",
    serializeClientSessionCookie(session, {
      secure: shouldUseSecureSessionCookie(req.headers)
    })
  );
  const { sessionId: _sessionId, ...publicSession } = session;
  return sendJson(res, 200, { ok: true, session: publicSession });
}

export async function handleAuthSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sendJson: SendJson,
  dependencies: AuthEndpointDependencies = {}
): Promise<void> {
  const userService = dependencies.userService ?? defaultUserService;
  const authSessionStore = dependencies.authSessionStore ?? defaultAuthSessionStore;
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

  if (!(await authSessionStore.isActive(result.session))) {
    res.setHeader(
      "Set-Cookie",
      clearClientSessionCookieValue({
        secure: shouldUseSecureSessionCookie(req.headers)
      })
    );
    return sendJson(res, 401, { ok: false, authenticated: false });
  }

  const user = await userService.getUserById(result.session.userId);
  if (
    !user ||
    !user.isActive ||
    user.clientId !== result.session.clientId ||
    user.role !== result.session.role
  ) {
    res.setHeader(
      "Set-Cookie",
      clearClientSessionCookieValue({
        secure: shouldUseSecureSessionCookie(req.headers)
      })
    );
    return sendJson(res, 401, { ok: false, authenticated: false });
  }

  const { sessionId: _sessionId, ...publicSession } = result.session;
  return sendJson(res, 200, { ok: true, authenticated: true, session: publicSession });
}

export async function handleAuthLogout(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sendJson: SendJson,
  dependencies: AuthEndpointDependencies = {}
): Promise<void> {
  const result = parseClientSessionCookieDetailed(req.headers.cookie);
  if (result.ok) {
    await (dependencies.authSessionStore ?? defaultAuthSessionStore).revoke(result.session);
  }
  res.setHeader(
    "Set-Cookie",
    clearClientSessionCookieValue({
      secure: shouldUseSecureSessionCookie(req.headers)
    })
  );
  return sendJson(res, 200, { ok: true });
}
