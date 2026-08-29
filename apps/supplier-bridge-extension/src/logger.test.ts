import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("__SUPPLIER_BRIDGE_DEBUG__", false);
vi.stubGlobal("__SUPPLIER_BRIDGE_VERSION__", "test");
vi.stubGlobal("__ARCIGY_ORIGINS__", []);
vi.stubGlobal("__SUPPLIER_SIMULATOR_ORIGINS__", []);

const { bridgeLog, formatBridgeLog } = await import("./logger");

describe("Supplier Bridge logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders safe error details as text for chrome://extensions", () => {
    const output = formatBridgeLog("error", "request_failed", {
      type: "START_SUPPLIER_SESSION",
      message: "Request origin is not allowed.",
      bridgeToken: "must-not-leak",
      password: "must-not-leak"
    });

    expect(output).toContain('"event":"request_failed"');
    expect(output).toContain('"message":"Request origin is not allowed."');
    expect(output).not.toContain("must-not-leak");
  });

  it("writes errors as a string instead of an opaque object", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    bridgeLog("error", "request_failed", { code: "SIDE_PANEL_OPEN_FAILED" });

    expect(error).toHaveBeenCalledWith(expect.stringContaining('"code":"SIDE_PANEL_OPEN_FAILED"'));
  });
});
