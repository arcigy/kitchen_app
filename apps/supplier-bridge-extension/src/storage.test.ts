import { describe, expect, it } from "vitest";
import type { SupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import { appendSupplierBridgeTrace, parseSupplierBridgeProgress, parseSupplierBridgeSessionSecrets } from "./storage";

const view: SupplierSyncSessionView = {
  schemaVersion: 1,
  session: { id: "session-1", tenantId: "tenant-1", projectId: "project-1", userId: "user-1", supplierId: "mock-supplier", status: "active", createdAt: "2026-07-10T08:00:00.000Z", updatedAt: "2026-07-10T08:00:00.000Z", expiresAt: "2026-07-10T09:00:00.000Z" },
  items: [], candidates: [], priceObservations: [], currentItem: null,
  counts: { total: 0, processed: 0, pending: 0, needsConfirmation: 0, completed: 0, skipped: 0, failed: 0 }
};

describe("supplier bridge storage serialization", () => {
  it("accepts recoverable progress without secrets", () => {
    expect(parseSupplierBridgeProgress({ version: 1, sessionId: "session-1", arcigyOrigin: "http://127.0.0.1:5180", backendBaseUrl: "http://127.0.0.1:5191", supplierId: "mock-supplier", activeSupplierTabId: 42, view, lastWarning: null, updatedAt: "2026-07-10T08:01:00.000Z" })).toMatchObject({ sessionId: "session-1", activeSupplierTabId: 42 });
  });

  it("keeps a bounded, secret-free trace while accepting prior recoverable progress", () => {
    const progress = parseSupplierBridgeProgress({ version: 1, sessionId: "session-1", arcigyOrigin: "http://127.0.0.1:5180", backendBaseUrl: "http://127.0.0.1:5191", supplierId: "mock-supplier", activeSupplierTabId: 42, view, lastWarning: null, updatedAt: "2026-07-10T08:01:00.000Z" });
    expect(progress?.trace).toEqual([]);
    expect(progress && appendSupplierBridgeTrace(progress, { stage: "Panel opened", outcome: "ok", code: null }).trace).toHaveLength(1);
  });

  it("requires the persisted view and progress to describe the same session", () => {
    expect(parseSupplierBridgeProgress({ version: 1, sessionId: "other-session", arcigyOrigin: "http://127.0.0.1:5180", backendBaseUrl: "http://127.0.0.1:5191", supplierId: "mock-supplier", activeSupplierTabId: 42, view, lastWarning: null, updatedAt: "2026-07-10T08:01:00.000Z" })).toBeNull();
  });

  it("keeps short-lived credentials in the separate session shape", () => {
    expect(parseSupplierBridgeSessionSecrets({ version: 1, sessionId: "session-1", bridgeToken: null, accessToken: "access", accessTokenExpiresAt: "2026-07-10T08:15:00.000Z" })).toMatchObject({ accessToken: "access" });
    expect(parseSupplierBridgeSessionSecrets({ version: 1, sessionId: "session-1", bridgeToken: null, accessToken: 7, accessTokenExpiresAt: null })).toBeNull();
  });
});
