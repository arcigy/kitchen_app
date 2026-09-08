// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeController, THEME_STORAGE_KEY, type ThemeController } from "./themeController";

let controller: ThemeController | undefined;
afterEach(() => {
  controller?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
function fixture(dark = false) {
  const listeners = new Set<() => void>();
  const media = { matches: dark, addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  vi.stubGlobal("matchMedia", () => media);
  controller = createThemeController(window, document.documentElement);
  return { controller, listeners, system(value: boolean) { media.matches = value; for (const listener of listeners) listener(); } };
}
describe("browser appearance preference", () => {
  it("defaults to the system, follows its changes and honors a manual override until system is selected again", () => {
    const f = fixture(true);
    expect(f.controller.getPreference()).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    f.system(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    f.controller.setPreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    f.system(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    f.controller.setPreference("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("restores the remembered preference and syncs external changes and cleared storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const f = fixture(true);
    expect(f.controller.getResolvedTheme()).toBe("light");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, storageArea: localStorage }));
    expect(f.controller.getResolvedTheme()).toBe("dark");
    localStorage.clear();
    f.system(false);
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(f.controller.getPreference()).toBe("system");
    expect(f.controller.getResolvedTheme()).toBe("light");
  });
  it("ignores unrelated/session storage and invalid values fall back to the system", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "corrupt");
    const f = fixture(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    window.dispatchEvent(new StorageEvent("storage", { key: "project" }));
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, storageArea: sessionStorage }));
    expect(f.controller.getResolvedTheme()).toBe("dark");
  });
  it("works with blocked storage and can unsubscribe without leaving media listeners", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const f = fixture(false);
    const changed = vi.fn();
    const unsubscribe = f.controller.subscribe(changed);
    f.controller.setPreference("dark");
    expect(f.controller.getResolvedTheme()).toBe("dark");
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
    f.controller.setPreference("light");
    expect(changed).toHaveBeenCalledOnce();
    f.controller.dispose();
    expect(f.listeners.size).toBe(0);
  });
  it.each(["light", "dark", "system", "invalid", null])("the before-paint boot and controller agree for %s", (stored) => {
    for (const systemDark of [false, true]) {
      if (stored === null) localStorage.clear(); else localStorage.setItem(THEME_STORAGE_KEY, stored);
      const f = fixture(systemDark);
      const root = { dataset: {}, style: {} };
      runInNewContext(readFileSync(resolve("public/theme-init.js"), "utf8"), {
        document: { documentElement: root }, localStorage, window: { matchMedia: () => ({ matches: systemDark }) }
      });
      expect(root.dataset).toEqual({ theme: f.controller.getResolvedTheme(), themePreference: f.controller.getPreference() });
      f.controller.dispose();
    }
  });
});
