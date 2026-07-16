import { describe, expect, it, vi } from "vitest";
import {
  createBrowserRuntimeTelemetry,
  type BrowserRuntimeTelemetryDependencies
} from "./browserRuntimeTelemetry";

function createHarness(memoryBytes: number | null = 256 * 1024 * 1024) {
  const listeners = new Map<string, EventListener>();
  let longTaskListener: ((durationMs: number) => void) | null = null;
  let scheduled: (() => void) | null = null;
  const send = vi.fn();
  const disconnect = vi.fn();
  const deps: BrowserRuntimeTelemetryDependencies = {
    send,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    observeLongTasks: (listener) => {
      longTaskListener = listener;
      return disconnect;
    },
    readMemoryBytes: vi.fn(async () => memoryBytes),
    schedule: (callback) => {
      scheduled = callback;
      return 7;
    },
    cancelScheduled: vi.fn()
  };
  return {
    controller: createBrowserRuntimeTelemetry(deps),
    deps,
    send,
    disconnect,
    emitFailure: (type: "js_error" | "unhandled_rejection") => listeners.get(type)?.(new Event(type)),
    emitLongTask: (durationMs: number) => longTaskListener?.(durationMs),
    runScheduled: () => scheduled?.()
  };
}

describe("browser runtime telemetry", () => {
  it("reports only fixed numeric signals and remains idempotent", async () => {
    const harness = createHarness();
    harness.controller.start();
    harness.controller.start();
    harness.emitFailure("js_error");
    harness.emitFailure("unhandled_rejection");
    harness.emitLongTask(125.5);
    harness.runScheduled();
    await vi.waitFor(() => expect(harness.send).toHaveBeenCalledTimes(4));

    expect(harness.send.mock.calls.map(([metric]) => metric)).toEqual([
      { signal: "js_error", value: 1 },
      { signal: "unhandled_rejection", value: 1 },
      { signal: "long_task", value: 125.5 },
      { signal: "memory_used", value: 256 * 1024 * 1024 }
    ]);
  });

  it("bounds per-page volume and clamps numeric measurements", async () => {
    const harness = createHarness(128 * 1024 * 1024 * 1024);
    harness.controller.start();
    for (let index = 0; index < 25; index += 1) harness.emitFailure("js_error");
    for (let index = 0; index < 110; index += 1) harness.emitLongTask(60 * 60 * 1_000);
    for (let index = 0; index < 6; index += 1) await harness.controller.sampleMemory();

    expect(harness.send.mock.calls.filter(([metric]) => metric.signal === "js_error")).toHaveLength(20);
    expect(harness.send.mock.calls.filter(([metric]) => metric.signal === "long_task")).toHaveLength(100);
    expect(harness.send.mock.calls.filter(([metric]) => metric.signal === "memory_used")).toHaveLength(4);
    expect(harness.send).toHaveBeenCalledWith({ signal: "long_task", value: 15 * 60 * 1_000 });
    expect(harness.send).toHaveBeenCalledWith({ signal: "memory_used", value: 64 * 1024 * 1024 * 1024 });
  });

  it("disconnects cleanly and swallows unsupported or failing telemetry", async () => {
    const harness = createHarness(null);
    harness.deps.send = () => { throw new Error("blocked"); };
    const controller = createBrowserRuntimeTelemetry(harness.deps);
    expect(() => controller.start()).not.toThrow();
    await expect(controller.sampleMemory()).resolves.toBeUndefined();
    expect(() => controller.stop()).not.toThrow();
    expect(harness.disconnect).toHaveBeenCalledOnce();
    expect(harness.deps.cancelScheduled).toHaveBeenCalledWith(7);
  });
});
