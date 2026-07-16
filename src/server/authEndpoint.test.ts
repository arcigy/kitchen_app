import { describe, expect, it, beforeEach } from "vitest";
import type http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createLoginRateLimiter } from "../core/auth/login-rate-limit";
import { createInMemoryAuthSessionStore } from "../core/auth/auth-session-store";
import { createInMemoryUserRepository, seedAuthUsers } from "../core/auth/user-repository";
import { createUserService } from "../core/auth/user-service";
import { parseClientSessionCookie, requireClientContextFromCookie, serializeClientSessionCookie } from "../core/client/session-cookie";
import { handleAuthLogin, handleAuthLogout, handleAuthSession } from "./authEndpoint";

type MockResponse = http.ServerResponse & {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: unknown;
};

function mockReq(args: { cookie?: string; ip?: string; forwardedFor?: string } = {}): http.IncomingMessage {
  return {
    headers: {
      ...(args.cookie ? { cookie: args.cookie } : {}),
      ...(args.forwardedFor ? { "x-forwarded-for": args.forwardedFor } : {})
    },
    socket: { remoteAddress: args.ip ?? "127.0.0.1" }
  } as http.IncomingMessage;
}

function mockRes(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name: string, value: number | string | readonly string[]) {
      this.headers[name] = Array.isArray(value) ? [...value] : String(value);
      return this;
    }
  } as MockResponse;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const target = res as MockResponse;
  target.statusCode = status;
  target.body = data;
}

function readBody(body: unknown) {
  return async () => body;
}

function createTestUserService(users = seedAuthUsers) {
  return createUserService(createInMemoryUserRepository(users));
}

describe("auth endpoints", () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = "test-auth-secret";
  });

  it("logs in with valid credentials", async () => {
    const req = mockReq();
    const res = mockRes();

    await handleAuthLogin(req, res, readBody({ username: "arcigy", password: "kitchen2026" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    const cookie = String(res.headers["Set-Cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=");
    expect(cookie).toContain("Expires=");
    const session = parseClientSessionCookie(cookie);
    expect(session?.userId).toBe("user_arcigy_owner");
    expect(session?.clientId).toBe("client_arcigy_demo");
    expect(session?.role).toBe("owner");
    expect(session?.issuedAt).toEqual(expect.any(String));
    expect(session?.expiresAt).toEqual(expect.any(String));
    expect(session?.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect((res.body as { session: { sessionId?: string } }).session.sessionId).toBeUndefined();
  });

  it("rejects bad password with safe error", async () => {
    const res = mockRes();
    await handleAuthLogin(mockReq(), res, readBody({ username: "arcigy", password: "bad" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "Invalid credentials." });
  });

  it("rejects unknown user with safe error", async () => {
    const res = mockRes();
    await handleAuthLogin(mockReq(), res, readBody({ username: "missing", password: "kitchen2026" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "Invalid credentials." });
  });

  it("authenticates with case-insensitive username", async () => {
    const res = mockRes();
    await handleAuthLogin(mockReq(), res, readBody({ username: "ARcIgY", password: "kitchen2026" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it("logs in Andrej with organization credentials", async () => {
    const res = mockRes();
    await handleAuthLogin(mockReq(), res, readBody({ username: "andrej", password: "andrej2026" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers["Set-Cookie"]);
    const session = parseClientSessionCookie(cookie);
    expect(session?.userId).toBe("user_andrej");
    expect(session?.displayName).toBe("Andrej");
  });

  it("logs in Branislav with his organization credentials", async () => {
    const res = mockRes();
    await handleAuthLogin(mockReq(), res, readBody({ username: "branislav", password: "branislav2026" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers["Set-Cookie"]);
    const session = parseClientSessionCookie(cookie);
    expect(session?.userId).toBe("user_arcigy_owner");
    expect(session?.displayName).toBe("Branislav");
  });

  it("rejects inactive user with safe error", async () => {
    const inactiveUser = { ...seedAuthUsers[0]!, username: "inactive", isActive: false };
    const res = mockRes();
    await handleAuthLogin(mockReq(), res, readBody({ username: "inactive", password: "kitchen2026" }), sendJson, {
      userService: createTestUserService([inactiveUser]),
      loginRateLimiter: createLoginRateLimiter()
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "Invalid credentials." });
  });

  it("rejects expired session and clears cookie", async () => {
    const expired = {
      version: 1 as const,
      userId: "user_arcigy_owner",
      clientId: "client_arcigy_demo",
      role: "owner" as const,
      displayName: "Arcigy",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z"
    };
    const cookie = serializeClientSessionCookie(expired);
    const res = mockRes();

    await handleAuthSession(mockReq({ cookie }), res, sendJson);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, authenticated: false });
    expect(String(res.headers["Set-Cookie"])).toContain("Max-Age=0");
  });

  it("logout clears session cookie", () => {
    const res = mockRes();
    handleAuthLogout(mockReq(), res, sendJson);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(String(res.headers["Set-Cookie"])).toContain("Max-Age=0");
  });

  it("session is unauthenticated after logout cookie is applied", async () => {
    const logout = mockRes();
    handleAuthLogout(mockReq(), logout, sendJson);

    const session = mockRes();
    await handleAuthSession(mockReq({ cookie: String(logout.headers["Set-Cookie"]) }), session, sendJson);

    expect(session.statusCode).toBe(401);
    expect(session.body).toEqual({ ok: false, authenticated: false });
  });

  it("rejects session forged with a different secret", () => {
    const session = {
      version: 1 as const,
      userId: "user_arcigy_owner",
      clientId: "client_arcigy_demo",
      role: "owner" as const,
      displayName: "Arcigy",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    process.env.AUTH_SESSION_SECRET = "first-secret";
    const cookie = serializeClientSessionCookie(session);
    process.env.AUTH_SESSION_SECRET = "second-secret";

    expect(parseClientSessionCookie(cookie)).toBeNull();
  });

  it("requires AUTH_SESSION_SECRET in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.AUTH_SESSION_SECRET;
    process.env.NODE_ENV = "production";

    try {
      expect(() =>
        serializeClientSessionCookie({
          version: 1,
          userId: "user_arcigy_owner",
          clientId: "client_arcigy_demo",
          role: "owner",
          displayName: "Arcigy",
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        })
      ).toThrow("AUTH_SESSION_SECRET is required in production.");
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      process.env.AUTH_SESSION_SECRET = "test-auth-secret";
    }
  });

  it("sets secure cookie in production login", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const req = mockReq();
      const res = mockRes();
      await handleAuthLogin(req, res, readBody({ username: "arcigy", password: "kitchen2026" }), sendJson, {
        userService: createTestUserService(),
        loginRateLimiter: createLoginRateLimiter()
      });
      const cookie = String(res.headers["Set-Cookie"]);
      expect(cookie).toContain("Secure");
      expect(res.statusCode).toBe(200);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("rate limits repeated failed login attempts", async () => {
    const limiter = createLoginRateLimiter();
    const userService = createTestUserService();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = mockRes();
      await handleAuthLogin(mockReq({ ip: "10.0.0.1" }), res, readBody({ username: "arcigy", password: "bad" }), sendJson, {
        userService,
        loginRateLimiter: limiter
      });
      expect(res.statusCode).toBe(401);
    }

    const limited = mockRes();
    await handleAuthLogin(mockReq({ ip: "10.0.0.1" }), limited, readBody({ username: "arcigy", password: "bad" }), sendJson, {
      userService,
      loginRateLimiter: limiter
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.body).toEqual({ ok: false, error: "Invalid credentials." });
  });

  it("rate limits repeated unknown user login attempts", async () => {
    const limiter = createLoginRateLimiter();
    const userService = createTestUserService();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = mockRes();
      await handleAuthLogin(mockReq({ ip: "10.0.0.2" }), res, readBody({ username: "unknown", password: "kitchen2026" }), sendJson, {
        userService,
        loginRateLimiter: limiter
      });
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ ok: false, error: "Invalid credentials." });
    }

    const limited = mockRes();
    await handleAuthLogin(mockReq({ ip: "10.0.0.2" }), limited, readBody({ username: "unknown", password: "kitchen2026" }), sendJson, {
      userService,
      loginRateLimiter: limiter
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.body).toEqual({ ok: false, error: "Invalid credentials." });
  });

  it("revokes the original cookie on logout for session and protected API checks", async () => {
    const authSessionStore = createInMemoryAuthSessionStore();
    const login = mockRes();
    await handleAuthLogin(mockReq(), login, readBody({ username: "arcigy", password: "kitchen2026" }), sendJson, {
      userService: createTestUserService(),
      loginRateLimiter: createLoginRateLimiter(),
      authSessionStore
    });
    const cookie = String(login.headers["Set-Cookie"]);

    const beforeLogout = mockRes();
    await handleAuthSession(mockReq({ cookie }), beforeLogout, sendJson, {
      userService: createTestUserService(),
      authSessionStore
    });
    expect(beforeLogout.statusCode).toBe(200);
    expect((beforeLogout.body as { session: { sessionId?: string } }).session.sessionId).toBeUndefined();

    const logout = mockRes();
    await handleAuthLogout(mockReq({ cookie }), logout, sendJson, { authSessionStore });
    expect(logout.statusCode).toBe(200);

    const afterLogout = mockRes();
    await handleAuthSession(mockReq({ cookie }), afterLogout, sendJson, {
      userService: createTestUserService(),
      authSessionStore
    });
    expect(afterLogout.statusCode).toBe(401);

    await expect(requireClientContextFromCookie(cookie, {
      sessionLookup: (session) => authSessionStore.isActive(session),
      userLookup: async () => ({ isActive: true, clientId: "client_arcigy_demo", role: "owner" })
    })).rejects.toThrow("Missing authenticated client session.");
  });

  it("uses the trusted proxy-appended address instead of a spoofable first forwarded address", async () => {
    const limiter = createLoginRateLimiter();
    const userService = createTestUserService();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await handleAuthLogin(
        mockReq({ forwardedFor: `198.51.100.${attempt}, 203.0.113.10` }),
        mockRes(),
        readBody({ username: "arcigy", password: "bad" }),
        sendJson,
        { userService, loginRateLimiter: limiter }
      );
    }
    const limited = mockRes();
    await handleAuthLogin(
      mockReq({ forwardedFor: "198.51.100.99, 203.0.113.10" }),
      limited,
      readBody({ username: "arcigy", password: "bad" }),
      sendJson,
      { userService, loginRateLimiter: limiter }
    );
    expect(limited.statusCode).toBe(429);
  });

  it("rejects validly signed session for missing user", async () => {
    const now = new Date().toISOString();
    const missingUserSession = {
      version: 1 as const,
      userId: "missing-user",
      clientId: "client_arcigy_demo",
      role: "owner" as const,
      displayName: "Missing",
      issuedAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    const cookie = serializeClientSessionCookie(missingUserSession);
    const res = mockRes();

    await handleAuthSession(mockReq({ cookie }), res, sendJson, { userService: createTestUserService([]) });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, authenticated: false });
    expect(String(res.headers["Set-Cookie"])).toContain("Max-Age=0");
  });

  it("rejects validly signed session for inactive user", async () => {
    const inactive = { ...seedAuthUsers[0], isActive: false };
    const inactiveSession = {
      version: 1 as const,
      userId: inactive.userId,
      clientId: inactive.clientId,
      role: inactive.role,
      displayName: inactive.displayName,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    const cookie = serializeClientSessionCookie(inactiveSession);
    const res = mockRes();

    await handleAuthSession(mockReq({ cookie }), res, sendJson, { userService: createTestUserService([inactive]) });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, authenticated: false });
    expect(String(res.headers["Set-Cookie"])).toContain("Max-Age=0");
  });

  it("rejects a still-signed session after the live tenant or role changes", async () => {
    const user = seedAuthUsers[0];
    const session = {
      version: 1 as const,
      userId: user.userId,
      clientId: user.clientId,
      role: "owner" as const,
      displayName: user.displayName,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    const cookie = serializeClientSessionCookie(session);
    const changedUser = { ...user, role: "viewer" as const };
    const res = mockRes();

    await handleAuthSession(mockReq({ cookie }), res, sendJson, { userService: createTestUserService([changedUser]) });
    expect(res.statusCode).toBe(401);
    expect(String(res.headers["Set-Cookie"])).toContain("Max-Age=0");
    await expect(requireClientContextFromCookie(cookie, {
      userLookup: async () => ({ isActive: true, clientId: user.clientId, role: "viewer" })
    })).rejects.toThrow("Missing authenticated client session.");
  });

  it("rejects tampered clientId/role payload even with a valid structure", () => {
    const session = parseClientSessionCookie(serializeClientSessionCookie({
      version: 1,
      userId: "user_arcigy_owner",
      clientId: "client_arcigy_demo",
      role: "owner",
      displayName: "Arcigy",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));
    if (!session) throw new Error("Cookie must parse");

    const token = serializeClientSessionCookie(session).replace("arcigy_client_session=", "");
    const [payloadEncoded, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf-8"));
    payload.clientId = "attacker_client";
    payload.role = "admin";
    const tamperedCookie = `arcigy_client_session=${Buffer.from(JSON.stringify(payload), "utf-8")
      .toString("base64url")}.${signature}`;

    expect(parseClientSessionCookie(tamperedCookie)).toBeNull();
  });

  it("does not have localStorage auth fallback", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src", "app", "authController.ts"), "utf-8");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
