// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAccountMenu } from "./accountMenu";
import { setCurrentLanguage } from "../../i18n";

describe("account menu additions", () => {
  it("exposes localized news and working display settings actions on both account menus", () => {
    setCurrentLanguage("en");
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const args = { users: [], currentUserId: "" };
    createAccountMenu({ ...args, mount: first, showName: true });
    createAccountMenu({ ...args, mount: second, showName: false });

    for (const mount of [first, second]) {
      mount.querySelector<HTMLButtonElement>(".account-menu-trigger")?.click();
      expect([...mount.querySelectorAll("[role=menuitem]")].map((item) => item.textContent)).toContain("What's new?");
      expect([...mount.querySelectorAll("[role=menuitem]")].map((item) => item.textContent)).toContain("Settings");
    }

    const newsSpy = vi.spyOn(document, "dispatchEvent");
    first.querySelector<HTMLButtonElement>("[role=menuitem]")?.click();
    expect(newsSpy).toHaveBeenCalled();
    newsSpy.mockRestore();
  });
});
