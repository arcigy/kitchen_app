// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { renderKitchenAppShell } from "./kitchenAppShell";

describe("kitchen app bottom bar", () => {
  it("reserves the bottom bar for project margins and recent activity", () => {
    const root = document.createElement("div");

    renderKitchenAppShell(root);

    expect(root.querySelector("[data-margin-footer]")).not.toBeNull();
    expect(root.querySelector("[data-recent-activity]")).not.toBeNull();
    expect(root.querySelector("[data-bottom-views]")).toBeNull();
    expect(root.querySelector("[data-open-bom-panel]")).toBeNull();
    expect(root.querySelector(".archux-sheet")).toBeNull();
  });
});
