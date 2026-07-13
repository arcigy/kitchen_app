// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import { attachFileMenu } from "./createFileMenu";

afterEach(() => {
  document.body.replaceChildren();
});

describe("File menu website animation export", () => {
  it("offers separate initial and final snapshot actions", async () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const exportWebsiteInitial = vi.fn().mockResolvedValue(undefined);
    const exportWebsiteFinal = vi.fn().mockResolvedValue(undefined);

    attachFileMenu(anchor, {
      save: vi.fn(),
      saveAs: vi.fn(),
      exportLayoutJson: vi.fn(),
      exportSceneJson: vi.fn(),
      exportWebsiteInitial,
      exportWebsiteFinal,
      exportBlenderPreview: vi.fn(),
      exportPng: vi.fn(),
      copyJson: vi.fn()
    });

    anchor.click();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button.app-menu-item"));
    const initial = buttons.find((button) => button.textContent?.includes(t("Export initial / wrong parameters…")));
    const final = buttons.find((button) => button.textContent?.includes(t("Export final / corrected parameters…")));

    expect(initial).toBeDefined();
    expect(final).toBeDefined();

    initial!.click();
    await Promise.resolve();
    expect(exportWebsiteInitial).toHaveBeenCalledTimes(1);

    anchor.click();
    const reopenedFinal = Array.from(document.querySelectorAll<HTMLButtonElement>("button.app-menu-item")).find((button) =>
      button.textContent?.includes(t("Export final / corrected parameters…"))
    );
    reopenedFinal!.click();
    await Promise.resolve();
    expect(exportWebsiteFinal).toHaveBeenCalledTimes(1);
  });
});
