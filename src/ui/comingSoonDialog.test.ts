// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { COMING_SOON_MESSAGE, showComingSoonDialog } from "./comingSoonDialog";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("coming soon dialog", () => {
  it("shows the requested feature in an accessible modal", () => {
    showComingSoonDialog("Schodisko");

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.querySelector("h2")?.textContent).toBe("Schodisko");
    expect(dialog?.querySelector("p")?.textContent).toBe(COMING_SOON_MESSAGE);
    expect(document.activeElement?.textContent).toBe("Rozumiem");
  });

  it("closes from its action button and restores focus", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    showComingSoonDialog("Cloud");
    document.querySelector<HTMLButtonElement>(".coming-soon-dialog__close")?.click();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps only the latest coming-soon window open", () => {
    showComingSoonDialog("Cloud");
    showComingSoonDialog("Zdieľanie");

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector("h2")?.textContent).toBe("Zdieľanie");
  });
});
