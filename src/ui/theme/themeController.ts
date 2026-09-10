export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export const THEME_STORAGE_KEY = "arcigy.ui.theme";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function createThemeController(host: Window, root: HTMLElement) {
  const media = host.matchMedia?.("(prefers-color-scheme: dark)");
  const listeners = new Set<() => void>();
  const read = (): ThemePreference => {
    try { return parseThemePreference(host.localStorage.getItem(THEME_STORAGE_KEY)); }
    catch { return "system"; }
  };
  let preference = read();
  let resolved: ResolvedTheme = "light";
  const apply = () => {
    resolved = preference === "system" ? (media?.matches ? "dark" : "light") : preference;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    // Loaded CSS owns color-scheme, including the print override. The boot
    // script's inline hint is needed only before these styles are available.
    root.style.removeProperty("color-scheme");
    root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#101722" : "#f4f7fc");
    for (const listener of listeners) listener();
  };
  const onSystemChange = () => { if (preference === "system") apply(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    // A sessionStorage event must never change the appearance preference.
    try { if (event.storageArea && event.storageArea !== host.localStorage) return; } catch { return; }
    preference = read();
    apply();
  };
  media?.addEventListener("change", onSystemChange);
  host.addEventListener("storage", onStorage);
  apply();
  return {
    getPreference: () => preference,
    getResolvedTheme: () => resolved,
    setPreference(next: ThemePreference) {
      preference = parseThemePreference(next);
      try { host.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Available for this session even when storage is blocked. */ }
      apply();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      media?.removeEventListener("change", onSystemChange);
      host.removeEventListener("storage", onStorage);
      listeners.clear();
    }
  };
}

export type ThemeController = ReturnType<typeof createThemeController>;
let controller: ThemeController | undefined;
export function getThemeController(): ThemeController {
  return controller ??= createThemeController(window, document.documentElement);
}

export function getResolvedTheme(): ResolvedTheme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
