import { describe, expect, it } from "vitest";
import { demosDiagnosticAdapter } from "./demosDiagnosticAdapter";
import { adapterSupports } from "./types";

describe("supplier adapter capabilities", () => {
  it("does not pretend the Demos diagnostic adapter can capture or automate", async () => {
    expect(demosDiagnosticAdapter.productionReady).toBe(false);
    expect(adapterSupports(demosDiagnosticAdapter, "capture_current_product")).toBe(false);
    expect(adapterSupports(demosDiagnosticAdapter, "automated_search")).toBe(false);
    await expect(demosDiagnosticAdapter.extractCurrentPage({} as Document, new URL("https://invalid.example"))).resolves.toMatchObject({ errorCode: "REAL_FIXTURES_REQUIRED", candidates: [] });
  });
});
