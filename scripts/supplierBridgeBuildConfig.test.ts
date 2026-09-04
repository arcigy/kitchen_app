import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLIER_BRIDGE_DEVELOP_ORIGIN,
  DEFAULT_SUPPLIER_BRIDGE_PRODUCTION_ORIGIN,
  supplierBridgeReleaseOrigins
} from "./supplierBridgeBuildConfig";

describe("supplier bridge release origins", () => {
  it("allows both maintained Arcigy deployments in the standard production extension", () => {
    expect(supplierBridgeReleaseOrigins({})).toEqual([
      DEFAULT_SUPPLIER_BRIDGE_PRODUCTION_ORIGIN,
      DEFAULT_SUPPLIER_BRIDGE_DEVELOP_ORIGIN
    ]);
  });

  it("uses the public TLS-validated production origin for Bridge login", () => {
    expect(DEFAULT_SUPPLIER_BRIDGE_PRODUCTION_ORIGIN).toBe("https://app.arcigy.cloud");
    expect(DEFAULT_SUPPLIER_BRIDGE_PRODUCTION_ORIGIN).not.toContain("sslip.io");
  });

  it("allows an explicit audited origin list and removes duplicates", () => {
    expect(supplierBridgeReleaseOrigins({
      SUPPLIER_BRIDGE_ARCIGY_ORIGINS: "https://one.example, https://two.example/, https://one.example"
    })).toEqual(["https://one.example", "https://two.example"]);
  });

  it("rejects broad or non-HTTPS origins instead of granting extension access accidentally", () => {
    expect(() => supplierBridgeReleaseOrigins({ SUPPLIER_BRIDGE_ARCIGY_ORIGINS: "http://localhost:5180" })).toThrow(/exact HTTPS origin/i);
    expect(() => supplierBridgeReleaseOrigins({ SUPPLIER_BRIDGE_ARCIGY_ORIGINS: "https://arcigy.example/path" })).toThrow(/without a path/i);
  });
});
