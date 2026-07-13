import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { SupplierBridgeTokenKind, SupplierBridgeTokenRecord } from "./supplier-bridge-types";

export const SUPPLIER_BRIDGE_TOKEN_TTL_MS = 10 * 60_000;
export const SUPPLIER_ACCESS_TOKEN_TTL_MS = 15 * 60_000;

export type SupplierBridgeTokenPayload = {
  version: 1;
  tokenId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  kind: SupplierBridgeTokenKind;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

function tokenSecret(): string {
  const secret = process.env.SUPPLIER_BRIDGE_TOKEN_SECRET ?? process.env.AUTH_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("SUPPLIER_BRIDGE_TOKEN_SECRET is required in production.");
  return "arcigy-dev-supplier-bridge-secret-change-me";
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", tokenSecret()).update(encodedPayload).digest("base64url");
}

export function hashSupplierBridgeToken(token: string): string {
  return createHash("sha256").update(token, "utf-8").digest("base64url");
}

export function supplierBridgeTokenHashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function issueSupplierBridgeToken(args: {
  tenantId: string;
  userId: string;
  sessionId: string;
  kind: SupplierBridgeTokenKind;
  now?: Date;
  ttlMs?: number;
}): { token: string; record: SupplierBridgeTokenRecord } {
  const now = args.now ?? new Date();
  const tokenId = `supplier-token-${randomBytes(12).toString("hex")}`;
  const ttlMs = Math.max(1_000, args.ttlMs ?? (
    args.kind === "bridge_once" ? SUPPLIER_BRIDGE_TOKEN_TTL_MS : SUPPLIER_ACCESS_TOKEN_TTL_MS
  ));
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const payload: SupplierBridgeTokenPayload = {
    version: 1,
    tokenId,
    tenantId: args.tenantId,
    userId: args.userId,
    sessionId: args.sessionId,
    kind: args.kind,
    issuedAt: now.toISOString(),
    expiresAt,
    nonce: randomBytes(18).toString("base64url")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const token = `${encodedPayload}.${sign(encodedPayload)}`;
  return {
    token,
    record: {
      id: tokenId,
      tenantId: args.tenantId,
      userId: args.userId,
      sessionId: args.sessionId,
      kind: args.kind,
      tokenHash: hashSupplierBridgeToken(token),
      createdAt: now.toISOString(),
      expiresAt,
      usedAt: null
    }
  };
}

export function parseSupplierBridgeToken(token: string): SupplierBridgeTokenPayload | null {
  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0 || !supplierBridgeTokenHashesEqual(sign(encodedPayload), signature)) return null;
  try {
    const value = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    if (
      payload.version !== 1 ||
      typeof payload.tokenId !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.sessionId !== "string" ||
      (payload.kind !== "bridge_once" && payload.kind !== "session_access") ||
      typeof payload.issuedAt !== "string" ||
      typeof payload.expiresAt !== "string" ||
      typeof payload.nonce !== "string" ||
      !Number.isFinite(Date.parse(payload.issuedAt)) ||
      !Number.isFinite(Date.parse(payload.expiresAt))
    ) return null;
    return payload as SupplierBridgeTokenPayload;
  } catch {
    return null;
  }
}

export function isSupplierBridgeTokenExpired(record: SupplierBridgeTokenRecord, now = Date.now()): boolean {
  return !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now;
}
