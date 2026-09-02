import { describe, expect, it, vi } from "vitest";
import type { UserActivityPulse } from "../core/user-activity/user-activity-types";
import { createUserActivityTracker, type UserActivityTrackerDependencies } from "./userActivityTracker";

function fixture(enabled = true) {
  let nowMs = Date.parse("2026-09-02T08:00:00Z");
  let visible = true;
  let focused = true;
  let intervalCallback: (() => void) | null = null;
  const listeners = new Map<string, () => void>();
  const sent: Array<{ pulse: UserActivityPulse; mode: string }> = [];
  const removedIndicator = vi.fn();
  const deps: UserActivityTrackerDependencies = {
    loadConfig: async () => ({
      enabled,
      heartbeatIntervalMs: 30_000,
      idleThresholdMs: 300_000,
      disclosure: "Activity disclosure"
    }),
    sendPulse: async (pulse, mode) => { sent.push({ pulse: { ...pulse }, mode }); },
    now: () => new Date(nowMs),
    createTrackerId: () => "11111111-1111-4111-8111-111111111111",
    isVisible: () => visible,
    isFocused: () => focused,
    localDate: () => "2026-09-02",
    timeZone: () => "Europe/Bratislava",
    addListener: (name, listener) => { listeners.set(name, listener); },
    removeListener: (name) => { listeners.delete(name); },
    setInterval: (callback) => { intervalCallback = callback; return 7; },
    clearInterval: () => { intervalCallback = null; },
    mountIndicator: () => ({ setState: vi.fn(), remove: removedIndicator })
  };
  return {
    deps,
    sent,
    listeners,
    removedIndicator,
    advance: (milliseconds: number) => { nowMs += milliseconds; },
    setVisible: (value: boolean) => { visible = value; },
    setFocused: (value: boolean) => { focused = value; },
    heartbeat: () => intervalCallback?.()
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("user activity tracker", () => {
  it("does nothing when tenant tracking is disabled", async () => {
    const test = fixture(false);
    await createUserActivityTracker(test.deps).start();
    expect(test.sent).toEqual([]);
    expect(test.listeners.size).toBe(0);
  });

  it("does not start listeners when logout stops it during config loading", async () => {
    const test = fixture();
    let resolveConfig!: (value: Awaited<ReturnType<UserActivityTrackerDependencies["loadConfig"]>>) => void;
    test.deps.loadConfig = () => new Promise((resolve) => { resolveConfig = resolve; });
    const tracker = createUserActivityTracker(test.deps);
    const starting = tracker.start();
    await tracker.stop();
    resolveConfig({ enabled: true, heartbeatIntervalMs: 30_000, idleThresholdMs: 300_000, disclosure: "test" });
    await starting;

    expect(test.sent).toEqual([]);
    expect(test.listeners.size).toBe(0);
  });

  it("emits minimal active, idle, and resumed pulses without input contents", async () => {
    const test = fixture();
    const tracker = createUserActivityTracker(test.deps);
    await tracker.start();
    test.advance(300_001);
    test.heartbeat();
    await flushPromises();
    test.listeners.get("activity")?.();
    await flushPromises();

    expect(test.sent.map(({ pulse }) => pulse.state)).toEqual(["active", "idle", "active"]);
    expect(Object.keys(test.sent[0]!.pulse).sort()).toEqual([
      "localDate", "sequence", "state", "timeZone", "trackerId"
    ]);
  });

  it("flushes hidden state on page exit and before logout stop", async () => {
    const test = fixture();
    const tracker = createUserActivityTracker(test.deps);
    await tracker.start();
    test.setVisible(false);
    test.setFocused(false);
    test.listeners.get("pagehide")?.();
    await flushPromises();
    await tracker.stop();

    expect(test.sent.at(-2)).toEqual(expect.objectContaining({ mode: "beacon", pulse: expect.objectContaining({ state: "hidden" }) }));
    expect(test.sent.at(-1)).toEqual(expect.objectContaining({ mode: "fetch", pulse: expect.objectContaining({ state: "hidden" }) }));
    expect(test.listeners.size).toBe(0);
    expect(test.removedIndicator).toHaveBeenCalledOnce();
  });
});
