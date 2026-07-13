import { describe, expect, it } from "vitest";
import {
  isSupplierBridgeTokenExpired,
  issueSupplierBridgeToken,
  parseSupplierBridgeToken
} from "./supplier-bridge-token";

describe("supplier bridge token", () => {
  it("keeps tenant, user and session scope signed and enforces expiry", () => {
    const now = new Date("2026-07-10T08:00:00.000Z");
    const issued = issueSupplierBridgeToken({
      tenantId: "tenant-a",
      userId: "user-a",
      sessionId: "session-a",
      kind: "bridge_once",
      now,
      ttlMs: 1_000
    });
    expect(parseSupplierBridgeToken(issued.token)).toMatchObject({
      tenantId: "tenant-a",
      userId: "user-a",
      sessionId: "session-a",
      kind: "bridge_once"
    });
    expect(parseSupplierBridgeToken(`${issued.token}x`)).toBeNull();
    expect(isSupplierBridgeTokenExpired(issued.record, now.getTime() + 999)).toBe(false);
    expect(isSupplierBridgeTokenExpired(issued.record, now.getTime() + 1_000)).toBe(true);
  });
});
