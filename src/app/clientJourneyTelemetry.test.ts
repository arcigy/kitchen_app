import { afterEach, describe, expect, it, vi } from "vitest";
import { reportBrowserJourney, reportBrowserRuntime } from "./clientJourneyTelemetry";

describe("browser journey telemetry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only the fixed metric schema and clamps duration", async () => {
    const sendBeacon = vi.fn((_url: string, _body: Blob) => true);
    vi.stubGlobal("window", { navigator: { sendBeacon } });

    reportBrowserJourney({
      journey: "project_open",
      variant: "loaded",
      outcome: "success",
      durationMs: 60 * 60 * 1_000
    });

    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(sendBeacon.mock.calls[0]?.[0]).toBe("/api/client-metrics");
    const body = sendBeacon.mock.calls[0]?.[1] as Blob;
    expect(body.type).toBe("application/json");
    expect(JSON.parse(await body.text())).toEqual({
      journey: "project_open",
      variant: "loaded",
      outcome: "success",
      durationMs: 15 * 60 * 1_000
    });
  });

  it("does not affect the product journey when beacon support fails", () => {
    vi.stubGlobal("window", { navigator: { sendBeacon: () => { throw new Error("blocked"); } } });
    expect(() => reportBrowserJourney({
      journey: "app_data_load",
      variant: "network",
      outcome: "failure",
      durationMs: 50
    })).not.toThrow();
  });

  it("sends runtime telemetry with only the fixed allowlisted schema", async () => {
    const sendBeacon = vi.fn((_url: string, _body: Blob) => true);
    vi.stubGlobal("window", { navigator: { sendBeacon } });

    reportBrowserRuntime({ signal: "js_error", value: 99, kind: "image", privateUrl: "/private" } as never);

    const body = sendBeacon.mock.calls[0]?.[1] as Blob;
    expect(JSON.parse(await body.text())).toEqual({ signal: "js_error", value: 1, kind: "image" });
  });
});
