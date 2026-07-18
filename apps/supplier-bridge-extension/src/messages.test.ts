import { describe, expect, it } from "vitest";
import { BRIDGE_CHANNEL, parseArcigyWindowRequest, parseBridgeRuntimeRequest, parseBridgeRuntimeResponse } from "./messages";

describe("supplier bridge message validation", () => {
  it("accepts a complete start request and rejects missing nonce or token", () => {
    const valid = { source: "ARCIGY_WEB", type: "START_SUPPLIER_SESSION", requestId: "request-1", nonce: "nonce-1", sessionId: "session-1", bridgeToken: "one-time-token", projectLabel: "Kuchyňa Novák" };
    expect(parseArcigyWindowRequest(valid)).toEqual(valid);
    expect(parseArcigyWindowRequest({ ...valid, nonce: "" })).toBeNull();
    expect(parseArcigyWindowRequest({ ...valid, bridgeToken: "" })).toBeNull();
  });

  it("accepts a project context only when it identifies the active project", () => {
    const valid = { source: "ARCIGY_WEB", type: "SET_SUPPLIER_PROJECT_CONTEXT", requestId: "request-1", nonce: "nonce-1", sessionId: "arcigy-project-context", projectId: "project-website", projectLabel: "Website" };
    expect(parseArcigyWindowRequest(valid)).toEqual(valid);
    expect(parseArcigyWindowRequest({ ...valid, projectId: "" })).toBeNull();
    expect(parseBridgeRuntimeRequest({ channel: BRIDGE_CHANNEL, ...valid, arcigyOrigin: "https://arcigy-kitchen-develop.178.104.175.242.sslip.io" })).toMatchObject({ type: "SET_SUPPLIER_PROJECT_CONTEXT", projectId: "project-website", projectLabel: "Website" });
  });

  it("rejects unknown runtime commands and validates diagnostic fields", () => {
    expect(parseBridgeRuntimeRequest({ channel: BRIDGE_CHANNEL, type: "SIDE_PANEL_COMMAND", command: "crawl" })).toBeNull();
    expect(parseBridgeRuntimeRequest({ channel: BRIDGE_CHANNEL, type: "START_DIAGNOSTIC_PICK", field: "price", pageType: "product" })).toMatchObject({ field: "price", pageType: "product" });
    expect(parseBridgeRuntimeRequest({ channel: BRIDGE_CHANNEL, type: "START_DIAGNOSTIC_PICK", field: "password", pageType: "product" })).toBeNull();
    expect(parseBridgeRuntimeRequest({ channel: BRIDGE_CHANNEL, type: "SIDE_PANEL_COMMAND", command: "assign_current", syncItemId: "supplier-item-1" })).toMatchObject({ command: "assign_current", syncItemId: "supplier-item-1" });
    expect(parseBridgeRuntimeRequest({ channel: BRIDGE_CHANNEL, type: "CAPTURE_CURRENT_SUPPLIER_PRODUCT", expectedProductType: "board", expectedManufacturer: null, expectedThicknessMm: null })).toMatchObject({ type: "CAPTURE_CURRENT_SUPPLIER_PRODUCT", expectedProductType: "board" });
  });

  it("rejects malformed extension responses instead of trusting runtime objects", () => {
    expect(parseBridgeRuntimeResponse({ ok: true, opened: "yes" })).toBeNull();
    expect(parseBridgeRuntimeResponse({ ok: false, errorCode: "REAL_FIXTURES_REQUIRED", message: "Fixtures are required." })).toEqual({ ok: false, errorCode: "REAL_FIXTURES_REQUIRED", message: "Fixtures are required." });
  });
});
