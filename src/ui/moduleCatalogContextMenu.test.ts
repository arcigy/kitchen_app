// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createContextMenuController } from "./contextMenu";
import { registerModuleCatalogContextMenu } from "./moduleCatalogContextMenu";

describe("module catalog context menu", () => {
  it("places the exact catalog module and explains a blocked catalog", async () => {
    const host = document.createElement("section");
    const moduleButton = document.createElement("button");
    moduleButton.dataset.moduleType = "base_cabinet";
    const place = vi.fn();
    moduleButton.addEventListener("click", place);
    host.append(moduleButton);
    document.body.append(host);
    const menu = createContextMenuController({ document, window });
    const unregister = registerModuleCatalogContextMenu(host, menu);

    moduleButton.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    document.querySelector<HTMLButtonElement>("[data-context-menu-action='catalog-place-module']")?.click();
    await Promise.resolve();
    expect(place).toHaveBeenCalledOnce();

    moduleButton.disabled = true;
    moduleButton.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const blocked = document.querySelector<HTMLButtonElement>("[data-context-menu-action='catalog-place-module']");
    expect(blocked?.disabled).toBe(true);
    expect(blocked?.title).toBe("Open a kitchen for editing first.");
    unregister();
    menu.destroy();
  });
});
