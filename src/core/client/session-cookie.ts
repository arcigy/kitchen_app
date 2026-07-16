import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { AuthenticatedClientSession } from "./client-types";
import { createClientContext, type ClientContext } from "./client-context";

export const CLIENT_SESSION_COOKIE = "arcigy_client_session";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEV_SESSION_SECRET = "arcigy-dev-session-secret-change-me";

export type SessionCookieParseResult =
  | { ok: true; session: AuthenticatedClientSession }
  | { ok: false; reason: "missing" | "invalid" | "expired" };

export type UserLookup = (userId: string) => Promise<{
  isActive: boolean;
  clientId?: string;
  role?: AuthenticatedClientSession["role"];
} | null>;

export type RequireClientContextOptions = {
  userLookup?: UserLookup;
  sessionLookup?: (session: AuthenticatedClientSession) => Promise<boolean>;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET is required in production.");
  }
  return DEV_SESSION_SECRET;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isSignedSession(value: unknown): value is AuthenticatedClientSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.userId === "string" &&
    typeof candidate.clientId === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.issuedAt === "string" &&
    typeof candidate.expiresAt === "string" &&
    (candidate.sessionId === undefined ||
      (typeof candidate.sessionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.sessionId))) &&
    Number.isFinite(Date.parse(candidate.issuedAt)) &&
    Number.isFinite(Date.parse(candidate.expiresAt))
  );
}

export function serializeClientSessionCookie(
  session: AuthenticatedClientSession,
  options: { secure?: boolean; maxAgeSeconds?: number } = {}
): string {
  const computedMaxAge = Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000);
  const maxAgeSeconds =
    options.maxAgeSeconds ?? (Number.isFinite(computedMaxAge) ? Math.max(0, computedMaxAge) : SESSION_MAX_AGE_SECONDS);
  const encodedPayload = base64UrlEncode(JSON.stringify(session));
  const encodedSignature = sign(encodedPayload);
  return [
    `${CLIENT_SESSION_COOKIE}=${encodedPayload}.${encodedSignature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    options.secure ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${new Date(session.expiresAt).toUTCString()}`
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearClientSessionCookieValue(options: { secure?: boolean } = {}): string {
  return [
    `${CLIENT_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    options.secure ? "Secure" : "",
    "Max-Age=0"
  ]
    .filter(Boolean)
    .join("; ");
}

export function parseClientSessionCookieDetailed(cookieHeader: string | string[] | undefined, now = Date.now()): SessionCookieParseResult {
  const rawHeader = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!rawHeader) return { ok: false, reason: "missing" };

  const cookie = rawHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLIENT_SESSION_COOKIE}=`));
  if (!cookie) return { ok: false, reason: "missing" };

  const rawValue = cookie.slice(CLIENT_SESSION_COOKIE.length + 1);
  const [encodedPayload, encodedSignature, ...rest] = rawValue.split(".");
  if (!encodedPayload || !encodedSignature || rest.length > 0) return { ok: false, reason: "invalid" };
  if (!safeEqual(sign(encodedPayload), encodedSignature)) return { ok: false, reason: "invalid" };

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    if (!isSignedSession(parsed)) return { ok: false, reason: "invalid" };
    if (Date.parse(parsed.expiresAt) <= now) return { ok: false, reason: "expired" };
    return { ok: true, session: parsed };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function parseClientSessionCookie(cookieHeader: string | string[] | undefined): AuthenticatedClientSession | null {
  const result = parseClientSessionCookieDetailed(cookieHeader);
  return result.ok ? result.session : null;
}

export async function requireClientContextFromCookie(
  cookieHeader: string | string[] | undefined,
  options: RequireClientContextOptions = {}
): Promise<ClientContext> {
  const session = parseClientSessionCookie(cookieHeader);
  if (!session) throw new Error("Missing authenticated client session.");

  if (options.sessionLookup && !(await options.sessionLookup(session))) {
    throw new Error("Missing authenticated client session.");
  }

  if (options.userLookup) {
    const user = await options.userLookup(session.userId);
    if (
      !user ||
      !user.isActive ||
      (user.clientId !== undefined && user.clientId !== session.clientId) ||
      (user.role !== undefined && user.role !== session.role)
    ) {
      throw new Error("Missing authenticated client session.");
    }
  }

  return createClientContext(session);
}

export function shouldUseSecureSessionCookie(headers: Record<string, string | string[] | undefined>): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const proto = headers["x-forwarded-proto"];
  return Array.isArray(proto) ? proto.includes("https") : proto === "https";
}
