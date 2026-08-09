// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { actionIconDetails, actionIconMarkup } from "./actionIcons";
import { bindIconTooltip, installIconTooltips } from "./iconTooltips";

describe("action icon system", () => {
  it("registers one sprite symbol for every semantic action", () => {
    const sprite = readFileSync("public/ui-icons/actions.svg", "utf8");
    for (const iconId of Object.keys(actionIconDetails)) {
      const matches = sprite.match(new RegExp(`<symbol id="${iconId}"`, "g")) ?? [];
      expect(matches).toHaveLength(1);
    }
  });

  it("does not assign identical SVG artwork to two semantic actions", () => {
    const sprite = readFileSync("public/ui-icons/actions.svg", "utf8");
    const artwork = new Map<string, string>();
    for (const iconId of Object.keys(actionIconDetails)) {
      const match = sprite.match(new RegExp(`<symbol id="${iconId}"[^>]*>([\\s\\S]*?)</symbol>`));
      expect(match?.[1]).toBeTruthy();
      const normalized = match![1].replace(/\s+/g, "");
      expect(artwork.has(normalized), `${iconId} duplicates ${artwork.get(normalized)}`).toBe(false);
      artwork.set(normalized, iconId);
    }
  });

  it("renders action icons from the shared SVG asset", () => {
    expect(actionIconMarkup("fitGap")).toContain('/ui-icons/actions.svg#fitGap');
    expect(actionIconMarkup("fitGap")).toContain('data-action-icon="fitGap"');
  });

  it("shows a descriptive tooltip on keyboard focus and closes it with Escape", () => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    installIconTooltips();
    const button = document.createElement("button");
    button.innerHTML = actionIconMarkup("undo");
    bindIconTooltip(button);
    document.body.appendChild(button);

    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.runOnlyPendingTimers();
    const tooltip = document.querySelector<HTMLElement>("#arcigy-icon-tooltip");
    expect(tooltip?.textContent).toContain("Undo");
    expect(tooltip?.textContent).toContain("Restore the most recent project change.");
    expect(tooltip?.textContent).toContain("Ctrl+Z");
    expect(button.getAttribute("aria-describedby")).toBe("arcigy-icon-tooltip");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector("#arcigy-icon-tooltip")).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    vi.useRealTimers();
  });
});
