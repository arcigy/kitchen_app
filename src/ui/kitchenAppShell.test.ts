// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderKitchenAppShell } from "./kitchenAppShell";

describe("kitchen app bottom bar", () => {
  it("offers every desktop workspace from the compact mobile workspace switcher", () => {
    const root = document.createElement("div");

    renderKitchenAppShell(root);

    expect(Array.from(root.querySelectorAll<HTMLButtonElement>("[data-mobile-workspace]")).map((button) => button.dataset.mobileWorkspace)).toEqual([
      "design",
      "sheets",
      "documents",
      "visualisation",
      "schedules",
      "margins",
      "materials",
      "settings"
    ]);
    expect(root.querySelector<HTMLButtonElement>("[data-mobile-workspace-toggle]")?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector("[data-mobile-project-overview]")).not.toBeNull();
    expect(root.querySelector("[data-mobile-save]")).not.toBeNull();
  });

  it("keeps desktop ribbon controls before hidden mobile controls in document order", () => {
    const root = document.createElement("div");

    renderKitchenAppShell(root);

    const ribbon = root.querySelector("#ribbon");
    const mobileHeader = root.querySelector("[data-mobile-header]");
    if (!ribbon || !mobileHeader) throw new Error("Expected ribbon and mobile header");
    expect(Boolean(ribbon.compareDocumentPosition(mobileHeader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("keeps the view cube orbit without compass letters", () => {
    const root = document.createElement("div");

    renderKitchenAppShell(root);

    expect(root.querySelector(".archux-view-cube-orbit")).not.toBeNull();
    expect(root.querySelectorAll(".archux-view-cube-orbit span")).toHaveLength(0);
    expect(root.querySelector(".orbit-n, .orbit-e, .orbit-s, .orbit-w")).toBeNull();
  });

  it("keeps the normal project overview and reserves a separate Margins footer", () => {
    const root = document.createElement("div");

    renderKitchenAppShell(root);

    expect(root.querySelector("[data-bottom-views]")).not.toBeNull();
    expect(root.querySelector("[data-open-bom-panel]")).not.toBeNull();
    expect(root.querySelector("[data-recalculate-project-price]")).not.toBeNull();
    expect(root.querySelector("[data-project-pricing-summary]")).not.toBeNull();
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
