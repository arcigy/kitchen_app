import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentLanguage, hasSystemTranslation, localeForLanguage, normalizeLanguage, setCurrentLanguage, t } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("i18n locale contract", () => {
  it("normalizes legacy Czech and exposes BCP 47 locales", () => {
    expect(normalizeLanguage("cz")).toBe("cs");
    expect(localeForLanguage("cs")).toBe("cs-CZ");
    expect(localeForLanguage("en")).toBe("en-GB");
  });

  it("translates common Czech UI text without changing the source key", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    setCurrentLanguage("cs");
    expect(getCurrentLanguage()).toBe("cs");
    expect(t("Delete")).toBe("Smazat");
  });

  it("restores catalogued Slovak system text to its English source", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    setCurrentLanguage("en");
    expect(t("Súbor")).toBe("File");
  });

  it("keeps the project-manager entry points complete in all three languages", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    setCurrentLanguage("sk");
    expect(t("New project")).toBe("Nový projekt");
    setCurrentLanguage("cs");
    expect(t("New project")).toBe("Nový projekt");
    setCurrentLanguage("en");
    expect(t("New project")).toBe("New project");
  });

  it("requires explicit Slovak and Czech entries for system keys", () => {
    expect(hasSystemTranslation("sk", "New project")).toBe(true);
    expect(hasSystemTranslation("cs", "New project")).toBe(true);
    expect(hasSystemTranslation("cs", "a deliberately unregistered system key")).toBe(false);
  });
});
