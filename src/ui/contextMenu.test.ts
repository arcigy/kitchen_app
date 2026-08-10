// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createContextMenuController } from "./contextMenu";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("context menu controller", () => {
  it("delegates a right click to the closest registered owner and executes its action", async () => {
    const owner = document.createElement("div");
    const child = document.createElement("span");
    owner.append(child);
    document.body.append(owner);
    const execute = vi.fn();
    const controller = createContextMenuController({ document, window });
    controller.register(owner, () => [{ id: "properties", label: "Properties", execute }]);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 });
    child.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    const action = document.querySelector<HTMLButtonElement>("[data-context-menu-action='properties']");
    expect(action?.textContent).toContain("Properties");
    action?.click();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledOnce();
    expect(controller.isOpen()).toBe(false);
    controller.destroy();
  });

  it("keeps the native browser menu for editable controls", () => {
    const owner = document.createElement("div");
    const input = document.createElement("input");
    owner.append(input);
    document.body.append(owner);
    const resolver = vi.fn(() => [{ id: "ignored", label: "Ignored", execute: vi.fn() }]);
    const controller = createContextMenuController({ document, window });
    controller.register(owner, resolver);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("supports keyboard opening, disabled reasons, and keyboard activation", async () => {
    const owner = document.createElement("button");
    document.body.append(owner);
    owner.focus();
    const execute = vi.fn();
    const controller = createContextMenuController({ document, window });
    controller.register(owner, () => [
      { id: "blocked", label: "Move", disabledReason: "Finish the active tool first", execute: vi.fn() },
      { id: "properties", label: "Properties", execute }
    ]);

    owner.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true }));
    const blocked = document.querySelector<HTMLButtonElement>("[data-context-menu-action='blocked']");
    const properties = document.querySelector<HTMLButtonElement>("[data-context-menu-action='properties']");
    expect(blocked?.disabled).toBe(true);
    expect(blocked?.title).toBe("Finish the active tool first");
    expect(properties).toBe(document.activeElement);
    properties?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(execute).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it("normalizes duplicate separators and hides empty submenus", () => {
    const owner = document.createElement("div");
    document.body.append(owner);
    const controller = createContextMenuController({ document, window });
    controller.register(owner, () => [
      { type: "separator", id: "leading" },
      { id: "one", label: "One", execute: vi.fn() },
      { type: "separator", id: "first" },
      { type: "separator", id: "second" },
      { type: "submenu", id: "empty", label: "Empty", items: [] },
      { type: "separator", id: "trailing" }
    ]);

    owner.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(document.querySelectorAll(".arcigy-context-menu__separator")).toHaveLength(0);
    expect(document.querySelector("[data-context-menu-submenu='empty']")).toBeNull();
    controller.destroy();
  });
});
