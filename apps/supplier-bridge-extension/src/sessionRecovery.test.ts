import { describe, expect, it } from "vitest";
import {
  SupplierBridgeSessionRecoveryError,
  SUPPLIER_BRIDGE_SESSION_REATTACH_MESSAGE,
  SUPPLIER_BRIDGE_SESSION_REATTACH_REQUIRED
} from "./sessionRecovery";

describe("supplier bridge session recovery", () => {
  it("uses one stable, actionable recovery code without exposing a token", () => {
    const error = new SupplierBridgeSessionRecoveryError();
    expect(error.code).toBe(SUPPLIER_BRIDGE_SESSION_REATTACH_REQUIRED);
    expect(error.message).toBe(SUPPLIER_BRIDGE_SESSION_REATTACH_MESSAGE);
    expect(error.message).not.toMatch(/token|session id/i);
  });
});
