import { describe, expect, it, vi } from "vitest";
import { createInMemoryUserActivityRepository } from "../core/user-activity/user-activity-repository";
import { startUserActivityReconciliation } from "./userActivityReconciliation";

describe("user activity offline reconciliation lifecycle", () => {
  it("does not schedule work while tracking is disabled", () => {
    const repository = createInMemoryUserActivityRepository();
    const setInterval = vi.fn(() => ({}));
    startUserActivityReconciliation(repository, {}, {
      now: () => new Date(),
      setInterval,
      clearInterval: vi.fn(),
      reportFailure: vi.fn()
    });
    expect(setInterval).not.toHaveBeenCalled();
  });

  it("runs immediately, prevents overlap, and clears its timer", async () => {
    const repository = createInMemoryUserActivityRepository();
    let release!: () => void;
    const reconcileExpired = vi.spyOn(repository, "reconcileExpired")
      .mockImplementation(() => new Promise<number>((resolve) => { release = () => resolve(0); }));
    let callback!: () => void;
    const handle = { unref: vi.fn() };
    const clearInterval = vi.fn();
    const stop = startUserActivityReconciliation(repository, {
      ARCIGY_USER_ACTIVITY_TRACKING_ENABLED: "true",
      ARCIGY_USER_ACTIVITY_TRACKING_CLIENTS: "client-1"
    }, {
      now: () => new Date("2026-09-02T08:00:00Z"),
      setInterval: (scheduled) => { callback = scheduled; return handle; },
      clearInterval,
      reportFailure: vi.fn()
    });
    await Promise.resolve();
    callback();
    await Promise.resolve();
    expect(reconcileExpired).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
    callback();
    await Promise.resolve();
    expect(reconcileExpired).toHaveBeenCalledTimes(2);
    stop();
    expect(handle.unref).toHaveBeenCalledOnce();
    expect(clearInterval).toHaveBeenCalledWith(handle);
  });
});
