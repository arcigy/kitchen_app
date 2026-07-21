// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverFromStaleAsset } from "./staleAssetRecovery";

describe("stale asset recovery", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("reloads once when a Vite dynamic import points to a removed deployment asset", () => {
    const reload = vi.fn();
    const first = new Event("vite:preloadError", { cancelable: true });
    Object.assign(first, { payload: new TypeError("Failed to fetch dynamically imported module: /assets/app-old.js") });

    expect(recoverFromStaleAsset(first, { storage: window.sessionStorage, reload })).toBe(true);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    const repeated = new Event("vite:preloadError", { cancelable: true });
    Object.assign(repeated, { payload: new TypeError("Failed to fetch dynamically imported module: /assets/app-old.js") });
    expect(recoverFromStaleAsset(repeated, { storage: window.sessionStorage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("allows recovery for a different stale deployment asset", () => {
    const reload = vi.fn();
    const first = new Event("vite:preloadError", { cancelable: true });
    Object.assign(first, { payload: new Error("/assets/app-first.js") });
    const second = new Event("vite:preloadError", { cancelable: true });
    Object.assign(second, { payload: new Error("/assets/app-second.js") });

    recoverFromStaleAsset(first, { storage: window.sessionStorage, reload });
    expect(recoverFromStaleAsset(second, { storage: window.sessionStorage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
