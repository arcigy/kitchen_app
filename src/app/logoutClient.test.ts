import { beforeEach, describe, expect, it, vi } from "vitest";
import { logoutClient } from "./logoutClient";

describe("logoutClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("indexedDB", undefined);
  });

  it("clears tenant app-data caches after the server invalidates the session", async () => {
    const sessionData = new Map<string, string>([["arcigy.kitchen.clientAppData.v1", "cached"]]);
    const removeLocal = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => sessionData.get(key) ?? null,
        setItem: (key: string, value: string) => sessionData.set(key, value),
        removeItem: (key: string) => sessionData.delete(key)
      },
      localStorage: { removeItem: removeLocal },
      location: { assign }
    });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await logoutClient();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST", credentials: "include" });
    expect(sessionData.has("arcigy.kitchen.clientAppData.v1")).toBe(false);
    expect(removeLocal).toHaveBeenCalledWith("arcigy.kitchen.autostartWorkspace");
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("clears browser recovery even when the logout request is offline", async () => {
    const removeLocal = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
      localStorage: { getItem: () => null, setItem: vi.fn(), removeItem: removeLocal },
      location: { assign }
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));

    await expect(logoutClient()).rejects.toThrow("offline");

    expect(removeLocal).toHaveBeenCalledWith("arcigy.kitchen.lastWorkspace.v1");
    expect(assign).toHaveBeenCalledWith("/");
  });
});
