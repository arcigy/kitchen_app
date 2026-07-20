// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderKitchenAppShell } from "./kitchenAppShell";

describe("kitchen app bottom bar", () => {
  it("keeps the normal project overview and reserves a separate Margins footer", () => {
    const root = document.createElement("div");

    renderKitchenAppShell(root);

    expect(root.querySelector("[data-bottom-views]")).not.toBeNull();
    expect(root.querySelector("[data-open-bom-panel]")).not.toBeNull();
    expect(root.querySelector(".archux-sheet")).not.toBeNull();
    expect(root.querySelector("[data-recent-activity]")).not.toBeNull();
    expect(root.querySelectorAll("[data-bottom-default]")).toHaveLength(4);
    expect(root.querySelector<HTMLElement>("[data-margin-footer]")?.hidden).toBe(true);
  });

  it("uses the four-column overview normally and the two-column replacement only in Margins", () => {
    const css = readFileSync("src/style.css", "utf8");

    expect(css).toContain("grid-template-columns: minmax(310px, 1.2fr) minmax(250px, 1fr) 260px 210px;");
    expect(css).toContain(".archux-margins-phase .archux-bottom > [data-bottom-default]");
    expect(css).toContain(".archux-margins-phase .archux-margin-footer");
    expect(css).toContain(".archux-margins-phase .archux-activity");
  });
});
